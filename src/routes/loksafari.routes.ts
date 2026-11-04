import { Router } from 'express';
import {
  createPackage,
  getAllPackages,
  getActivePackages,
  getPackageById,
  updatePackage,
  deletePackage
} from '../controllers/loksafari.controller';
import { requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// Public routes for customers & mobile app
router.get('/active', getActivePackages);
router.get('/', getAllPackages);
router.get('/:id', getPackageById);

// Admin routes for CMS management
router.post('/', requireAdmin, createPackage);
router.put('/:id', requireAdmin, updatePackage);
router.delete('/:id', requireAdmin, deletePackage);

export default router;
