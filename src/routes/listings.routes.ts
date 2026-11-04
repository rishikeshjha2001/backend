import { Router } from 'express';
import { 
  createVenue, 
  getVenues, 
  getVenueById, 
  updateVenue, 
  deleteVenue, 
  searchListings 
} from '../controllers/listings.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.get('/search', searchListings);
router.get('/', getVenues);
router.get('/:id', getVenueById);
router.post('/', requireAuth, createVenue);
router.put('/:id', requireAuth, updateVenue);
router.delete('/:id', requireAuth, deleteVenue);

export default router;
