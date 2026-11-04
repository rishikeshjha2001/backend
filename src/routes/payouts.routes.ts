import { Router } from 'express';
import { getAllPayouts, processPayout } from '../controllers/payouts.controller';
import { requireAdmin } from '../middleware/auth.middleware';
import { auditAdminAction } from '../middleware/audit.middleware';

const router = Router();

router.use(requireAdmin);

router.get('/', getAllPayouts);
router.post('/:id/process', auditAdminAction('PROCESS_PAYOUT', req => String(req.params.id)), processPayout);

export default router;
