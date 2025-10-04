import { Router } from 'express';
import { getBoardingPass, scanQR } from '../controllers/boardingController';
import { authenticate, requireStaff } from '../middlewares/auth';

const router = Router();

router.get('/:id', authenticate, getBoardingPass);
router.post('/scan', authenticate, requireStaff, scanQR);

export default router;
