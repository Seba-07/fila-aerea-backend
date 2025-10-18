import express from 'express';
import { authenticate, requireStaff } from '../middlewares/auth';
import { getPilots, createPilot, updatePilot, deletePilot } from '../controllers/pilotController';

const router = express.Router();

// Listar pilotos (requiere autenticación)
router.get('/', authenticate, getPilots);

// Crear piloto (solo staff)
router.post('/', authenticate, requireStaff, createPilot);

// Actualizar piloto (solo staff)
router.patch('/:pilotId', authenticate, requireStaff, updatePilot);

// Desactivar piloto (solo staff)
router.delete('/:pilotId', authenticate, requireStaff, deletePilot);

export default router;
