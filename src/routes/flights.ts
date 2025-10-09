import { Router } from 'express';
import {
  createFlight,
  getFlights,
  getFlightById,
  updateFlightStatus,
  updateFlightCapacity,
  rescheduleFlightToNextCircuito,
  cancelAircraftForDay,
  deleteFlight,
  getAvailableFlights,
  createReservation,
  getReservation,
  releaseReservation,
} from '../controllers/flightController';
import { authenticate, requireStaff } from '../middlewares/auth';

const router = Router();

// ========== PUBLIC ROUTES (NO AUTHENTICATION) ==========
// Get available flights for public purchase
router.get('/available', getAvailableFlights);

// Create temporary reservation (5 minutes)
router.post('/reserve', createReservation);

// Get reservation by ID
router.get('/reservation/:id', getReservation);

// Release/cancel reservation
router.post('/release-reservation', releaseReservation);

// ========== AUTHENTICATED ROUTES ==========
// Rutas públicas (requieren autenticación)
router.get('/', authenticate, getFlights);
router.get('/:id', authenticate, getFlightById);

// Crear vuelo
router.post('/', authenticate, requireStaff, createFlight);

// Rutas de staff
router.patch('/:id/status', authenticate, requireStaff, updateFlightStatus);
router.patch('/:id', authenticate, requireStaff, updateFlightStatus); // Alias para compatibilidad
router.patch('/:id/capacity', authenticate, requireStaff, updateFlightCapacity);
router.post('/:id/reschedule', authenticate, requireStaff, rescheduleFlightToNextCircuito);
router.post('/:id/cancel-aircraft-day', authenticate, requireStaff, cancelAircraftForDay);
router.delete('/:id', authenticate, requireStaff, deleteFlight);

export default router;
