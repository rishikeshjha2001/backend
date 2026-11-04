import { Router } from 'express';
import { createOrder, verifyPayment, getAllPayments, initiateRefund } from '../controllers/payments.controller';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.middleware';
import { auditAdminAction } from '../middleware/audit.middleware';

const router = Router();

// User payment endpoints (supports both authenticated and guest checkout)
router.post('/create-order', optionalAuth, createOrder);
router.post('/verify', optionalAuth, verifyPayment);
router.post('/verify-payment', optionalAuth, verifyPayment);

// Admin endpoints
router.get('/', requireAdmin, getAllPayments);
router.post('/:id/refund', requireAdmin, auditAdminAction('REFUND_PAYMENT', req => String(req.params.id)), initiateRefund);

export default router;

