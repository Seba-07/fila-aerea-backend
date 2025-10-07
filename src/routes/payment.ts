import { Router } from 'express';
import { iniciarPago, confirmarPago, getTransactionStatus } from '../controllers/paymentController';

const router = Router();

// Iniciar pago (público)
router.post('/iniciar', iniciarPago);

// Confirmar pago - callback de Transbank (público)
router.post('/confirmar', confirmarPago);

// Obtener estado de transacción (público, por ahora)
router.get('/status/:buy_order', getTransactionStatus);

export default router;
