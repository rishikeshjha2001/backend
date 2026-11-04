import { Router } from 'express';
import {
  getAllSections,
  getSectionById,
  createSection,
  updateSection,
  deleteSection,
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getSectionItemById,
  createSectionItem,
  updateSectionItem,
  deleteSectionItem,
  bookSectionItem,
  getMySectionBookings,
  getAllSectionBookings,
  updateSectionBookingStatus,
} from '../controllers/section.controller';
import { optionalAuth, requireAdmin } from '../middleware/auth.middleware';

const router = Router();

// ==========================================
// PUBLIC BROWSING
// ==========================================
router.get('/', getAllSections);
router.get('/categories', getAllCategories);
router.get('/categories/:id', getCategoryById);

// Dynamic item bookings & booking lists (Must precede /:id)
router.get('/bookings/my', optionalAuth, getMySectionBookings);
router.get('/bookings/all', requireAdmin, getAllSectionBookings);
router.put('/bookings/:id/status', requireAdmin, updateSectionBookingStatus);

router.get('/items/:itemId', getSectionItemById);
router.post('/items/:itemId/book', optionalAuth, bookSectionItem);

// Specific section by ID
router.get('/:id', getSectionById);

// ==========================================
// ADMIN SECTION MANAGEMENT
// ==========================================
router.post('/', requireAdmin, createSection);
router.put('/:id', requireAdmin, updateSection);
router.delete('/:id', requireAdmin, deleteSection);

// ==========================================
// ADMIN CATEGORY MANAGEMENT
// ==========================================
router.post('/categories', requireAdmin, createCategory);
router.put('/categories/:id', requireAdmin, updateCategory);
router.delete('/categories/:id', requireAdmin, deleteCategory);

// ==========================================
// ADMIN ITEM MANAGEMENT
// ==========================================
router.post('/items', requireAdmin, createSectionItem);
router.post('/:sectionId/items', requireAdmin, createSectionItem);
router.post('/categories/:categoryId/items', requireAdmin, createSectionItem);
router.put('/items/:itemId', requireAdmin, updateSectionItem);
router.delete('/items/:itemId', requireAdmin, deleteSectionItem);

export default router;

