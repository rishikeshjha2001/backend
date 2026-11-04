import { Router } from 'express';
import {
  submitCareerApplication,
  getCareerApplicationsAdmin,
  updateCareerApplicationStatus,
  deleteCareerApplication,
} from '../controllers/career.controller';
import { requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// Public: Apply for a job
router.post('/apply', submitCareerApplication);
router.post('/', submitCareerApplication);

// Admin: Review, search, filter, update applications (Protected)
router.get('/', requireAdmin, getCareerApplicationsAdmin);
router.get('/all', requireAdmin, getCareerApplicationsAdmin);
router.patch('/:id', requireAdmin, updateCareerApplicationStatus);
router.put('/:id', requireAdmin, updateCareerApplicationStatus);
router.delete('/:id', requireAdmin, deleteCareerApplication);

export default router;
