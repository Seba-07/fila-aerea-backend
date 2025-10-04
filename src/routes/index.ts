import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './user';
import flightsRoutes from './flights';
import boardingRoutes from './boarding';

const router = Router();

router.use('/auth', authRoutes);
router.use('/', userRoutes);
router.use('/flights', flightsRoutes);
router.use('/boarding_pass', boardingRoutes);

export default router;
