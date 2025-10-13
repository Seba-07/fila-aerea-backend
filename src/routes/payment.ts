import { Router } from 'express';
import { iniciarPago, confirmarPago, getTransactionStatus } from '../controllers/paymentController';
import { iniciarPagoMP, webhookMP, confirmarPagoMP } from '../controllers/mercadopagoController';

const router = Router();

// Transbank routes
router.post('/iniciar', iniciarPago);
router.post('/confirmar', confirmarPago);
router.get('/status/:buy_order', getTransactionStatus);

// Mercado Pago routes
router.post('/mercadopago/iniciar', iniciarPagoMP);
router.post('/mercadopago/webhook', webhookMP);
router.get('/mercadopago/confirmar', confirmarPagoMP);

export default router;
