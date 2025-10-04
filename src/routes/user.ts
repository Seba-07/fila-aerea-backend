import { Router } from 'express';
import { getMe } from '../controllers/userController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.get('/me', authenticate, getMe);

export default router;
