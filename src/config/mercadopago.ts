import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';
import { logger } from '../utils/logger';

let mercadopagoClient: MercadoPagoConfig | null = null;
let preferenceClient: Preference | null = null;
let paymentClient: Payment | null = null;

// Configuración de Mercado Pago
export const initializeMercadoPago = () => {
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (!accessToken) {
    logger.warn('⚠️  Mercado Pago no configurado. Usa MERCADOPAGO_ACCESS_TOKEN en variables de entorno.');
    return;
  }

  mercadopagoClient = new MercadoPagoConfig({
    accessToken,
    options: { timeout: 5000 }
  });

  preferenceClient = new Preference(mercadopagoClient);
  paymentClient = new Payment(mercadopagoClient);

  logger.info('✅ Mercado Pago configurado correctamente');
};

export const getMercadoPagoClients = () => {
  if (!mercadopagoClient || !preferenceClient || !paymentClient) {
    throw new Error('Mercado Pago no está configurado');
  }
  return { mercadopagoClient, preferenceClient, paymentClient };
};

export const MERCADOPAGO_CONFIG = {
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || '',
  notificationUrl: process.env.MERCADOPAGO_NOTIFICATION_URL || `${process.env.BACKEND_URL}/api/payment/mercadopago/webhook`,
  successUrl: `${process.env.FRONTEND_URL}/pago/confirmacion`,
  failureUrl: `${process.env.FRONTEND_URL}/pago/error`,
  pendingUrl: `${process.env.FRONTEND_URL}/pago/pendiente`,
};
