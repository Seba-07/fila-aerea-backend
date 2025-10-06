import { Router } from 'express';
import { getVapidKey, subscribe, unsubscribe } from '../controllers/pushController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.get('/vapid-key', getVapidKey);
router.post('/subscribe', authenticate, subscribe);
router.post('/unsubscribe', authenticate, unsubscribe);

export default router;
