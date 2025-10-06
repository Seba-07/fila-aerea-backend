import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { Flight, Aircraft, Ticket, EventLog } from '../models';
import { logger } from '../utils/logger';
import { getIO } from '../sockets';

export const getFlights = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { estado } = req.query;

    const filter: any = {};
    if (estado) {
      if (Array.isArray(estado)) {
        filter.estado = { $in: estado };
      } else {
        filter.estado = estado;
      }
    } else {
      // Por defecto mostrar vuelos abiertos y en vuelo (no finalizados ni reprogramados)
      filter.estado = { $in: ['abierto', 'en_vuelo'] };
    }

    const flights = await Flight.find(filter)
      .populate('aircraftId', 'matricula modelo capacidad')
      .sort({ fecha_hora: 1 })
      .lean();

    // Obtener pasajeros inscritos para cada vuelo
    const flightsWithData = await Promise.all(
      flights.map(async (flight) => {
        const tickets = await Ticket.find({
          flightId: flight._id,
          estado: { $in: ['asignado', 'inscrito', 'volado'] }
        }).populate('userId', 'nombre email');

        const pasajeros = tickets.map(t => ({
          ticketId: t._id,
          pasajeros: t.pasajeros,
          usuario: {
            nombre: (t.userId as any)?.nombre,
            email: (t.userId as any)?.email,
          },
          estado: t.estado,
        }));

        return {
          ...flight,
          asientos_disponibles: flight.capacidad_total - flight.asientos_ocupados,
          pasajeros_inscritos: pasajeros,
        };
      })
    );

    res.json(flightsWithData);
  } catch (error: any) {
    logger.error('Error en getFlights:', error);
    res.status(500).json({ error: 'Error al obtener vuelos' });
  }
};

export const getFlightById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const flight = await Flight.findById(id)
      .populate('aircraftId', 'matricula modelo capacidad')
      .lean();

    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    const asientos_disponibles = flight.capacidad_total - flight.asientos_ocupados;

    res.json({
      ...flight,
      asientos_disponibles,
    });
  } catch (error: any) {
    logger.error('Error en getFlightById:', error);
    res.status(500).json({ error: 'Error al obtener vuelo' });
  }
};

export const updateFlightStatus = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { estado } = req.body;

    const flight = await Flight.findById(id);
    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    flight.estado = estado;
    await flight.save();

    await EventLog.create({
      type: 'flight_status_updated',
      entity: 'flight',
      entityId: flight._id.toString(),
      userId: req.user?.userId,
      payload: { estado },
    });

    const io = getIO();
    io.emit('flightUpdated', {
      flightId: flight._id,
      estado: flight.estado,
    });

    res.json({ message: 'Estado actualizado', flight });
  } catch (error: any) {
    logger.error('Error en updateFlightStatus:', error);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
};

export const updateFlightCapacity = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const { capacidad_total } = req.body;

    if (!capacidad_total || capacidad_total < 1) {
      res.status(400).json({ error: 'Capacidad debe ser mayor a 0' });
      return;
    }

    const flight = await Flight.findById(id);
    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    if (capacidad_total < flight.asientos_ocupados) {
      res.status(400).json({
        error: `No se puede reducir la capacidad a ${capacidad_total}. Ya hay ${flight.asientos_ocupados} asientos ocupados.`,
      });
      return;
    }

    const oldCapacity = flight.capacidad_total;
    flight.capacidad_total = capacidad_total;
    await flight.save();

    await EventLog.create({
      type: 'flight_capacity_updated',
      entity: 'flight',
      entityId: flight._id.toString(),
      userId: req.user?.userId,
      payload: { old_capacity: oldCapacity, new_capacity: capacidad_total },
    });

    const io = getIO();
    io.emit('flightUpdated', {
      flightId: flight._id,
      capacidad_total: flight.capacidad_total,
    });

    res.json({ message: 'Capacidad actualizada', flight });
  } catch (error: any) {
    logger.error('Error en updateFlightCapacity:', error);
    res.status(500).json({ error: 'Error al actualizar capacidad' });
  }
};

