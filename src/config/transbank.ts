import { WebpayPlus, Options, IntegrationCommerceCodes, IntegrationApiKeys, Environment } from 'transbank-sdk';

// Configuración para ambiente de pruebas (sandbox)
// Para producción, usar las credenciales reales de Transbank
const environment = process.env.TRANSBANK_ENVIRONMENT === 'production'
  ? Environment.Production
  : Environment.Integration;

const commerceCode = process.env.TRANSBANK_COMMERCE_CODE || IntegrationCommerceCodes.WEBPAY_PLUS;
const apiKey = process.env.TRANSBANK_API_KEY || IntegrationApiKeys.WEBPAY;

// Crear instancia de Webpay Plus
export const webpayPlus = new WebpayPlus.Transaction(
  new Options(commerceCode, apiKey, environment)
);

export const TRANSBANK_CONFIG = {
  environment,
  commerceCode,
  // URLs de retorno después del pago
  returnUrl: process.env.TRANSBANK_RETURN_URL || `${process.env.FRONTEND_URL}/pago/confirmacion`,
};
