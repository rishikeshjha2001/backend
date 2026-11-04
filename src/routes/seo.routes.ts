import { Router } from 'express';
import { getSeoMetadata, updateSeoMetadata } from '../controllers/seo.controller';
import { requireAdmin } from '../middleware/auth.middleware';
import { auditAdminAction } from '../middleware/audit.middleware';

const router = Router();

router.use(requireAdmin);

router.get('/', getSeoMetadata);
router.put('/:id', auditAdminAction('UPDATE_SEO', req => String(req.params.id)), updateSeoMetadata);

export default router;
