import { Router } from 'express';
import { authenticateJWT } from '../middleware/auth.middleware';
import { requireAdmin } from '../middleware/admin.middleware';
import {
  getAdminTelemetry,
  getAdminUsers,
  getAdminAuditLogs,
} from '../controllers/admin.controller';

const router = Router();

router.use(authenticateJWT as any);
router.use(requireAdmin as any);

router.get('/telemetry', getAdminTelemetry as any);
router.get('/users', getAdminUsers as any);
router.get('/audit-logs', getAdminAuditLogs as any);

export default router;
