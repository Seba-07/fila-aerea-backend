import { Router } from 'express';
import { getMe, updateTicket, removePassengerFromFlight } from '../controllers/userController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.get('/me', authenticate, getMe);
router.patch('/tickets/:ticketId', authenticate, updateTicket);
router.delete('/tickets/:ticketId/flight', authenticate, removePassengerFromFlight);

export default router;
