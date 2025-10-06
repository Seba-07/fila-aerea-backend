import { Router } from 'express';
import {
  registerPassenger,
  getPassengers,
} from '../controllers/staffController';
import { authenticate, requireStaff } from '../middlewares/auth';

const router = Router();

// Todas las rutas requieren autenticación de staff
router.post('/passengers', authenticate, requireStaff, registerPassenger);
router.get('/passengers', authenticate, requireStaff, getPassengers);

export default router;
