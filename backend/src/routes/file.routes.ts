import { Router } from 'express';
import multer from 'multer';
import {
  uploadEncryptedFile,
  getUserFiles,
  verifyFileIntegrity,
  downloadEncryptedFile,
  previewFile,
  migrateFile,
  generateShareLink,
  downloadSharedFile,
  deleteFileRecord,
} from '../controllers/file.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2 GB max single upload
});

const router = Router();

// PUBLIC ROUTE: Download file via signed, time-limited share link (no auth required)
router.get('/shared/:token', downloadSharedFile as any);

// AUTHENTICATED ROUTES: Require valid JWT user session
router.use(authenticateJWT as any);

router.post('/upload', upload.single('file'), uploadEncryptedFile as any);
router.get('/', getUserFiles as any);
router.get('/download/:id', downloadEncryptedFile as any);
router.get('/preview/:id', previewFile as any);
router.post('/migrate/:id', migrateFile as any);
router.post('/share/:id', generateShareLink as any);
router.delete('/:id', deleteFileRecord as any);
router.post('/verify-integrity', verifyFileIntegrity as any);

export default router;
