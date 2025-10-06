import webpush from 'web-push';
import { PushSubscription } from '../models';
import { logger } from '../utils/logger';

// Configurar VAPID con las claves generadas
const vapidKeys = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BMwCnITXhfGVNvyceFDcK257OR3z2J3SeF8Mcsclw-xS8Y_8eNdCmJlkDLtizAPUWyG59CTBMtFFi4ixTOULzqE',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'JzBugDhDEj2w1_ZjWlVDjwp_qQRxL-SBjZinBVRCA5Q',
};

webpush.setVapidDetails(
  'mailto:noreply@filaaerea.cl',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

export const sendPushNotification = async (
  userId: string,
  title: string,
  body: string,
  data?: any
) => {
  try {
    // Obtener todas las suscripciones del usuario
    const subscriptions = await PushSubscription.find({ userId });

    if (subscriptions.length === 0) {
      logger.info(`Usuario ${userId} no tiene suscripciones push`);
      return;
    }

    const payload = JSON.stringify({
      title,
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: 'flight-notification',
      requireInteraction: true,
      data,
    });

    // Enviar a todas las suscripciones del usuario
    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.keys.p256dh,
                auth: sub.keys.auth,
              },
            },
            payload
          );
          logger.info(`Push notification enviada a ${sub.endpoint.substring(0, 50)}...`);
        } catch (error: any) {
          if (error.statusCode === 410) {
            // Suscripción expirada, eliminarla
            await PushSubscription.findByIdAndDelete(sub._id);
            logger.info(`Suscripción expirada eliminada: ${sub._id}`);
          } else {
            logger.error(`Error al enviar push notification:`, error);
          }
        }
      })
    );

    logger.info(`Push notifications enviadas: ${subscriptions.length}`);
  } catch (error) {
    logger.error('Error en sendPushNotification:', error);
  }
};

export const getVapidPublicKey = () => {
  return vapidKeys.publicKey;
};
