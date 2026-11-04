import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth.middleware';
import { sendNotification, getMyNotifications, markAsRead, getAllNotifications, getPublicNotifications } from '../controllers/notification.controller';

const router = Router();

router.post('/send', requireAdmin, sendNotification);
router.post('/broadcast', requireAdmin, sendNotification);
router.get('/public', getPublicNotifications);
router.get('/my', requireAuth, getMyNotifications);
router.put('/:id/read', requireAuth, markAsRead);
router.get('/all', requireAdmin, getAllNotifications);

export default router;
