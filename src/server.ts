import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import hpp from 'hpp';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import Razorpay from 'razorpay';

import { requireAuth, requireAdmin, requirePartner } from './middleware/auth.middleware';

// Route Imports
import authRoutes from './routes/auth.routes';
import adminRoutes from './routes/admin.routes';
import eventsRoutes from './routes/events.routes';
import offersRoutes from './routes/offers.routes';
import blogRoutes from './routes/blog.routes';
import notificationRoutes from './routes/notification.routes';
import announcementRoutes from './routes/announcement.routes';
import exportRoutes from './routes/export.routes';
import userRoutes from './routes/user.routes';
import loksafariRoutes from './routes/loksafari.routes';
import aiRoutes from './routes/ai.routes';
import bookingsRoutes from './routes/bookings.routes';
import listingsRoutes from './routes/listings.routes';
import paymentsRoutes from './routes/payments.routes';
import ordersRoutes from './routes/orders.routes';
import payoutsRoutes from './routes/payouts.routes';
import auditRoutes from './routes/audit.routes';
import seoRoutes from './routes/seo.routes';
import referralsRoutes from './routes/referrals.routes';
import managerRoutes from './routes/manager.routes';
import messageRoutes from './routes/messages.routes';
import partnerRoutes from './routes/partner.routes';
import heroRoutes from './routes/hero.routes';
import sectionRoutes from './routes/section.routes';
import categoryRoutes from './routes/category.routes';
import uploadRoutes from './routes/upload.routes';
import careerRoutes from './routes/career.routes';
import adminActivityRoutes from './routes/adminActivity.routes';
import supportRoutes from './routes/support.routes';
import path from 'path';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const prisma = new PrismaClient();
const PORT = process.env.PORT || 4000;

// ==========================================
// ENTERPRISE SECURITY MIDDLEWARE
// ==========================================

// 1. Security Headers (HSTS, Clickjacking, CSP, MIME sniffing, XSS)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://checkout.razorpay.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      connectSrc: ["'self'", 'https://*.happylokam.com', 'https://api.razorpay.com'],
      frameAncestors: ["'none'"],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
  noSniff: true,
  hidePoweredBy: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// 1.5 CORS (Whitelisted domains only; allow mobile apps with no origin)
const ALLOWED_ORIGINS = [
  'https://happylokam.com',
  'https://www.happylokam.com',
  'https://admin.happylokam.com',
  'https://partner.happylokam.com',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:8081',
];

app.use(cors({
  origin: (origin: any, callback: any) => {
    // Allow requests with no origin (mobile apps, curl, or server-to-server)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.happylokam.com')) {
      return callback(null, origin);
    }
    return callback(new Error('CORS policy: Access denied for this origin.'));
  },
  credentials: true
}));


// 2. Anti-DDoS & Brute Force (1000 requests per 15 mins per IP)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { success: false, error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false }
});
app.use('/api', limiter);

// RAW BODY PARSER FOR WEBHOOKS (Must be before express.json)
import { handleRazorpayWebhook } from './controllers/webhook.controller';
app.post('/api/v1/webhooks/razorpay', express.raw({ type: 'application/json' }), handleRazorpayWebhook);

// 3. Body Parser
app.use(express.json({ limit: '50mb' }));

// 4. HTTP Parameter Pollution Protection
app.use(hpp());

// 5. Cookie Parser (for reading HTTP-only auth cookies)
app.use(cookieParser());



// ==========================================
// RAZORPAY
// ==========================================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || '',
});

// Public + Auth
app.use('/api/v1/auth', authRoutes);

// Admin Routes (protected by requireAdmin / requireManager)
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/admin/export', exportRoutes);
app.use('/api/v1/admin/payments', paymentsRoutes);
app.use('/api/v1/admin/orders', ordersRoutes);
app.use('/api/v1/admin/payouts', payoutsRoutes);
app.use('/api/v1/admin/audit', auditRoutes);
app.use('/api/v1/admin/seo', seoRoutes);
app.use('/api/v1/admin/referrals', referralsRoutes);

// Public Referral Validation & Rewards
app.use('/api/v1/referrals', referralsRoutes);

// Payments (User order creation, verify, webhook)
app.use('/api/v1/payments', paymentsRoutes);

// Public + Admin CRUD
app.use('/api/v1/events', eventsRoutes);
app.use('/api/v1/event', eventsRoutes);
app.use('/api/v1/offers', offersRoutes);
app.use('/api/v1/offer', offersRoutes);
app.use('/api/v1/blogs', blogRoutes);
app.use('/api/v1/blog', blogRoutes);
app.use('/api/v1/loksafari', loksafariRoutes);
app.use('/api/v1/packages', loksafariRoutes);
app.use('/api/v1/listings', listingsRoutes);
app.use('/api/v1/venues', listingsRoutes);
app.use('/api/v1/search', listingsRoutes);
app.use('/api/v1/hero-slides', heroRoutes);
app.use('/api/v1/career', careerRoutes);
app.use('/api/v1/admin/career', careerRoutes);
app.use('/api/v1/admin/activity-notifications', adminActivityRoutes);
app.use('/api/v1/support', supportRoutes);
app.use('/api/v1/admin/support', supportRoutes);
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use(['/api/v1/sections', '/sections'], sectionRoutes);
app.use(['/api/v1/section', '/section'], sectionRoutes);
app.use(['/api/v1/categories', '/categories'], categoryRoutes);
app.use(['/api/v1/category', '/category'], categoryRoutes);
app.use('/api/v1/upload', uploadRoutes);

// Protected
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/announcements', announcementRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/user', userRoutes);
app.use('/api/v1/bookings', bookingsRoutes);
app.use('/api/v1/ai', aiRoutes);
app.use('/api/v1/manager', managerRoutes);
app.use('/api/v1/messages', messageRoutes);
app.use(['/api/v1/partners', '/partners', '/api/v1/partner', '/partner'], partnerRoutes);

// ==========================================
// HEALTH CHECK & DUMMY GRAPHQL
// ==========================================
app.get(['/', '/api', '/api/v1'], (req, res) => {
  res.json({
    status: 'online',
    message: 'HappyLokam Production API v1 is active and healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    endpoints: {
      health: '/api/v1/health',
      events: '/api/v1/events',
      listings: '/api/v1/listings',
      auth: '/api/v1/auth',
      bookings: '/api/v1/bookings',
      payments: '/api/v1/payments/create-order'
    }
  });
});

app.get(['/health', '/api/health', '/api/v1/health'], (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), version: '2.0.0' });
});


// GraphQL endpoint removed - all APIs use REST /api/v1/* routes


// Global Error Handler (Safely catches malformed JSON and avoids HTML 500 dumps)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof SyntaxError && (err as any).status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      error: 'Invalid JSON payload received'
    });
  }
  console.error('Unhandled server error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// ==========================================
// START SERVER
// ==========================================
app.listen(Number(PORT), '0.0.0.0', () => {
  console.log(`\n🚀 HappyLokam Backend v2.0 running on http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🔒 Security: Helmet + Rate Limiter + HPP + HTTP-Only Cookies\n`);
});
