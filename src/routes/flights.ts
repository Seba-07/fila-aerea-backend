import { Router } from 'express';
import {
  createFlight,
  getFlights,
  getFlightById,
  updateFlightStatus,
  updateFlightCapacity,
  rescheduleFlightToNextTanda,
  cancelAircraftForDay,
  deleteFlight,
} from '../controllers/flightController';
import { authenticate, requireStaff } from '../middlewares/auth';

const router = Router();

// Rutas públicas (requieren autenticación)
router.get('/', authenticate, getFlights);
router.get('/:id', authenticate, getFlightById);

// Crear vuelo
router.post('/', authenticate, requireStaff, createFlight);

// Rutas de staff
router.patch('/:id/status', authenticate, requireStaff, updateFlightStatus);
router.patch('/:id', authenticate, requireStaff, updateFlightStatus); // Alias para compatibilidad
router.patch('/:id/capacity', authenticate, requireStaff, updateFlightCapacity);
router.post('/:id/reschedule', authenticate, requireStaff, rescheduleFlightToNextTanda);
router.post('/:id/cancel-aircraft-day', authenticate, requireStaff, cancelAircraftForDay);
router.delete('/:id', authenticate, requireStaff, deleteFlight);

export default router;
