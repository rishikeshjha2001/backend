import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import { getProfile, updateProfile, getUserBookings, registerDeviceToken, getWallet, changePassword } from '../controllers/user.controller';

const router = Router();

router.get('/profile', requireAuth, getProfile);
router.put('/profile', requireAuth, updateProfile);
router.get('/wallet', requireAuth, getWallet);
router.post('/change-password', requireAuth, changePassword);
router.put('/change-password', requireAuth, changePassword);
router.get('/bookings', requireAuth, getUserBookings);
router.post('/device-token', requireAuth, registerDeviceToken);

export default router;
