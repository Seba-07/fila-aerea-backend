import { Router } from 'express';
import {
  registerPassenger,
  getPassengers,
  getPassengersWithoutFlight,
  updatePassenger,
  updatePassengerTickets,
  deletePassenger,
  getPayments,
  createTanda,
  deleteTanda,
} from '../controllers/staffController';
import {
  getAircrafts,
  createAircraft,
  updateAircraftCapacity,
  toggleAircraftStatus,
} from '../controllers/aircraftController';
import {
  createRefueling,
  getRefuelingsByAircraft,
  getAllRefuelings,
} from '../controllers/refuelingController';
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

// Tandas
router.post('/tandas', authenticate, requireStaff, createTanda);
router.delete('/tandas/:numero_tanda', authenticate, requireStaff, deleteTanda);

// Aviones
router.get('/aircrafts', authenticate, requireStaff, getAircrafts);
router.post('/aircrafts', authenticate, requireStaff, createAircraft);
router.patch('/aircrafts/:aircraftId/capacity', authenticate, requireStaff, updateAircraftCapacity);
router.patch('/aircrafts/:aircraftId/toggle', authenticate, requireStaff, toggleAircraftStatus);

// Reabastecimientos
router.post('/refuelings', authenticate, requireStaff, createRefueling);
router.get('/refuelings', authenticate, requireStaff, getAllRefuelings);
router.get('/refuelings/:aircraftId', authenticate, requireStaff, getRefuelingsByAircraft);

export default router;
