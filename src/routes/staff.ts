import { Router } from 'express';
import {
  registerPassenger,
  getPassengers,
  getPassengersWithoutFlight,
  updatePassenger,
  updatePassengerTickets,
  deletePassenger,
  getPayments,
} from '../controllers/staffController';
import { authenticate, requireStaff } from '../middlewares/auth';

const router = Router();

// Todas las rutas requieren autenticación de staff
router.post('/passengers', authenticate, requireStaff, registerPassenger);
router.get('/passengers', authenticate, requireStaff, getPassengers);
router.get('/passengers-without-flight', authenticate, requireStaff, getPassengersWithoutFlight);
router.patch('/passengers/:passengerId', authenticate, requireStaff, updatePassenger);
router.patch('/passengers/:passengerId/tickets', authenticate, requireStaff, updatePassengerTickets);
router.delete('/passengers/:passengerId', authenticate, requireStaff, deletePassenger);
router.get('/payments', authenticate, requireStaff, getPayments);

export default router;
