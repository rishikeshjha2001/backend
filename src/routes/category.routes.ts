import { Router } from 'express';
import {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  createSectionItem,
} from '../controllers/section.controller';
import { requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// Public browsing
router.get('/', getAllCategories);
router.get('/:id', getCategoryById);

// Admin Category Management (Protected)
router.post('/', requireAdmin, createCategory);
router.put('/:id', requireAdmin, updateCategory);
router.delete('/:id', requireAdmin, deleteCategory);
router.post('/:categoryId/items', requireAdmin, createSectionItem);

export default router;
