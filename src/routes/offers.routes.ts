import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.middleware';
import { createOffer, getActiveOffers, getAllOffers, updateOffer, deleteOffer, validateCoupon } from '../controllers/offers.controller';

const router = Router();

router.get('/', getActiveOffers); // Public
router.post('/validate', validateCoupon); // Public coupon validation for checkout
router.get('/all', requireAdmin, getAllOffers);
router.post('/', requireAdmin, createOffer);
router.put('/:id', requireAdmin, updateOffer);
router.delete('/:id', requireAdmin, deleteOffer);

export default router;
