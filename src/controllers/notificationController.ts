import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { Notification } from '../models';
import { logger } from '../utils/logger';

export const getNotifications = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user?.userId;

    const notifications = await Notification.find({ userId })
      .sort({ createdAt: -1 })
      .lean();

    res.json(notifications);
  } catch (error: any) {
    logger.error('Error en getNotifications:', error);
    res.status(500).json({ error: 'Error al obtener notificaciones' });
  }
};

export const markAsRead = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const notification = await Notification.findOne({ _id: id, userId });
    if (!notification) {
      res.status(404).json({ error: 'Notificación no encontrada' });
      return;
    }

    notification.leido = true;
    await notification.save();

    res.json({ message: 'Notificación marcada como leída' });
  } catch (error: any) {
    logger.error('Error en markAsRead:', error);
    res.status(500).json({ error: 'Error al marcar notificación' });
  }
};

export const deleteNotification = async (
  req: AuthRequest,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.userId;

    const notification = await Notification.findOneAndDelete({ _id: id, userId });
    if (!notification) {
      res.status(404).json({ error: 'Notificación no encontrada' });
      return;
    }

    res.json({ message: 'Notificación eliminada' });
  } catch (error: any) {
    logger.error('Error en deleteNotification:', error);
    res.status(500).json({ error: 'Error al eliminar notificación' });
  }
};
