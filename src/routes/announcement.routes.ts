import { Router } from 'express';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.middleware';
import { createAnnouncement, getActiveAnnouncements, getAllAnnouncements, updateAnnouncement, deleteAnnouncement } from '../controllers/announcement.controller';

const router = Router();

router.get('/', optionalAuth, getActiveAnnouncements);
router.get('/active', optionalAuth, getActiveAnnouncements);
router.get('/all', requireAdmin, getAllAnnouncements);
router.post('/', requireAdmin, createAnnouncement);
router.put('/:id', requireAdmin, updateAnnouncement);
router.delete('/:id', requireAdmin, deleteAnnouncement);

export default router;
