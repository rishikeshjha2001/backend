import { Router } from 'express';
import { getAuditLogs } from '../controllers/audit.controller';
import { requireAdmin } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAdmin);

router.get('/', getAuditLogs);

export default router;
