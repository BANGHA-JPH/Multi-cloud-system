import { Router } from 'express';
import {
  registerUser,
  loginUser,
  logoutUser,
  getMe,
  googleOAuth,
  redirectToGoogleAuth,
  handleGoogleAuthCallback,
} from '../controllers/auth.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);
router.post('/google', googleOAuth);
router.get('/google/login', redirectToGoogleAuth);
router.get('/google/callback', handleGoogleAuthCallback);
router.get('/me', authenticateJWT, getMe);

export default router;

