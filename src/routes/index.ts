import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './user';
import flightsRoutes from './flights';
import staffRoutes from './staff';

const router = Router();

router.use('/auth', authRoutes);
router.use('/', userRoutes);
router.use('/flights', flightsRoutes);
router.use('/staff', staffRoutes);

export default router;
