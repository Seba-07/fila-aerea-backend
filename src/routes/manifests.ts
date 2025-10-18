import { Router } from 'express';
import { getManifests, getManifestByCircuito, getManifestByFlight } from '../controllers/manifestController';
import { authenticate, requireStaff } from '../middlewares/auth';

const router = Router();

// Todas las rutas requieren autenticación y rol de staff
router.get('/', authenticate, requireStaff, getManifests);
router.get('/flight/:flightId', authenticate, requireStaff, getManifestByFlight);
router.get('/circuito/:numeroCircuito', authenticate, requireStaff, getManifestByCircuito); // Deprecated

export default router;
