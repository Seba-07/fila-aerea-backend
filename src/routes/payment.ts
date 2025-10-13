import { Router } from 'express';
import { iniciarPago, confirmarPago, getTransactionStatus } from '../controllers/paymentController';

const router = Router();

// Transbank routes (kept for future use)
router.post('/iniciar', iniciarPago);
router.post('/confirmar', confirmarPago);
router.get('/status/:buy_order', getTransactionStatus);

export default router;
