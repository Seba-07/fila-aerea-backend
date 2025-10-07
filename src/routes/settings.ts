import { Router } from 'express';
import { getSettings, updateSettings, updateHoraPrevista, iniciarVuelo, finalizarVuelo } from '../controllers/settingsController';
import { authenticate, authorize } from '../middlewares/auth';

const router = Router();

// Rutas de configuración
router.get('/', authenticate, getSettings);
router.patch('/', authenticate, authorize(['staff']), updateSettings);

// Rutas de gestión de vuelos
router.patch('/flights/:flightId/hora-prevista', authenticate, authorize(['staff']), updateHoraPrevista);
router.patch('/flights/:flightId/iniciar', authenticate, authorize(['staff']), iniciarVuelo);
router.patch('/flights/:flightId/finalizar', authenticate, authorize(['staff']), finalizarVuelo);

export default router;