export const rescheduleFlightToNextTanda = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const flight = await Flight.findById(id).populate('aircraftId');
    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    // Verificar que el vuelo esté abierto
    if (flight.estado !== 'abierto') {
      res.status(400).json({
        error: 'Solo se pueden reprogramar vuelos en estado abierto',
      });
      return;
    }

    const aircraftId = flight.aircraftId;
    const tandaActual = flight.numero_tanda;

    // Buscar la siguiente tanda (sin importar el avión)
    const anyNextTanda = await Flight.findOne({
      numero_tanda: { $gt: tandaActual },
      estado: 'abierto',
    }).sort({ numero_tanda: 1 });

    if (!anyNextTanda) {
      res.status(404).json({
        error: 'No hay tandas siguientes disponibles',
      });
      return;
    }

    const tandaSiguiente = anyNextTanda.numero_tanda;

    // Verificar si este avión ya tiene un vuelo en la siguiente tanda
    let nextTandaFlight = await Flight.findOne({
      aircraftId,
      numero_tanda: tandaSiguiente,
      estado: 'abierto',
    });

    // Si no existe, crear el vuelo para este avión en la siguiente tanda
    if (!nextTandaFlight) {
      const { Aircraft } = await import('../models');
      const aircraft = await Aircraft.findById(aircraftId);

      if (!aircraft) {
        res.status(404).json({ error: 'Avión no encontrado' });
        return;
      }

      nextTandaFlight = await Flight.create({
        aircraftId,
        numero_tanda: tandaSiguiente,
        fecha_hora: anyNextTanda.fecha_hora,
        capacidad_total: aircraft.capacidad,
        asientos_ocupados: 0,
        estado: 'abierto',
      });
    }

    // Obtener todos los pasajeros del vuelo actual
    const { Ticket } = await import('../models');
    const ticketsAfectados = await Ticket.find({
      flightId: flight._id,
      estado: { $in: ['asignado', 'inscrito'] },
    }).populate('userId');

    // Verificar que la siguiente tanda tenga espacio
    const asientosNecesarios = flight.asientos_ocupados;
    const asientosDisponiblesDestino = nextTandaFlight.capacidad_total - nextTandaFlight.asientos_ocupados;

    if (asientosDisponiblesDestino < asientosNecesarios) {
      res.status(400).json({
        error: `La tanda ${tandaSiguiente} no tiene suficiente espacio. Necesitas ${asientosNecesarios} asientos pero solo hay ${asientosDisponiblesDestino} disponibles.`,
      });
      return;
    }

    // Marcar tickets con reprogramación pendiente
    for (const ticket of ticketsAfectados) {
      ticket.reprogramacion_pendiente = {
        nuevo_flightId: nextTandaFlight._id as any,
        numero_tanda_anterior: tandaActual,
        numero_tanda_nueva: tandaSiguiente,
        fecha_reprogramacion: new Date(),
      };
      await ticket.save();

      // Crear notificación para el pasajero
      const { Notification } = await import('../models');
      await Notification.create({
        userId: ticket.userId,
        tipo: 'reprogramacion',
        titulo: 'Vuelo Reprogramado',
        mensaje: `Tu vuelo de la tanda ${tandaActual} ha sido reprogramado a la tanda ${tandaSiguiente}. Por favor acepta o rechaza la reprogramación.`,
        metadata: {
          ticketId: ticket._id.toString(),
          tanda_anterior: tandaActual,
          tanda_nueva: tandaSiguiente,
        },
      });
    }

    // Marcar vuelo como reprogramado (pero no mover pasajeros aún)
    flight.estado = 'reprogramado';
    await flight.save();

    await EventLog.create({
      type: 'flight_rescheduled',
      entity: 'flight',
      entityId: flight._id.toString(),
      userId: req.user?.userId,
      payload: {
        tanda_anterior: tandaActual,
        tanda_nueva: tandaSiguiente,
        pasajeros_afectados: ticketsAfectados.length,
      },
    });

    const io = getIO();
    io.emit('flightRescheduled', {
      flightId: flight._id,
      tanda_anterior: tandaActual,
      tanda_nueva: tandaSiguiente,
    });

    res.json({
      message: 'Vuelo reprogramado exitosamente',
      pasajeros_afectados: ticketsAfectados.length,
      tanda_nueva: tandaSiguiente,
      tickets: ticketsAfectados.map(t => ({
        ticketId: t._id,
        pasajero: t.pasajeros[0]?.nombre,
        usuario: (t.userId as any).nombre,
      })),
    });
  } catch (error: any) {
    logger.error('Error en rescheduleFlight:', error);
    res.status(500).json({ error: 'Error al reprogramar vuelo' });
  }
};

export const deleteFlight = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    const flight = await Flight.findById(id);
    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    // Verificar que el vuelo no tenga pasajeros
    if (flight.asientos_ocupados > 0) {
      res.status(400).json({
        error: 'No se puede eliminar un vuelo con pasajeros inscritos',
      });
      return;
    }

    await Flight.findByIdAndDelete(id);

    await EventLog.create({
      type: 'flight_deleted',
      entity: 'flight',
      entityId: id,
      userId: req.user?.userId,
      payload: {
        numero_tanda: flight.numero_tanda,
        aircraftId: flight.aircraftId,
      },
    });

    const io = getIO();
    io.emit('flightDeleted', { flightId: id });

    res.json({ message: 'Vuelo eliminado exitosamente' });
  } catch (error: any) {
    logger.error('Error en deleteFlight:', error);
    res.status(500).json({ error: 'Error al eliminar vuelo' });
  }
};
