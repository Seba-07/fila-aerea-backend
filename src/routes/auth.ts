import { Router } from 'express';
import { requestOTP, verifyOTP, logout } from '../controllers/authController';
import { authLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.post('/request-otp', authLimiter, requestOTP);
router.post('/verify-otp', authLimiter, verifyOTP);
router.post('/logout', logout);

export default router;
