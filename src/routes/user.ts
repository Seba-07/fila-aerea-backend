import { Router } from 'express';
import {
  getMe,
  updateTicket,
  removePassengerFromFlight,
  acceptRescheduling,
  rejectRescheduling,
  rescheduleToChosenTanda,
} from '../controllers/userController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.get('/me', authenticate, getMe);
router.patch('/tickets/:ticketId', authenticate, updateTicket);
router.delete('/tickets/:ticketId/flight', authenticate, removePassengerFromFlight);

// Reprogramaciones
router.post('/tickets/:ticketId/accept-reschedule', authenticate, acceptRescheduling);
router.post('/tickets/:ticketId/reject-reschedule', authenticate, rejectRescheduling);
router.post('/tickets/:ticketId/reschedule', authenticate, rescheduleToChosenTanda);

export default router;
