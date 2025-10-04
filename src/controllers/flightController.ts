import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { Flight, Aircraft, Seat, Ticket, EventLog } from '../models';
import { logger } from '../utils/logger';
import { getIO } from '../sockets';
import { pushService } from '../services/pushService';
import mongoose from 'mongoose';

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
      // Por defecto mostrar solo vuelos abiertos y boarding
      filter.estado = { $in: ['abierto', 'boarding'] };
    }

    const flights = await Flight.find(filter)
      .populate('aircraftId', 'alias seats')
      .sort({ fechaHoraProg: 1 })
      .lean();

    // Contar asientos libres por vuelo
    const flightsWithSeats = await Promise.all(
      flights.map(async (flight) => {
        const seatsCount = await Seat.countDocuments({
          flightId: flight._id,
          status: 'libre',
        });

        return {
          ...flight,
          asientosLibres: seatsCount,
        };
      })
    );

    res.json(flightsWithSeats);
  } catch (error: any) {
    logger.error('Error en getFlights:', error);
    res.status(500).json({ error: 'Error al obtener vuelos' });
  }
};

export const getFlightById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const flight = await Flight.findById(id).populate('aircraftId', 'alias seats').lean();

    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    // Obtener todos los asientos
    const seats = await Seat.find({ flightId: id })
      .select('seatNumber status hold_expires_at')
      .lean();

    res.json({
      ...flight,
      seats,
    });
  } catch (error: any) {
    logger.error('Error en getFlightById:', error);
    res.status(500).json({ error: 'Error al obtener vuelo' });
  }
};

export const createFlight = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { aircraftId, fechaHoraProg, zona, puerta, turno_max_permitido, notas } = req.body;

    if (!aircraftId || !fechaHoraProg) {
      res.status(400).json({ error: 'aircraftId y fechaHoraProg son obligatorios' });
      return;
    }

    // Verificar que el avión existe
    const aircraft = await Aircraft.findById(aircraftId);
    if (!aircraft) {
      res.status(404).json({ error: 'Avión no encontrado' });
      return;
    }

    const flight = await Flight.create({
      aircraftId,
      fechaHoraProg: new Date(fechaHoraProg),
      estado: 'draft',
      zona: zona || 'A',
      puerta,
      turno_max_permitido: turno_max_permitido || 0,
      notas,
    });

    // Crear asientos automáticamente
    const seatNumbers = generateSeatNumbers(aircraft.seats);
    const seats = seatNumbers.map((seatNumber) => ({
      flightId: flight._id,
      seatNumber,
      status: 'libre' as const,
    }));

    await Seat.insertMany(seats);

    await EventLog.create({
      type: 'flight_created',
      entity: 'flight',
      entityId: flight._id.toString(),
      userId: req.user?.userId,
      payload: { aircraftId, zona, turno_max_permitido },
    });

    res.status(201).json(flight);
  } catch (error: any) {
    logger.error('Error en createFlight:', error);
    res.status(500).json({ error: 'Error al crear vuelo' });
  }
};

export const updateFlight = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { estado, zona, puerta, turno_max_permitido, fechaHoraProg, notas } = req.body;

    const flight = await Flight.findById(id);
    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    const oldEstado = flight.estado;
    const oldZona = flight.zona;
    const oldTurno = flight.turno_max_permitido;

    if (estado !== undefined) flight.estado = estado;
    if (zona !== undefined) flight.zona = zona;
    if (puerta !== undefined) flight.puerta = puerta;
    if (turno_max_permitido !== undefined) flight.turno_max_permitido = turno_max_permitido;
    if (fechaHoraProg !== undefined) flight.fechaHoraProg = new Date(fechaHoraProg);
    if (notas !== undefined) flight.notas = notas;

    await flight.save();

    // Log cambio
    await EventLog.create({
      type: 'flight_updated',
      entity: 'flight',
      entityId: flight._id.toString(),
      userId: req.user?.userId,
      payload: { estado, zona, turno_max_permitido, oldEstado, oldZona, oldTurno },
    });

    // Emitir evento de tiempo real
    const io = getIO();
    io.to(`flight:${id}`).emit('flightUpdated', flight);

    // Notificaciones push
    if (estado === 'boarding' && oldEstado !== 'boarding') {
      // Enviar push a todos los pasajeros con asientos confirmados
      const confirmedSeats = await Seat.find({
        flightId: id,
        status: { $in: ['confirmado', 'embarcado'] },
      }).populate('ticketId');

      for (const seat of confirmedSeats) {
        if (seat.ticketId) {
          const ticket = seat.ticketId as any;
          await pushService.sendBoardingNotification(
            ticket.userId.toString(),
            id,
            flight.zona
          );
        }
      }
    }

    if (zona !== undefined && zona !== oldZona) {
      // Cambio de zona
      const confirmedSeats = await Seat.find({
        flightId: id,
        status: { $in: ['confirmado', 'embarcado'] },
      }).populate('ticketId');

      for (const seat of confirmedSeats) {
        if (seat.ticketId) {
          const ticket = seat.ticketId as any;
          await pushService.sendChangeNotification(
            ticket.userId.toString(),
            id,
            'zona',
            `Tu vuelo ha cambiado a zona ${zona}`
          );
        }
      }
    }

    res.json(flight);
  } catch (error: any) {
    logger.error('Error en updateFlight:', error);
    res.status(500).json({ error: 'Error al actualizar vuelo' });
  }
};

export const closeFlight = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const flight = await Flight.findById(id);
    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    // Marcar como no_show a los confirmados no escaneados
    const noShowSeats = await Seat.find({
      flightId: id,
      status: 'confirmado',
    });

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      for (const seat of noShowSeats) {
        seat.status = 'no_show';
        await seat.save({ session });

        // Aplicar cooldown de 30 min al ticket
        if (seat.ticketId) {
          await Ticket.findByIdAndUpdate(
            seat.ticketId,
            {
              cooldownUntil: new Date(Date.now() + 30 * 60 * 1000),
            },
            { session }
          );
        }
      }

      flight.estado = 'cerrado';
      await flight.save({ session });

      await session.commitTransaction();

      await EventLog.create({
        type: 'flight_closed',
        entity: 'flight',
        entityId: flight._id.toString(),
        userId: req.user?.userId,
        payload: { noShowCount: noShowSeats.length },
      });

      res.json({ message: 'Vuelo cerrado', noShowCount: noShowSeats.length });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error('Error en closeFlight:', error);
    res.status(500).json({ error: 'Error al cerrar vuelo' });
  }
};

// Helper: genera números de asiento (A1, A2, B1, B2...)
function generateSeatNumbers(totalSeats: number): string[] {
  const seats: string[] = [];
  const rows = Math.ceil(totalSeats / 2);

  for (let row = 1; row <= rows; row++) {
    seats.push(`A${row}`);
    if (seats.length < totalSeats) {
      seats.push(`B${row}`);
    }
  }

  return seats.slice(0, totalSeats);
}
