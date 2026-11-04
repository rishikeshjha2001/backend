import { Router } from 'express';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware';
import { getAdminReferralDashboard, getBookingsByReferralCode, validateReferralCode } from '../controllers/referrals.controller';

const router = Router();

// Public: Validate referral code for instant discounts & rewards
router.get('/validate/:code', validateReferralCode);

// Admin: Full referral dashboard
router.get('/', requireAdmin, getAdminReferralDashboard);

// Admin/Partner: Get bookings by specific referral code
router.get('/code/:code', requireAuth, getBookingsByReferralCode);

export default router;
