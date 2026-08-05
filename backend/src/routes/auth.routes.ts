import { Router } from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  googleOAuth,
} from '../controllers/auth.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.post('/google', googleOAuth);
router.get('/me', authenticateJWT, getMe);

export default router;
