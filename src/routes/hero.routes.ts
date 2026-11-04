import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.middleware';
import {
  getHeroSlides,
  getAllHeroSlidesAdmin,
  createHeroSlide,
  updateHeroSlide,
  deleteHeroSlide
} from '../controllers/hero.controller';

const router = Router();

// Public route for landing page
router.get('/', getHeroSlides);

// Admin routes for CMS management
router.get('/all', requireAdmin, getAllHeroSlidesAdmin);
router.get('/admin', requireAdmin, getAllHeroSlidesAdmin);
router.post('/', requireAdmin, createHeroSlide);
router.put('/:id', requireAdmin, updateHeroSlide);
router.delete('/:id', requireAdmin, deleteHeroSlide);

export default router;
