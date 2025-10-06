import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { User, Ticket } from '../models';
import { logger } from '../utils/logger';

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    const user = await User.findById(userId);
    if (!user) {
      res.status(404).json({ error: 'Usuario no encontrado' });
      return;
    }

    // Obtener todos los tickets del usuario
    const tickets = await Ticket.find({
      userId: user._id,
      estado: { $in: ['disponible', 'asignado', 'inscrito'] },
    }).sort({ createdAt: 1 });

    res.json({
      user: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        phone: user.phone,
        rol: user.rol,
        verificado: user.verificado,
      },
      tickets: tickets.map((t) => ({
        id: t._id,
        codigo_ticket: t.codigo_ticket,
        pasajeros: t.pasajeros,
        flightId: t.flightId,
        estado: t.estado,
      })),
    });
  } catch (error: any) {
    logger.error('Error en getMe:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
};

export const updateTicket = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ticketId } = req.params;
    const { pasajeros, flightId } = req.body;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    // Actualizar campos
    if (pasajeros) {
      ticket.pasajeros = pasajeros;
    }

    if (flightId !== undefined) {
      ticket.flightId = flightId;
      // Si se asigna un vuelo y hay pasajeros, cambiar estado a asignado
      if (flightId && ticket.pasajeros && ticket.pasajeros.length > 0) {
        ticket.estado = 'asignado';
      }
    }

    await ticket.save();

    res.json({ message: 'Ticket actualizado exitosamente', ticket });
  } catch (error: any) {
    logger.error('Error en updateTicket:', error);
    res.status(500).json({ error: 'Error al actualizar ticket' });
  }
};
