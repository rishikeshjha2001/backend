import { Router } from 'express';
import { chatWithAi } from '../controllers/ai.controller';

const router = Router();

router.post('/chat', chatWithAi);

export default router;
