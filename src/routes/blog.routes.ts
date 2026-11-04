import { Router } from 'express';
import { requireAdmin } from '../middleware/auth.middleware';
import { createBlog, getPublishedBlogs, getAllBlogs, getBlogBySlug, updateBlog, publishBlog, deleteBlog } from '../controllers/blog.controller';

const router = Router();

router.get('/', getPublishedBlogs); // Public
router.get('/all', requireAdmin, getAllBlogs);
router.get('/:slug', getBlogBySlug); // Public (SEO)
router.post('/', requireAdmin, createBlog);
router.put('/:id', requireAdmin, updateBlog);
router.put('/:id/publish', requireAdmin, publishBlog);
router.delete('/:id', requireAdmin, deleteBlog);

export default router;
