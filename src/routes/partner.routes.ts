import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requirePartner, requireAdmin } from '../middleware/auth.middleware';
import {
  registerPartner,
  loginPartner,
  getPartnerProfile,
  updatePartnerProfile,
  logoutPartner,
  sendOtp,
  verifyOtp,
  googleAuth,
  getPartnerReferrals,
  validateReferralCode,
  getPartnerServices,
  addPartnerService,
  updatePartnerService,
  deletePartnerService,
  getPartnerBookings,
  getPartnerBookingDetail,
  updateBookingStatus,
  getPartnerDashboard,
  getPartnerNotifications,
  markNotificationRead,
  adminListPartners,
  adminApprovePartner,
  adminRejectPartner,
  adminSuspendPartner,
  adminActivatePartner,
  adminReviewService,
  getAllPartnerServicesAdmin,
  payServerCharge,
  verifyServerCharge,
  getPartnerSubscriptionConfig,
} from '../controllers/partner.controller';

const router = Router();

const otpSendLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  message: { success: false, error: 'Too many OTP requests from this IP. Please wait a minute.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, error: 'Too many OTP verification attempts from this IP. Please try later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ==========================================
// PUBLIC AUTH & VALIDATION ROUTES
// ==========================================
router.post('/register', registerPartner);
router.post('/login', loginPartner);
router.post('/send-otp', otpSendLimiter, sendOtp);
router.post('/verify-otp', otpVerifyLimiter, verifyOtp);
router.post('/google-auth', googleAuth);
router.get('/referrals/validate/:code', validateReferralCode);
router.get('/subscription-config', getPartnerSubscriptionConfig);

// ==========================================
// PROTECTED PARTNER ROUTES
// ==========================================
router.get('/me', requirePartner, getPartnerProfile);
router.put('/update-profile', requirePartner, updatePartnerProfile);
router.post('/logout', requirePartner, logoutPartner);

// Partner ₹99 Server Charge & Cloud Activation
router.post('/pay-server-charge', requirePartner, payServerCharge);
router.post('/verify-server-charge', requirePartner, verifyServerCharge);

// Referral System
router.get('/referrals', requirePartner, getPartnerReferrals);

// Dashboard
router.get('/dashboard', requirePartner, getPartnerDashboard);

// Services CRUD
router.get('/services', requirePartner, getPartnerServices);
router.post('/services', requirePartner, addPartnerService);
router.put('/services/:id', requirePartner, updatePartnerService);
router.delete('/services/:id', requirePartner, deletePartnerService);

// Bookings
router.get('/bookings', requirePartner, getPartnerBookings);
router.get('/bookings/:id', requirePartner, getPartnerBookingDetail);
router.put('/bookings/:id/status', requirePartner, updateBookingStatus);

// Notifications
router.get('/notifications', requirePartner, getPartnerNotifications);
router.put('/notifications/:id/read', requirePartner, markNotificationRead);

// ==========================================
// ADMIN PARTNER MANAGEMENT ROUTES
// ==========================================
router.get('/admin/list', requireAdmin, adminListPartners);
router.get('/admin/services', requireAdmin, getAllPartnerServicesAdmin);
router.put('/admin/:id/approve', requireAdmin, adminApprovePartner);
router.put('/admin/:id/reject', requireAdmin, adminRejectPartner);
router.put('/admin/:id/suspend', requireAdmin, adminSuspendPartner);
router.put('/admin/:id/activate', requireAdmin, adminActivatePartner);
router.put('/admin/services/:id/review', requireAdmin, adminReviewService);

export default router;
