import { Router } from 'express';
import authRoutes from './auth';
import userRoutes from './user';
import flightsRoutes from './flights';
import staffRoutes from './staff';
import notificationRoutes from './notifications';
import pushRoutes from './push';
import settingsRoutes from './settings';
import manifestsRoutes from './manifests';

const router = Router();

router.use('/auth', authRoutes);
router.use('/', userRoutes);
router.use('/flights', flightsRoutes);
router.use('/staff', staffRoutes);
router.use('/notifications', notificationRoutes);
router.use('/push', pushRoutes);
router.use('/settings', settingsRoutes);
router.use('/manifests', manifestsRoutes);

export default router;
