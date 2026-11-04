import { Router } from 'express';
import { 
  createPartner, 
  getMyPartners, 
  createNote, 
  getNotes, 
  updateNoteStatus, 
  deleteNote,
  checkTicket, 
  markTicketUsed,
  getManagerDashboardStats
} from '../controllers/manager.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

// Protect all manager routes
router.use(requireAuth);

// Middleware to ensure user is a manager or admin
const isManager = (req: any, res: any, next: any) => {
  if (req.user?.role !== 'MANAGER' && req.user?.role !== 'ADMIN' && req.user?.role !== 'SUPER_ADMIN') {
    return res.status(403).json({ success: false, error: 'Forbidden. Manager access required.' });
  }
  next();
};

router.use(isManager);

// Dashboard
router.get('/dashboard', getManagerDashboardStats);

// Partner Onboarding
router.post('/partners', createPartner);
router.get('/partners', getMyPartners);

// Notes / Data Entry
router.post('/notes', createNote);
router.get('/notes', getNotes);
router.put('/notes/:id/status', updateNoteStatus);
router.delete('/notes/:id', deleteNote);

// Ticket Checking
router.post('/tickets/check', checkTicket);
router.post('/tickets/mark-used', markTicketUsed);

export default router;

