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

    // Obtener ticket asociado
    const ticket = await Ticket.findOne({ userId: user._id, estado: 'activo' });

    res.json({
      user: {
        id: user._id,
        nombre: user.nombre,
        email: user.email,
        phone: user.phone,
        rol: user.rol,
        verificado: user.verificado,
      },
      ticket: ticket
        ? {
            id: ticket._id,
            codigo_ticket: ticket.codigo_ticket,
            turno_global: ticket.turno_global,
            estado: ticket.estado,
            cooldownUntil: ticket.cooldownUntil,
          }
        : null,
    });
  } catch (error: any) {
    logger.error('Error en getMe:', error);
    res.status(500).json({ error: 'Error al obtener perfil' });
  }
};
