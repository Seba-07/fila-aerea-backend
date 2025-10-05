import { Router } from 'express';
import { login, logout } from '../controllers/authController';
import { authLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.post('/login', authLimiter, login);
router.post('/logout', logout);

export default router;
