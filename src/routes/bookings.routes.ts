import { Router } from 'express';
import { createBooking, getPartnerBookings, updateBookingStatus, getUserBookings, getBookingById } from '../controllers/bookings.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/', requireAuth, getUserBookings);
router.get('/my', requireAuth, getUserBookings);
router.post('/', requireAuth, createBooking);
router.get('/partner/:partnerId', requireAuth, getPartnerBookings);
router.get('/:id', requireAuth, getBookingById);
router.put('/:id/status', requireAuth, updateBookingStatus);

export default router;
