import { Router } from 'express';
import {
  getMe,
  updateTicket,
  removePassengerFromFlight,
  acceptRescheduling,
  rejectRescheduling,
  rescheduleToChosenTanda,
  inscribeTicket,
  acceptTimeChange,
  rejectTimeChange,
} from '../controllers/userController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.get('/me', authenticate, getMe);
router.patch('/tickets/:ticketId', authenticate, updateTicket);
router.delete('/tickets/:ticketId/flight', authenticate, removePassengerFromFlight);

// Inscripción de tickets
router.post('/tickets/:ticketId/inscribir', authenticate, inscribeTicket);

// Reprogramaciones
router.post('/tickets/:ticketId/accept-reschedule', authenticate, acceptRescheduling);
router.post('/tickets/:ticketId/reject-reschedule', authenticate, rejectRescheduling);
router.post('/tickets/:ticketId/reschedule', authenticate, rescheduleToChosenTanda);

// Cambios de hora
router.post('/tickets/:ticketId/accept-time-change', authenticate, acceptTimeChange);
router.post('/tickets/:ticketId/reject-time-change', authenticate, rejectTimeChange);

export default router;
