import { Router } from 'express';
import { sendMessage, getInbox, getOutbox, markAsRead } from '../controllers/messages.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Protect all messaging routes
router.use(requireAuth);

router.post('/', sendMessage);
router.get('/inbox', getInbox);
router.get('/outbox', getOutbox);
router.put('/:id/read', markAsRead);

export default router;
