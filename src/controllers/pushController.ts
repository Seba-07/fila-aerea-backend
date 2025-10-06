import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { PushSubscription } from '../models';
import { getVapidPublicKey } from '../services/pushNotification';
import { logger } from '../utils/logger';

export const getVapidKey = async (req: AuthRequest, res: Response): Promise<void> => {
  res.json({ publicKey: getVapidPublicKey() });
};

export const subscribe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.userId;
    const { endpoint, keys } = req.body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      res.status(400).json({ error: 'Datos de suscripción inválidos' });
      return;
    }

    // Verificar si ya existe esta suscripción
    let subscription = await PushSubscription.findOne({ endpoint });

    if (subscription) {
      // Actualizar userId si cambió
      if (subscription.userId.toString() !== userId) {
        subscription.userId = userId as any;
        await subscription.save();
      }
      res.json({ message: 'Suscripción actualizada', subscription });
      return;
    }

    // Crear nueva suscripción
    subscription = await PushSubscription.create({
      userId,
      endpoint,
      keys: {
        p256dh: keys.p256dh,
        auth: keys.auth,
      },
    });

    logger.info(`Nueva suscripción push para usuario ${userId}`);
    res.json({ message: 'Suscripción creada', subscription });
  } catch (error: any) {
    logger.error('Error en subscribe:', error);
    res.status(500).json({ error: 'Error al crear suscripción' });
  }
};

export const unsubscribe = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { endpoint } = req.body;

    if (!endpoint) {
      res.status(400).json({ error: 'Endpoint requerido' });
      return;
    }

    await PushSubscription.findOneAndDelete({ endpoint });

    logger.info(`Suscripción eliminada: ${endpoint.substring(0, 50)}...`);
    res.json({ message: 'Suscripción eliminada' });
  } catch (error: any) {
    logger.error('Error en unsubscribe:', error);
    res.status(500).json({ error: 'Error al eliminar suscripción' });
  }
};
