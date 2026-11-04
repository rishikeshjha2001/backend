import { Router } from 'express';
import { requireAdmin, requireAuth, optionalAuth } from '../middleware/auth.middleware';
import {
  createEvent,
  getEvents,
  getAllEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  bookEvent,
  getEventBookings,
  getUserEventBookings,
  verifyTicket
} from '../controllers/events.controller';

const router = Router();

// Public routes
router.get('/', getEvents);
router.get('/verify/:ticketId', verifyTicket);

// User routes (supports both logged-in and guest bookings) — MUST come before /:id
router.post('/book', optionalAuth, bookEvent);
router.get('/my/bookings', requireAuth, getUserEventBookings);

// Admin routes — MUST come before /:id
router.get('/all', requireAdmin, getAllEvents);
router.post('/', requireAdmin, createEvent);

// Dynamic param routes LAST
router.get('/:id', getEventById);
router.get('/:id/bookings', requireAdmin, getEventBookings);
router.put('/:id', requireAdmin, updateEvent);
router.delete('/:id', requireAdmin, deleteEvent);

export default router;
