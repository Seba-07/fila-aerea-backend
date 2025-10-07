import { Router } from 'express';
import { getManifests, getManifestByTanda } from '../controllers/manifestController';
import { authenticate, requireStaff } from '../middlewares/auth';

const router = Router();

// Todas las rutas requieren autenticación y rol de staff
router.get('/', authenticate, requireStaff, getManifests);
router.get('/tanda/:numeroTanda', authenticate, requireStaff, getManifestByTanda);

export default router;
