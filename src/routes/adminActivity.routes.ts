import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.middleware';
import {
  getAdminActivities,
  markAdminActivityAsRead,
  markAllAdminActivitiesAsRead,
  deleteAdminActivity,
} from '../controllers/adminActivity.controller';

const router = Router();

// Protect all admin activity endpoints with administrative authorization
router.use(requireAdmin);

router.get('/', getAdminActivities);
router.patch('/:id/read', markAdminActivityAsRead);
router.post('/mark-all-read', markAllAdminActivitiesAsRead);
router.delete('/:id', deleteAdminActivity);

export default router;
