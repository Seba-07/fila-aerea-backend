import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { Seat, Flight, Ticket, BoardingPass, EventLog } from '../models';
import { logger } from '../utils/logger';
import { getIO } from '../sockets';
import { generateQRToken } from '../utils/jwt';
import mongoose from 'mongoose';

export const holdSeat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: flightId } = req.params;
    const { seatNumber } = req.body;
    const userId = req.user?.userId;

    if (!seatNumber) {
      res.status(400).json({ error: 'seatNumber es obligatorio' });
      return;
    }

    // Obtener ticket del usuario
    const ticket = await Ticket.findOne({ userId, estado: 'activo' });
    if (!ticket) {
      res.status(404).json({ error: 'No tienes un ticket activo' });
      return;
    }

    // Verificar cooldown
    if (ticket.cooldownUntil && ticket.cooldownUntil > new Date()) {
      res.status(403).json({
        error: 'Tienes un cooldown activo por no-show',
        cooldownUntil: ticket.cooldownUntil,
      });
      return;
    }

    // Validar límite de cambios (max 2/hora)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    if (
      ticket.seatChanges >= 2 &&
      ticket.lastSeatChangeAt &&
      ticket.lastSeatChangeAt > oneHourAgo
    ) {
      res.status(429).json({
        error: 'Has alcanzado el límite de cambios de asiento por hora',
        retryAfter: ticket.lastSeatChangeAt,
      });
      return;
    }

    // Obtener vuelo
    const flight = await Flight.findById(flightId);
    if (!flight) {
      res.status(404).json({ error: 'Vuelo no encontrado' });
      return;
    }

    if (flight.estado !== 'abierto') {
      res.status(400).json({ error: 'El vuelo no está abierto para reservas' });
      return;
    }

    // Validar turno
    if (ticket.turno_global > flight.turno_max_permitido) {
      res.status(403).json({
        error: 'Tu turno aún no está habilitado para este vuelo',
        turno_global: ticket.turno_global,
        turno_max_permitido: flight.turno_max_permitido,
      });
      return;
    }

    // Verificar si ya tiene asiento en este vuelo
    const existingSeat = await Seat.findOne({
      flightId,
      ticketId: ticket._id,
      status: { $in: ['hold', 'confirmado', 'embarcado'] },
    });

    if (existingSeat) {
      res.status(400).json({
        error: 'Ya tienes un asiento en este vuelo',
        seatNumber: existingSeat.seatNumber,
      });
      return;
    }

    // Obtener asiento
    const seat = await Seat.findOne({
      flightId,
      seatNumber: seatNumber.toUpperCase(),
    });

    if (!seat) {
      res.status(404).json({ error: 'Asiento no encontrado' });
      return;
    }

    if (seat.status !== 'libre') {
      res.status(409).json({ error: 'El asiento no está disponible' });
      return;
    }

    // Reservar (hold) por 5 minutos
    seat.status = 'hold';
    seat.ticketId = ticket._id;
    seat.hold_expires_at = new Date(Date.now() + 5 * 60 * 1000);
    await seat.save();

    // Incrementar contador de cambios si aplica
    if (!ticket.lastSeatChangeAt || ticket.lastSeatChangeAt < oneHourAgo) {
      ticket.seatChanges = 1;
    } else {
      ticket.seatChanges += 1;
    }
    ticket.lastSeatChangeAt = new Date();
    await ticket.save();

    await EventLog.create({
      type: 'seat_hold',
      entity: 'seat',
      entityId: seat._id.toString(),
      userId,
      payload: { flightId, seatNumber, ticketId: ticket._id.toString() },
    });

    // Emitir evento en tiempo real
    const io = getIO();
    io.to(`flight:${flightId}`).emit('seatUpdated', {
      flightId,
      seatNumber: seat.seatNumber,
      status: seat.status,
    });

    res.json({
      message: 'Asiento reservado por 5 minutos',
      seat: {
        seatNumber: seat.seatNumber,
        status: seat.status,
        hold_expires_at: seat.hold_expires_at,
      },
    });
  } catch (error: any) {
    logger.error('Error en holdSeat:', error);
    res.status(500).json({ error: 'Error al reservar asiento' });
  }
};

