import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.middleware';
import { exportUsers, exportPartners, exportBookings, exportSubscriptions } from '../controllers/export.controller';

const router = Router();

router.get('/users', requireAdmin, exportUsers);
router.get('/partners', requireAdmin, exportPartners);
router.get('/bookings', requireAdmin, exportBookings);
router.get('/subscriptions', requireAdmin, exportSubscriptions);

export default router;
