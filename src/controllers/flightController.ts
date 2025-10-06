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
    const { razon } = req.body;

    if (!razon || !['combustible', 'meteorologia', 'mantenimiento'].includes(razon)) {
      res.status(400).json({
        error: 'Debes especificar una razón válida: combustible, meteorologia o mantenimiento',
      });
      return;
    }

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

    let tandaSiguiente = anyNextTanda.numero_tanda;
    let nuevaTandaCreada = false;
    let tandaDesplazada = null;

    // Verificar si este avión ya tiene un vuelo en la siguiente tanda
    let nextTandaFlight = await Flight.findOne({
      aircraftId,
      numero_tanda: tandaSiguiente,
      estado: 'abierto',
    });

    // Si el avión ya existe en la siguiente tanda, mover ese vuelo a una nueva tanda
    if (nextTandaFlight && nextTandaFlight.asientos_ocupados === 0) {
      const { Aircraft, Ticket } = await import('../models');
      const aircraft = await Aircraft.findById(aircraftId);

      if (!aircraft) {
        res.status(404).json({ error: 'Avión no encontrado' });
        return;
      }

      // Buscar la tanda más alta para crear la siguiente
      const maxTandaFlight = await Flight.findOne().sort({ numero_tanda: -1 });
      const nuevaTandaNum = maxTandaFlight ? maxTandaFlight.numero_tanda + 1 : tandaSiguiente + 1;

      // Calcular fecha para la nueva tanda (1 hora después de la última tanda)
      const lastTandaDate = maxTandaFlight ? maxTandaFlight.fecha_hora : anyNextTanda.fecha_hora;
      const nuevaFecha = new Date(lastTandaDate);
      nuevaFecha.setHours(nuevaFecha.getHours() + 1);

      const oldFlightId = nextTandaFlight._id;
      const oldTandaNum = nextTandaFlight.numero_tanda;

      // Mover el vuelo existente a la nueva tanda
      nextTandaFlight.numero_tanda = nuevaTandaNum;
      nextTandaFlight.fecha_hora = nuevaFecha;
      await nextTandaFlight.save();

      // Mover también los pasajeros de ese vuelo (si los hay)
      const ticketsDesplazados = await Ticket.find({
        flightId: oldFlightId,
        estado: { $in: ['asignado', 'inscrito'] },
      }).populate('userId');

      // Mover automáticamente a los pasajeros desplazados
      for (const ticket of ticketsDesplazados) {
        // Actualizar flightId al vuelo movido (que ahora está en la nueva tanda)
        ticket.flightId = nextTandaFlight._id as any;
        ticket.reprogramacion_pendiente = {
          nuevo_flightId: nextTandaFlight._id as any,
          numero_tanda_anterior: oldTandaNum,
          numero_tanda_nueva: nuevaTandaNum,
          fecha_reprogramacion: new Date(),
        };
        await ticket.save();

        // Notificar al pasajero desplazado
        const { Notification } = await import('../models');
        await Notification.create({
          userId: ticket.userId,
          tipo: 'reprogramacion',
          titulo: 'Vuelo Reprogramado en Cascada',
          mensaje: `Tu vuelo de la tanda ${oldTandaNum} ha sido reprogramado automáticamente a la tanda ${nuevaTandaNum} debido a ajustes en la programación.`,
          metadata: {
            ticketId: ticket._id.toString(),
            tanda_anterior: oldTandaNum,
            tanda_nueva: nuevaTandaNum,
          },
        });

        // Enviar push notification al dispositivo móvil
        const { sendPushNotification } = await import('../services/pushNotification');
        await sendPushNotification(
          ticket.userId.toString(),
          '✈️ Vuelo Reprogramado',
          `Tu vuelo de la tanda ${oldTandaNum} ha sido reprogramado a la tanda ${nuevaTandaNum}.`,
          {
            ticketId: ticket._id.toString(),
            tanda_anterior: oldTandaNum,
            tanda_nueva: nuevaTandaNum,
          }
        );

        logger.info(`Ticket ${ticket._id} desplazado de tanda ${oldTandaNum} a ${nuevaTandaNum}`);
      }

      logger.info(`Vuelo desplazado de tanda ${oldTandaNum} a ${nuevaTandaNum} con ${ticketsDesplazados.length} pasajeros`);

      nuevaTandaCreada = true;
      tandaDesplazada = {
        numero_tanda: nuevaTandaNum,
        matricula: aircraft.matricula,
      };

      // Ahora crear el vuelo para el avión actual en la tanda siguiente
      nextTandaFlight = await Flight.create({
        aircraftId,
        numero_tanda: tandaSiguiente,
        fecha_hora: anyNextTanda.fecha_hora,
        capacidad_total: aircraft.capacidad,
        asientos_ocupados: 0,
        estado: 'abierto',
      });
    } else if (!nextTandaFlight) {
      // Si no existe, crear el vuelo para este avión en la siguiente tanda
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

    // Mover pasajeros automáticamente al nuevo vuelo
    for (const ticket of ticketsAfectados) {
      // Actualizar el flightId al nuevo vuelo
      ticket.flightId = nextTandaFlight._id as any;
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
        mensaje: `Tu vuelo de la tanda ${tandaActual} ha sido reprogramado automáticamente a la tanda ${tandaSiguiente}.`,
        metadata: {
          ticketId: ticket._id.toString(),
          tanda_anterior: tandaActual,
          tanda_nueva: tandaSiguiente,
        },
      });

      // Enviar push notification al dispositivo móvil
      const { sendPushNotification } = await import('../services/pushNotification');
      await sendPushNotification(
        ticket.userId.toString(),
        '✈️ Vuelo Reprogramado',
        `Tu vuelo de la tanda ${tandaActual} ha sido reprogramado a la tanda ${tandaSiguiente}.`,
        {
          ticketId: ticket._id.toString(),
          tanda_anterior: tandaActual,
          tanda_nueva: tandaSiguiente,
        }
      );

      logger.info(`Ticket ${ticket._id} movido de tanda ${tandaActual} a ${tandaSiguiente}`);
    }

    // Actualizar contadores de asientos
    nextTandaFlight.asientos_ocupados += ticketsAfectados.length;
    await nextTandaFlight.save();

    flight.asientos_ocupados = 0; // Resetear contador del vuelo viejo
    flight.estado = 'reprogramado';
    flight.razon_reprogramacion = razon;
    await flight.save();

    logger.info(`${ticketsAfectados.length} pasajeros movidos de tanda ${tandaActual} a ${tandaSiguiente}`);

    // Si la razón es combustible, crear notificación de reabastecimiento para staff
    if (razon === 'combustible') {
      const { User, Notification } = await import('../models');
      const staffUsers = await User.find({ rol: 'staff' });

      const aircraft = await import('../models').then(m => m.Aircraft.findById(aircraftId));

      // Convertir ObjectId a string correctamente
      const aircraftIdString = String(aircraftId);

      for (const staffUser of staffUsers) {
        await Notification.create({
          userId: staffUser._id,
          tipo: 'reabastecimiento_pendiente',
          titulo: 'Reabastecimiento Pendiente',
          mensaje: `El avión ${aircraft?.matricula} fue reprogramado por falta de combustible. Debes registrar el reabastecimiento en el sistema.`,
          metadata: {
            aircraftId: aircraftIdString,
            flightId: String(flight._id),
            matricula: aircraft?.matricula,
            razon: 'combustible',
          },
        });
      }
    }

    await EventLog.create({
      type: 'flight_rescheduled',
      entity: 'flight',
      entityId: flight._id.toString(),
      userId: req.user?.userId,
      payload: {
        tanda_anterior: tandaActual,
        tanda_nueva: tandaSiguiente,
        pasajeros_afectados: ticketsAfectados.length,
        nueva_tanda_creada: nuevaTandaCreada,
        tanda_desplazada: tandaDesplazada,
      },
    });

    const io = getIO();
    io.emit('flightRescheduled', {
      flightId: flight._id,
      tanda_anterior: tandaActual,
      tanda_nueva: tandaSiguiente,
      nueva_tanda_creada: nuevaTandaCreada,
      tanda_desplazada: tandaDesplazada,
    });

    let message = 'Vuelo reprogramado exitosamente';
    if (nuevaTandaCreada && tandaDesplazada) {
      message += `. Se creó la Tanda #${tandaDesplazada.numero_tanda} con el vuelo ${tandaDesplazada.matricula} que estaba en la Tanda #${tandaSiguiente}`;
    }
    if (razon === 'combustible') {
      message += '. IMPORTANTE: Debes registrar el reabastecimiento del avión en el sistema.';
    }

    res.json({
      message,
      pasajeros_afectados: ticketsAfectados.length,
      tanda_nueva: tandaSiguiente,
      nueva_tanda_creada: nuevaTandaCreada,
      tanda_desplazada: tandaDesplazada,
      requiere_reabastecimiento: razon === 'combustible',
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

export const cancelAircraftForDay = async (
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

    const aircraftId = flight.aircraftId;
    const tandaActual = flight.numero_tanda;

    // Buscar todos los vuelos del mismo avión en tandas futuras (mismo día o posteriores)
    const futureFlights = await Flight.find({
      aircraftId,
      numero_tanda: { $gte: tandaActual },
      estado: 'abierto',
    }).sort({ numero_tanda: 1 });

    if (futureFlights.length === 0) {
      res.status(404).json({ error: 'No hay vuelos futuros para cancelar' });
      return;
    }

    // Obtener todos los tickets afectados de todos los vuelos
    const { Ticket, Notification } = await import('../models');
    let totalTicketsAfectados = 0;

    for (const futFlight of futureFlights) {
      const ticketsAfectados = await Ticket.find({
        flightId: futFlight._id,
        estado: { $in: ['asignado', 'inscrito'] },
      }).populate('userId');

      // Liberar tickets
      for (const ticket of ticketsAfectados) {
        ticket.estado = 'disponible';
        ticket.flightId = undefined;
        await ticket.save();

        // Notificar al pasajero
        await Notification.create({
          userId: ticket.userId,
          tipo: 'cancelacion',
          titulo: 'Vuelo Cancelado',
          mensaje: `El avión ${(aircraftId as any).matricula} ha sido cancelado para el resto del día. Tu ticket ha sido liberado y puedes inscribirte en otro vuelo.`,
          metadata: {
            ticketId: ticket._id.toString(),
            tanda_cancelada: futFlight.numero_tanda,
            avion: (aircraftId as any).matricula,
          },
        });

        totalTicketsAfectados++;
      }

      // Marcar vuelo como cancelado
      futFlight.estado = 'cancelado';
      futFlight.razon_reprogramacion = 'cancelacion_dia';
      futFlight.asientos_ocupados = 0;
      await futFlight.save();
    }

    await EventLog.create({
      type: 'aircraft_cancelled_for_day',
      entity: 'flight',
      entityId: flight._id.toString(),
      userId: req.user?.userId,
      payload: {
        aircraftId: String(aircraftId),
        vuelos_cancelados: futureFlights.length,
        pasajeros_afectados: totalTicketsAfectados,
      },
    });

    const io = getIO();
    io.emit('aircraftCancelledForDay', {
      aircraftId,
      vuelos_cancelados: futureFlights.map(f => f._id),
    });

    res.json({
      message: `Avión cancelado por el día. ${futureFlights.length} vuelo(s) cancelado(s)`,
      vuelos_cancelados: futureFlights.length,
      pasajeros_afectados: totalTicketsAfectados,
    });
  } catch (error: any) {
    logger.error('Error en cancelAircraftForDay:', error);
    res.status(500).json({ error: 'Error al cancelar avión' });
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
