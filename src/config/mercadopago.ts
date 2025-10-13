import mercadopago from 'mercadopago';
import { logger } from '../utils/logger';

// Configuración de Mercado Pago
export const initializeMercadoPago = () => {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    logger.warn('⚠️  Mercado Pago no configurado. Usa MERCADOPAGO_ACCESS_TOKEN en variables de entorno.');
    return;
  }

  mercadopago.configure({
    access_token: accessToken,
  });

  logger.info('✅ Mercado Pago configurado correctamente');
};

export const MERCADOPAGO_CONFIG = {
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
  notificationUrl: process.env.MERCADOPAGO_NOTIFICATION_URL || `${process.env.BACKEND_URL}/api/payment/mercadopago/webhook`,
  successUrl: `${process.env.FRONTEND_URL}/pago/confirmacion`,
  failureUrl: `${process.env.FRONTEND_URL}/pago/error`,
  pendingUrl: `${process.env.FRONTEND_URL}/pago/pendiente`,
};

export { mercadopago };
