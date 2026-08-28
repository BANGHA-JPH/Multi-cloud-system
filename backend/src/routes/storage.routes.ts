import { Router } from 'express';
import {
  getStorageQuota,
  getCloudAccounts,
  connectCloudAccount,
  disconnectCloudAccount,
  getOneDriveAuthUrlHandler,
  handleOneDriveCallback,
  redirectToOneDriveLogin,
  handleOneDriveGetCallback,
  redirectToGDriveLogin,
  handleGDriveGetCallback,
  redirectToDropboxLogin,
  handleDropboxGetCallback,
  getDropboxAuthUrlHandler,
} from '../controllers/storage.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

router.get('/quota', authenticateJWT, getStorageQuota);
router.get('/accounts', authenticateJWT, getCloudAccounts);
router.post('/connect', authenticateJWT, connectCloudAccount);
router.post('/disconnect', authenticateJWT, disconnectCloudAccount);

// Microsoft OneDrive OAuth
router.get('/onedrive/auth-url', getOneDriveAuthUrlHandler);
router.get('/onedrive/login', redirectToOneDriveLogin);
router.get('/onedrive/callback', handleOneDriveGetCallback);
router.post('/onedrive/callback', handleOneDriveCallback);

// Google Drive OAuth
router.get('/gdrive/login', redirectToGDriveLogin);
router.get('/gdrive/callback', handleGDriveGetCallback);

// Dropbox OAuth
router.get('/dropbox/auth-url', getDropboxAuthUrlHandler);
router.get('/dropbox/login', redirectToDropboxLogin);
router.get('/dropbox/callback', handleDropboxGetCallback);

export default router;
