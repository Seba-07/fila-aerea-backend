import { Router } from 'express';
import {
  getFlights,
  getFlightById,
  createFlight,
  updateFlight,
  closeFlight,
} from '../controllers/flightController';
import {
  holdSeat,
  confirmSeat,
  releaseSeat,
} from '../controllers/seatController';
import {
  getBoardingPass,
  scanQR,
  markNoShow,
} from '../controllers/boardingController';
import { authenticate, requireStaff } from '../middlewares/auth';
import { seatActionLimiter } from '../middlewares/rateLimiter';

const router = Router();

// Rutas públicas (requieren autenticación)
router.get('/', authenticate, getFlights);
router.get('/:id', authenticate, getFlightById);

// Acciones de asientos (pasajeros)
router.post('/:id/seats/hold', authenticate, seatActionLimiter, holdSeat);
router.post('/:id/seats/confirm', authenticate, seatActionLimiter, confirmSeat);

// Rutas de staff
router.post('/', authenticate, requireStaff, createFlight);
router.patch('/:id', authenticate, requireStaff, updateFlight);
router.post('/:id/close', authenticate, requireStaff, closeFlight);
router.post('/:id/seats/release', authenticate, requireStaff, releaseSeat);
router.post('/:id/no_show', authenticate, requireStaff, markNoShow);

export default router;
