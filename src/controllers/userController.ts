import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { User, Ticket } from '../models';
import { logger } from '../utils/logger';

export const getMe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;

    // DESARROLLO: Modo bypass - devolver datos mock
    if (process.env.BYPASS_AUTH === 'true') {
      // Buscar un ticket real de ejemplo de la BD
      const sampleTicket = await Ticket.findOne({ estado: 'activo' }).limit(1);

      res.json({
        user: {
          id: userId,
          nombre: 'Usuario Dev',
          email: req.user?.email || 'dev@test.com',
          phone: null,
          rol: req.user?.rol || 'passenger',
          verificado: true,
        },
        ticket: sampleTicket
          ? {
              id: sampleTicket._id,
              codigo_ticket: sampleTicket.codigo_ticket,
              turno_global: sampleTicket.turno_global,
              estado: sampleTicket.estado,
              cooldownUntil: sampleTicket.cooldownUntil,
            }
          : null,
      });
      return;
    }

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
