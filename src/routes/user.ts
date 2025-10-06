import { Router } from 'express';
import { getMe, updateTicket } from '../controllers/userController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.get('/me', authenticate, getMe);
router.patch('/tickets/:ticketId', authenticate, updateTicket);

export default router;