export const confirmSeat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: flightId } = req.params;
    const { seatNumber } = req.body;
    const userId = req.user?.userId;

    if (!seatNumber) {
      res.status(400).json({ error: 'seatNumber es obligatorio' });
      return;
    }

    // Obtener ticket del usuario
    const ticket = await Ticket.findOne({ userId, estado: 'activo' });
    if (!ticket) {
      res.status(404).json({ error: 'No tienes un ticket activo' });
      return;
    }

    // Obtener asiento
    const seat = await Seat.findOne({
      flightId,
      seatNumber: seatNumber.toUpperCase(),
    });

    if (!seat) {
      res.status(404).json({ error: 'Asiento no encontrado' });
      return;
    }

    if (seat.status !== 'hold') {
      res.status(400).json({ error: 'El asiento debe estar en estado hold' });
      return;
    }

    if (seat.ticketId?.toString() !== ticket._id.toString()) {
      res.status(403).json({ error: 'Este asiento no está reservado para ti' });
      return;
    }

    // Verificar que no expiró el hold
    if (seat.hold_expires_at && seat.hold_expires_at < new Date()) {
      seat.status = 'libre';
      seat.ticketId = undefined;
      seat.hold_expires_at = undefined;
      await seat.save();

      res.status(410).json({ error: 'La reserva ha expirado' });
      return;
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Confirmar asiento
      seat.status = 'confirmado';
      seat.hold_expires_at = undefined;
      await seat.save({ session });

      // Generar boarding pass
      const qr_token = generateQRToken({
        boarding_pass_id: new mongoose.Types.ObjectId().toString(),
        ticket_id: ticket._id.toString(),
        flight_id: flightId,
        seatNumber: seat.seatNumber,
      });

      const boardingPass = await BoardingPass.create(
        [
          {
            ticketId: ticket._id,
            flightId,
            seatNumber: seat.seatNumber,
            qr_token,
            estado: 'emitido',
          },
        ],
        { session }
      );

      await session.commitTransaction();

      await EventLog.create({
        type: 'seat_confirmed',
        entity: 'seat',
        entityId: seat._id.toString(),
        userId,
        payload: {
          flightId,
          seatNumber: seat.seatNumber,
          ticketId: ticket._id.toString(),
          boardingPassId: boardingPass[0]._id.toString(),
        },
      });

      // Emitir evento en tiempo real
      const io = getIO();
      io.to(`flight:${flightId}`).emit('seatUpdated', {
        flightId,
        seatNumber: seat.seatNumber,
        status: seat.status,
      });

      res.json({
        message: 'Asiento confirmado',
        boardingPass: {
          id: boardingPass[0]._id,
          qr_token: boardingPass[0].qr_token,
          seatNumber: seat.seatNumber,
        },
      });
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  } catch (error: any) {
    logger.error('Error en confirmSeat:', error);
    res.status(500).json({ error: 'Error al confirmar asiento' });
  }
};

export const releaseSeat = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: flightId } = req.params;
    const { seatNumber } = req.body;

    const seat = await Seat.findOne({
      flightId,
      seatNumber: seatNumber.toUpperCase(),
    });

    if (!seat) {
      res.status(404).json({ error: 'Asiento no encontrado' });
      return;
    }

    if (seat.status === 'libre') {
      res.status(400).json({ error: 'El asiento ya está libre' });
      return;
    }

    const oldTicketId = seat.ticketId;

    seat.status = 'libre';
    seat.ticketId = undefined;
    seat.hold_expires_at = undefined;
    await seat.save();

    await EventLog.create({
      type: 'seat_released',
      entity: 'seat',
      entityId: seat._id.toString(),
      userId: req.user?.userId,
      payload: { flightId, seatNumber, oldTicketId: oldTicketId?.toString() },
    });

    // Emitir evento en tiempo real
    const io = getIO();
    io.to(`flight:${flightId}`).emit('seatUpdated', {
      flightId,
      seatNumber: seat.seatNumber,
      status: seat.status,
    });

    res.json({ message: 'Asiento liberado' });
  } catch (error: any) {
    logger.error('Error en releaseSeat:', error);
    res.status(500).json({ error: 'Error al liberar asiento' });
  }
};
