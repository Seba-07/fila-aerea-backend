import { Router } from 'express';
import {
  getFlights,
  getFlightById,
  updateFlightStatus,
} from '../controllers/flightController';
import { authenticate, requireStaff } from '../middlewares/auth';

const router = Router();

// Rutas públicas (requieren autenticación)
router.get('/', authenticate, getFlights);
router.get('/:id', authenticate, getFlightById);

// Rutas de staff
router.patch('/:id/status', authenticate, requireStaff, updateFlightStatus);
router.patch('/:id', authenticate, requireStaff, updateFlightStatus); // Alias para compatibilidad

export default router;
