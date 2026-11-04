import { Router } from 'express';
import { getAllOrders } from '../controllers/orders.controller';
import { requireAdmin } from '../middleware/auth.middleware';

const router = Router();

router.use(requireAdmin);

router.get('/', getAllOrders);

export default router;
