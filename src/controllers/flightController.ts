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
      // Por defecto mostrar solo vuelos abiertos
      filter.estado = { $in: ['abierto', 'programado'] };
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
