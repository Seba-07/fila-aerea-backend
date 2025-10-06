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
