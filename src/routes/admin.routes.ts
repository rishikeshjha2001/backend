import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.middleware';
import { 
  getDashboardKPIs, 
  getAllUsers, 
  updateUserWallet,
  deleteUser, 
  getAllPartners, 
  getPartnerById, 
  verifyPartner, 
  approvePartner, 
  rejectPartner,
  createPartner,
  updatePartner,
  deletePartner, 
  getAllBookings, 
  updateAdminBookingStatus,
  deleteAdminBooking,
  getAllSubscriptions,
  getSubscriptionConfig,
  updateSubscriptionConfig,
  togglePartnerSubscription,
  createManager, 
  getManagers 
} from '../controllers/admin.controller';

const router = Router();

router.get('/dashboard', requireAdmin, getDashboardKPIs);
router.get('/users', requireAdmin, getAllUsers);
router.put('/users/:id/wallet', requireAdmin, updateUserWallet);
router.delete('/users/:id', requireAdmin, deleteUser);
router.get('/partners', requireAdmin, getAllPartners);
router.post('/partners', requireAdmin, createPartner);
router.get('/partners/:id', requireAdmin, getPartnerById);
router.put('/partners/:id', requireAdmin, updatePartner);
router.put('/partners/:id/verify', requireAdmin, verifyPartner);
router.put('/partners/:id/approve', requireAdmin, approvePartner);
router.put('/partners/:id/reject', requireAdmin, rejectPartner);
router.delete('/partners/:id', requireAdmin, deletePartner);
router.get('/bookings', requireAdmin, getAllBookings);
router.put('/bookings/:id/status', requireAdmin, updateAdminBookingStatus);
router.delete('/bookings/:id', requireAdmin, deleteAdminBooking);

// Subscription & ₹99 Management
router.get('/subscriptions', requireAdmin, getAllSubscriptions);
router.get('/subscriptions/config', requireAdmin, getSubscriptionConfig);
router.put('/subscriptions/config', requireAdmin, updateSubscriptionConfig);
router.put('/subscriptions/partners/:partnerId/toggle', requireAdmin, togglePartnerSubscription);

// Manager endpoints
router.post('/managers', requireAdmin, createManager);
router.get('/managers', requireAdmin, getManagers);

export default router;

