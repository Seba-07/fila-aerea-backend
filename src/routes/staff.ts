import { Router } from 'express';
import {
  registerPassenger,
  getPassengers,
  getPassengersWithoutFlight,
  updatePassenger,
  updatePassengerTickets,
  updateTicketPassengers,
  updatePassengerPayment,
  deletePassenger,
  getPayments,
  createCircuito,
  deleteCircuito,
  validateQR,
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
router.patch('/passengers/:passengerId/payment', authenticate, requireStaff, updatePassengerPayment);
router.patch('/tickets/:ticketId/passengers', authenticate, requireStaff, updateTicketPassengers);
router.delete('/passengers/:passengerId', authenticate, requireStaff, deletePassenger);
router.get('/payments', authenticate, requireStaff, getPayments);

// Circuitos
router.post('/circuitos', authenticate, requireStaff, createCircuito);
router.delete('/circuitos/:numero_circuito', authenticate, requireStaff, deleteCircuito);

// QR Validation
router.post('/validate-qr', authenticate, requireStaff, validateQR);

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
