import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { BoardingPass, Seat, EventLog } from '../models';
import { logger } from '../utils/logger';
import { verifyQRToken } from '../utils/jwt';
import { getIO } from '../sockets';

export const getBoardingPass = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const boardingPass = await BoardingPass.findById(id)
      .populate({
        path: 'ticketId',
        match: { userId },
      })
      .populate('flightId')
      .lean();

    if (!boardingPass || !boardingPass.ticketId) {
      res.status(404).json({ error: 'Pase de embarque no encontrado' });
      return;
    }

    res.json(boardingPass);
  } catch (error: any) {
    logger.error('Error en getBoardingPass:', error);
    res.status(500).json({ error: 'Error al obtener pase de embarque' });
  }
};

export const scanQR = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { qr_token } = req.body;

    if (!qr_token) {
      res.status(400).json({ error: 'qr_token es obligatorio' });
      return;
    }

    // Verificar firma del token
    let payload;
    try {
      payload = verifyQRToken(qr_token);
    } catch (error) {
      res.status(401).json({ error: 'QR inválido o expirado' });
      return;
    }

    // Buscar boarding pass
    const boardingPass = await BoardingPass.findOne({ qr_token })
      .populate('ticketId')
      .populate('flightId');

    if (!boardingPass) {
      res.status(404).json({ error: 'Pase de embarque no encontrado' });
      return;
    }

    if (boardingPass.estado === 'escaneado') {
      res.status(409).json({
        error: 'Este pase ya fue escaneado',
        scannedAt: boardingPass.scannedAt,
      });
      return;
    }

    // Marcar como escaneado
    boardingPass.estado = 'escaneado';
    boardingPass.scannedAt = new Date();
    boardingPass.scannedBy = req.user?.userId as any;
    await boardingPass.save();

    // Actualizar asiento a embarcado
    await Seat.findOneAndUpdate(
      {
        flightId: boardingPass.flightId,
        seatNumber: boardingPass.seatNumber,
      },
      { status: 'embarcado' }
    );

    await EventLog.create({
      type: 'boarding_scanned',
      entity: 'boarding_pass',
      entityId: boardingPass._id.toString(),
      userId: req.user?.userId,
      payload: {
        flightId: boardingPass.flightId._id.toString(),
        ticketId: boardingPass.ticketId._id.toString(),
        seatNumber: boardingPass.seatNumber,
      },
    });

    // Emitir evento en tiempo real
    const io = getIO();
    io.to(`flight:${boardingPass.flightId._id}`).emit('seatUpdated', {
      flightId: boardingPass.flightId._id,
      seatNumber: boardingPass.seatNumber,
      status: 'embarcado',
    });

    res.json({
      message: 'Embarque exitoso',
      boardingPass: {
        id: boardingPass._id,
        seatNumber: boardingPass.seatNumber,
        passenger: (boardingPass.ticketId as any).userId,
        scannedAt: boardingPass.scannedAt,
      },
    });
  } catch (error: any) {
    logger.error('Error en scanQR:', error);
    res.status(500).json({ error: 'Error al escanear QR' });
  }
};

export const markNoShow = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id: flightId } = req.params;
    const { seatNumber } = req.body;

    if (!seatNumber) {
      res.status(400).json({ error: 'seatNumber es obligatorio' });
      return;
    }

    const seat = await Seat.findOne({
      flightId,
      seatNumber: seatNumber.toUpperCase(),
    });

    if (!seat) {
      res.status(404).json({ error: 'Asiento no encontrado' });
      return;
    }

    if (seat.status !== 'confirmado') {
      res.status(400).json({ error: 'El asiento debe estar confirmado' });
      return;
    }

    seat.status = 'no_show';
    await seat.save();

    await EventLog.create({
      type: 'seat_no_show',
      entity: 'seat',
      entityId: seat._id.toString(),
      userId: req.user?.userId,
      payload: { flightId, seatNumber, ticketId: seat.ticketId?.toString() },
    });

    // Emitir evento en tiempo real
    const io = getIO();
    io.to(`flight:${flightId}`).emit('seatUpdated', {
      flightId,
      seatNumber: seat.seatNumber,
      status: seat.status,
    });

    res.json({ message: 'Asiento marcado como no-show' });
  } catch (error: any) {
    logger.error('Error en markNoShow:', error);
    res.status(500).json({ error: 'Error al marcar no-show' });
  }
};
