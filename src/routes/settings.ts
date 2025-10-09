import { Router } from 'express';
import { getSettings, updateSettings, updateHoraPrevista, updateHoraPrevistaCircuito, iniciarVuelo, finalizarVuelo, getPrecioTicket } from '../controllers/settingsController';
import { authenticate, requireStaff } from '../middlewares/auth';

const router = Router();

// Rutas públicas
router.get('/precio-ticket', getPrecioTicket); // Público - para página de compra

// Rutas de configuración
router.get('/', authenticate, getSettings);
router.patch('/', authenticate, requireStaff, updateSettings);

// Rutas de gestión de vuelos
router.patch('/flights/:flightId/hora-prevista', authenticate, requireStaff, updateHoraPrevista);
router.patch('/flights/circuito/:numeroCircuito/hora-prevista', authenticate, requireStaff, updateHoraPrevistaCircuito);
router.patch('/flights/:flightId/iniciar', authenticate, requireStaff, iniciarVuelo);
router.patch('/flights/:flightId/finalizar', authenticate, requireStaff, finalizarVuelo);

export default router;
