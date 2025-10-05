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

    const flightsWithAvailability = flights.map((flight) => ({
      ...flight,
      asientos_disponibles: flight.capacidad_total - flight.asientos_ocupados,
    }));

    res.json(flightsWithAvailability);
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
