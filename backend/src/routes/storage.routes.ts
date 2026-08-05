import { Router } from 'express';
import {
  getStorageQuota,
  getCloudAccounts,
  connectCloudAccount,
  disconnectCloudAccount,
} from '../controllers/storage.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.get('/quota', authenticateJWT, getStorageQuota);
router.get('/accounts', authenticateJWT, getCloudAccounts);
router.post('/connect', authenticateJWT, connectCloudAccount);
router.post('/disconnect', authenticateJWT, disconnectCloudAccount);

export default router;
