import { Router } from 'express';
import multer from 'multer';
import {
  uploadEncryptedFile,
  getUserFiles,
  verifyFileIntegrity,
  downloadEncryptedFile,
} from '../controllers/file.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB max single upload
});

const router = Router();

router.use(authenticateJWT as any);

router.post('/upload', upload.single('file'), uploadEncryptedFile as any);
router.get('/', getUserFiles as any);
router.get('/download/:id', downloadEncryptedFile as any);
router.post('/verify-integrity', verifyFileIntegrity as any);

export default router;

