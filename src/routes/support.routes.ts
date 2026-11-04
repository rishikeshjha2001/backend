import { Router } from 'express';
import {
  createSupportTicket,
  getSupportTicketsAdmin,
  updateSupportTicketStatus,
  deleteSupportTicket,
  getUserSupportTickets,
} from '../controllers/support.controller';
import { requireAdmin, optionalAuth } from '../middleware/auth.middleware';

const router = Router();

// Public / User Routes
router.post('/create', optionalAuth, createSupportTicket);
router.get('/my-tickets', optionalAuth, getUserSupportTickets);

// Admin Routes (Strictly Protected)
router.get('/', requireAdmin, getSupportTicketsAdmin);
router.get('/admin', requireAdmin, getSupportTicketsAdmin);
router.patch('/:id/status', requireAdmin, updateSupportTicketStatus);
router.patch('/admin/:id/status', requireAdmin, updateSupportTicketStatus);
router.delete('/:id', requireAdmin, deleteSupportTicket);
router.delete('/admin/:id', requireAdmin, deleteSupportTicket);

export default router;
