import { Router } from 'express';
import { registerUser, login, getMe, logout, firebaseLogin, refreshToken, resetPassword } from '../controllers/auth.controller';
import { registerPartner } from '../controllers/partner.controller';
import { requireAuth } from '../middleware/auth.middleware';

const router = Router();

router.post('/register', registerUser);
router.post('/partner/register', registerPartner);
router.post('/login', login);
router.post('/firebase-login', firebaseLogin);
router.post('/reset-password', resetPassword);
router.post('/refresh', refreshToken);
router.get('/me', requireAuth, getMe);
router.post('/logout', logout);

export default router;
