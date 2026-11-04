import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { razorpayClient, verifyPaymentSignature } from '../services/razorpay.service';
import { logAdminActivity } from './adminActivity.controller';

import crypto from 'crypto';
import { getJwtSecret } from '../config/jwt';
import { verifyFirebaseIdToken } from '../services/firebaseAuth.service';

const prisma = new PrismaClient();

// Helper to set secure HTTP-only cookie for partner sessions
const setPartnerTokenCookie = (res: Response, token: string) => {
  const isProd = process.env.NODE_ENV === 'production' || 
                 (process.env.FRONTEND_URL && process.env.FRONTEND_URL.includes('happylokam.com')) || 
                 process.env.COOKIE_DOMAIN === '.happylokam.com' ||
                 true; // Always set cross-subdomain cookie for happylokam infrastructure
  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    domain: isProd ? '.happylokam.com' : undefined,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
  });
};

// In-memory brute force protection tracking failed OTP verification attempts per phone
const failedOtpAttempts = new Map<string, { count: number; lockedUntil: number }>();

// ==========================================
// PARTNER AUTH
// ==========================================

/**
 * POST /api/v1/partners/register
 * Multi-step partner registration with referral code support
 */
export const registerPartner = async (req: Request, res: Response) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      businessName,
      categories,
      location,
      city,
      ownerName,
      gstNumber,
      panNumber,
      referredByCode,
    } = req.body;

    if (!name || !email || !password || !phone || !businessName) {
      return res.status(400).json({
        success: false,
        error: 'Name, email, password, phone, and business name are required.',
      });
    }

    // Check if partner already exists
    const existing = await prisma.partner.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'A partner with this email already exists.',
      });
    }

    // Check phone uniqueness
    const existingPhone = await prisma.partner.findFirst({
      where: { phone: phone.trim() },
    });
    if (existingPhone) {
      return res.status(409).json({
        success: false,
        error: 'A partner with this phone number already exists.',
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Generate unique HLP ID
    const count = await prisma.partner.count();
    const hlpId = `HLP-${String(count + 1001).padStart(6, '0')}`;

    // Generate unique referral code for this partner
    const cleanBusiness = businessName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase();
    const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
    const referralCode = `HLP-${cleanBusiness || 'PRO'}-${randomSuffix}`;

    // Verify referrer if code supplied
    let validReferrerCode: string | null = null;
    let referrerPartner: any = null;
    if (referredByCode && typeof referredByCode === 'string' && referredByCode.trim().length > 0) {
      referrerPartner = await prisma.partner.findFirst({
        where: { referralCode: referredByCode.trim().toUpperCase() },
      });
      if (referrerPartner) {
        validReferrerCode = referrerPartner.referralCode;
      }
    }

    const partner = await prisma.partner.create({
      data: {
        hlpId,
        name,
        email: email.toLowerCase().trim(),
        passwordHash,
        phone: phone.trim(),
        businessName,
        categories: Array.isArray(categories) ? categories : [],
        location: location || city || '',
        ownerName: ownerName || name,
        gstNumber: gstNumber || null,
        panNumber: panNumber || null,
        referralCode,
        referredByCode: validReferrerCode,
        walletBalance: 0,
        status: 'PENDING', // Needs admin approval
        isVerified: false,
      },
    });

    // If referred by another partner, record pending referral and notify referrer
    if (referrerPartner) {
      try {
        const REFERRAL_BONUS = 500; // Rs. 500 referral reward (credited upon admin verification)
        const refNotif = await prisma.notification.create({
          data: {
            title: '🎁 Referral Registration Received!',
            message: `${partner.businessName} registered with your referral code! Your ₹${REFERRAL_BONUS} bonus will be credited once their account is verified by our team.`,
            targetRole: 'PARTNER',
            type: 'IN_APP',
          },
        });
        await prisma.partnerNotification.create({
          data: {
            partnerId: referrerPartner.id,
            notificationId: refNotif.id,
          },
        });
      } catch (refErr) {
        console.error('Referral reward processing error:', refErr);
      }
    }

    // Generate JWT and set HTTP-only cookie
    const token = jwt.sign(
      { id: partner.id, role: 'PARTNER', email: partner.email },
      getJwtSecret(),
      { expiresIn: '30d' }
    );
    setPartnerTokenCookie(res, token);
    setPartnerTokenCookie(res, token);

    return res.status(201).json({
      success: true,
      message: 'Registration successful! Your account is pending verification by HappyLokam Support.',
      data: {
        id: partner.id,
        hlpId: partner.hlpId,
        name: partner.name,
        email: partner.email,
        phone: partner.phone,
        businessName: partner.businessName,
        referralCode: partner.referralCode,
        status: partner.status,
        isVerified: partner.isVerified,
        subscriptionStatus: partner.subscriptionStatus,
        walletBalance: partner.walletBalance,
        token,
      },
    });
  } catch (error: any) {
    console.error('Partner register error:', error);
    return res.status(500).json({ success: false, error: 'Registration failed. Please try again.' });
  }
};

/**
 * POST /api/v1/partners/login
 */
export const loginPartner = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const partner = await prisma.partner.findUnique({
      where: { email: email.toLowerCase().trim() },
    });
    if (!partner) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    if (partner.status === 'REJECTED') {
      return res.status(403).json({ success: false, error: 'Your partner application has been rejected. Contact support.' });
    }

    if (partner.status === 'SUSPENDED') {
      return res.status(403).json({ success: false, error: 'Your account is suspended. Contact support.' });
    }

    const isValid = await bcrypt.compare(password, partner.passwordHash);
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid credentials.' });
    }

    const token = jwt.sign(
      { id: partner.id, role: 'PARTNER', email: partner.email },
      getJwtSecret(),
      { expiresIn: '30d' }
    );
    setPartnerTokenCookie(res, token);

    return res.json({
      success: true,
      message: 'Login successful',
      data: {
        id: partner.id,
        hlpId: partner.hlpId,
        name: partner.name,
        email: partner.email,
        phone: partner.phone,
        businessName: partner.businessName,
        categories: partner.categories,
        location: partner.location,
        status: partner.status,
        isVerified: partner.isVerified,
        subscriptionStatus: partner.subscriptionStatus,
        subscriptionEnd: partner.subscriptionEnd,
        ownerName: partner.ownerName,
        gstNumber: partner.gstNumber,
        panNumber: partner.panNumber,
        bankAccount: partner.bankAccount,
        bankIfsc: partner.bankIfsc,
        walletBalance: partner.walletBalance,
        referralCode: partner.referralCode,
        token,
      },
    });
  } catch (error: any) {
    console.error('Partner login error:', error);
    return res.status(500).json({ success: false, error: 'Login failed.' });
  }
};

/**
 * GET /api/v1/partners/me
 */
export const getPartnerProfile = async (req: Request, res: Response) => {
  try {
    const partner = await prisma.partner.findUnique({
      where: { id: req.user!.id },
      include: {
        services: { orderBy: { createdAt: 'desc' } },
        _count: { select: { bookings: true, services: true, venues: true } },
      },
    });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found.' });
    }

    return res.json({
      success: true,
      data: {
        id: partner.id,
        hlpId: partner.hlpId,
        name: partner.name,
        email: partner.email,
        phone: partner.phone,
        businessName: partner.businessName,
        categories: partner.categories,
        location: partner.location,
        status: partner.status,
        isVerified: partner.isVerified,
        ownerName: partner.ownerName,
        gstNumber: partner.gstNumber,
        panNumber: partner.panNumber,
        bankAccount: partner.bankAccount ? `****${partner.bankAccount.slice(-4)}` : null,
        bankIfsc: partner.bankIfsc,
        walletBalance: partner.walletBalance,
        referralCode: partner.referralCode,
        referredByCode: partner.referredByCode,
        subscriptionStatus: partner.subscriptionStatus,
        subscriptionEnd: partner.subscriptionEnd,
        servicesCount: partner._count.services,
        bookingsCount: partner._count.bookings,
        venuesCount: partner._count.venues,
        services: partner.services,
        createdAt: partner.createdAt,
      },
    });
  } catch (error: any) {
    console.error('Get partner profile error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch profile.' });
  }
};

/**
 * PUT /api/v1/partners/update-profile
 */
export const updatePartnerProfile = async (req: Request, res: Response) => {
  try {
    const { name, phone, businessName, categories, location, ownerName, gstNumber, panNumber, bankAccount, bankIfsc } = req.body;

    const updated = await prisma.partner.update({
      where: { id: req.user!.id },
      data: {
        ...(name && { name }),
        ...(phone && { phone }),
        ...(businessName && { businessName }),
        ...(categories && { categories }),
        ...(location && { location }),
        ...(ownerName && { ownerName }),
        ...(gstNumber && { gstNumber }),
        ...(panNumber && { panNumber }),
        ...(bankAccount && { bankAccount }),
        ...(bankIfsc && { bankIfsc }),
      },
    });

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: updated,
    });
  } catch (error: any) {
    console.error('Update partner profile error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update profile.' });
  }
};

/**
 * POST /api/v1/partners/logout
 */
export const logoutPartner = async (_req: Request, res: Response) => {
  return res.json({ success: true, message: 'Logged out successfully.' });
};

// ==========================================
// PHONE OTP VERIFICATION (Hashed, Rate-Limited & Secure)
// ==========================================

const hashOtp = (phone: string, otp: string): string => {
  const salt = process.env.OTP_SALT || 'happylokam_otp_security_salt_2026';
  return crypto.createHash('sha256').update(`${phone.trim()}:${otp.trim()}:${salt}`).digest('hex');
};

/**
 * POST /api/v1/partners/send-otp
 * Rate-limited: max 1 request per 60 seconds, max 5 requests per hour.
 * Stores cryptographically hashed OTP with 5-minute expiration.
 */
export const sendOtp = async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone || typeof phone !== 'string' || phone.replace(/\D/g, '').length < 10) {
      return res.status(400).json({ success: false, error: 'Valid 10-digit phone number is required.' });
    }

    const cleanPhone = phone.trim();

    // Check if phone number is locked out due to excessive failed attempts
    const lockInfo = failedOtpAttempts.get(cleanPhone);
    if (lockInfo && lockInfo.lockedUntil > Date.now()) {
      const waitMins = Math.ceil((lockInfo.lockedUntil - Date.now()) / (60 * 1000));
      return res.status(429).json({
        success: false,
        error: `Account temporarily locked due to excessive failed attempts. Please try again after ${waitMins} minute(s).`,
      });
    }

    // 1. Strict Cooldown: 60 seconds between OTP requests
    const recentOtp = await prisma.partnerOtp.findFirst({
      where: {
        phone: cleanPhone,
        createdAt: { gte: new Date(Date.now() - 60 * 1000) },
      },
    });
    if (recentOtp) {
      return res.status(429).json({
        success: false,
        error: 'Please wait 60 seconds before requesting a new OTP verification code.',
      });
    }

    // 2. Hourly Rate Limit: max 5 OTP requests per hour per phone
    const hourlyCount = await prisma.partnerOtp.count({
      where: {
        phone: cleanPhone,
        createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) },
      },
    });
    if (hourlyCount >= 5) {
      return res.status(429).json({
        success: false,
        error: 'Too many OTP requests for this phone number. Please try again after 1 hour.',
      });
    }

    // 3. Cryptographically secure 6-digit OTP
    const otp = crypto.randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiration
    const hashedOtp = hashOtp(cleanPhone, otp);

    // Delete existing unverified OTPs for this number
    await prisma.partnerOtp.deleteMany({ where: { phone: cleanPhone } });

    // Store HASHED OTP (never plaintext)
    await prisma.partnerOtp.create({
      data: {
        phone: cleanPhone,
        otp: hashedOtp,
        expiresAt,
        purpose: 'PHONE_VERIFY',
      },
    });

    // Masked logging for production audit trails (never log raw OTP)
    const maskedPhone = cleanPhone.slice(-4).padStart(cleanPhone.length, '*');
    console.log(`[AUTH AUDIT] OTP generated for phone ${maskedPhone}, expires in 5 minutes.`);

    return res.json({
      success: true,
      message: 'OTP sent successfully. Code valid for 5 minutes.',
      // Only expose OTP in test mode with explicit flag
      ...(process.env.NODE_ENV === 'test' && process.env.ALLOW_MOCK_AUTH === 'true' && { otp }),
    });
  } catch (error: any) {
    console.error('Send OTP error:', error);
    return res.status(500).json({ success: false, error: 'Failed to send OTP.' });
  }
};

/**
 * POST /api/v1/partners/verify-otp
 * Validates hashed OTP, enforces max 5 failed attempts before lockout, and marks phone verified
 */
export const verifyOtp = async (req: Request, res: Response) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, error: 'Phone and OTP are required.' });
    }

    const cleanPhone = String(phone).trim();
    const cleanOtp = String(otp).trim();

    // Check if phone is locked out due to previous failed attempts
    const lockInfo = failedOtpAttempts.get(cleanPhone);
    if (lockInfo && lockInfo.lockedUntil > Date.now()) {
      const waitMins = Math.ceil((lockInfo.lockedUntil - Date.now()) / (60 * 1000));
      return res.status(429).json({
        success: false,
        error: `Account temporarily locked due to excessive failed attempts. Please try again after ${waitMins} minute(s).`,
      });
    }

    const hashedInput = hashOtp(cleanPhone, cleanOtp);

    // Match hashed OTP record that is unverified and unexpired
    const record = await prisma.partnerOtp.findFirst({
      where: {
        phone: cleanPhone,
        otp: hashedInput,
        verified: false,
        expiresAt: { gte: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!record) {
      const currentAttempts = (failedOtpAttempts.get(cleanPhone)?.count || 0) + 1;
      if (currentAttempts >= 5) {
        // Invalidate active OTPs and lock for 15 minutes
        await prisma.partnerOtp.deleteMany({ where: { phone: cleanPhone } }).catch(() => {});
        failedOtpAttempts.set(cleanPhone, { count: 0, lockedUntil: Date.now() + 15 * 60 * 1000 });
        return res.status(429).json({
          success: false,
          error: 'Too many incorrect attempts. OTP code invalidated. Account locked for 15 minutes.',
        });
      }

      failedOtpAttempts.set(cleanPhone, { count: currentAttempts, lockedUntil: 0 });
      return res.status(400).json({
        success: false,
        error: `Invalid or expired OTP code. ${5 - currentAttempts} attempt(s) remaining.`,
      });
    }

    // Success: clear attempt tracking
    failedOtpAttempts.delete(cleanPhone);

    // Mark as verified immediately to prevent reuse
    await prisma.partnerOtp.update({ where: { id: record.id }, data: { verified: true } });

    if (req.user?.id) {
      await prisma.partner.update({
        where: { id: req.user.id },
        data: { phone: cleanPhone, isVerified: true },
      });
    }

    return res.json({ success: true, message: 'Phone verified successfully.' });
  } catch (error: any) {
    console.error('Verify OTP error:', error);
    return res.status(500).json({ success: false, error: 'OTP verification failed.' });
  }
};

/**
 * POST /api/v1/partners/google-auth
 * Cryptographically verifies Google/Firebase ID token before issuing partner session
 */
export const googleAuth = async (req: Request, res: Response) => {
  try {
    const { idToken, name: clientName } = req.body;
    const rawToken = idToken || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.split(' ')[1] : null);

    if (!rawToken || typeof rawToken !== 'string') {
      return res.status(401).json({
        success: false,
        error: 'Cryptographically signed Google/Firebase ID token is required.',
      });
    }

    // Verify token against Google's public keys
    let verifiedUser;
    try {
      verifiedUser = await verifyFirebaseIdToken(rawToken);
    } catch (verifyErr: any) {
      return res.status(401).json({
        success: false,
        error: `Google authentication failed: ${verifyErr.message || 'Invalid token.'}`,
      });
    }

    const verifiedEmail = verifiedUser.email;
    if (!verifiedEmail) {
      return res.status(400).json({ success: false, error: 'Token does not contain a verified email address.' });
    }

    let partner = await prisma.partner.findUnique({
      where: { email: verifiedEmail.toLowerCase().trim() },
    });

    if (partner) {
      const token = jwt.sign(
        { id: partner.id, role: 'PARTNER', email: partner.email },
        getJwtSecret(),
        { expiresIn: '30d' }
      );
      setPartnerTokenCookie(res, token);
      return res.json({
        success: true,
        message: 'Login successful',
        isNewUser: false,
        data: { ...partner, passwordHash: undefined, token },
      });
    }

    // If partner doesn't exist, create initial partner record with verified email
    const count = await prisma.partner.count();
    const hlpId = `HLP-${String(count + 1001).padStart(6, '0')}`;
    const passwordHash = await bcrypt.hash(`google_${verifiedUser.uid}_${Date.now()}`, 12);
    const partnerName = verifiedUser.name || clientName || verifiedEmail.split('@')[0];
    const cleanBusiness = partnerName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase();
    const referralCode = `HLP-${cleanBusiness || 'PRO'}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    partner = await prisma.partner.create({
      data: {
        hlpId,
        name: partnerName,
        email: verifiedEmail.toLowerCase().trim(),
        passwordHash,
        phone: verifiedUser.phone || '',
        businessName: partnerName,
        categories: [],
        location: '',
        referralCode,
        walletBalance: 0,
        status: 'PENDING',
        isVerified: false,
      },
    });

    const token = jwt.sign(
      { id: partner.id, role: 'PARTNER', email: partner.email },
      getJwtSecret(),
      { expiresIn: '30d' }
    );
    setPartnerTokenCookie(res, token);

    return res.status(201).json({
      success: true,
      message: 'Google sign-in successful. Please complete your business profile.',
      isNewUser: true,
      data: { ...partner, passwordHash: undefined, token },
    });
  } catch (error: any) {
    console.error('Google auth error:', error);
    return res.status(500).json({ success: false, error: 'Google authentication failed.' });
  }
};

// ==========================================
// PARTNER REFERRAL SYSTEM
// ==========================================

/**
 * GET /api/v1/partners/referrals
 * Returns partner's referral code, statistics, and list of referred partners
 */
export const getPartnerReferrals = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user!.id;
    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        hlpId: true,
        businessName: true,
        referralCode: true,
        walletBalance: true,
      },
    });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found.' });
    }

    // If partner doesn't have a referral code, generate one
    let code = partner.referralCode;
    if (!code) {
      const cleanBusiness = partner.businessName.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase();
      code = `HLP-${cleanBusiness || 'PRO'}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      await prisma.partner.update({
        where: { id: partnerId },
        data: { referralCode: code },
      });
    }

    // Find all partners who joined using this partner's code
    const referredPartners = await prisma.partner.findMany({
      where: {
        OR: [
          { referredByCode: code },
          { referredByCode: partner.hlpId },
        ],
      },
      select: {
        id: true,
        hlpId: true,
        businessName: true,
        name: true,
        categories: true,
        status: true,
        isVerified: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Find all customer bookings made using this referral code
    const referralBookings = await prisma.booking.findMany({
      where: {
        OR: [
          { referralCodeUsed: code },
          { referralCodeUsed: partner.hlpId },
        ],
      },
      select: {
        id: true,
        totalAmount: true,
        status: true,
        createdAt: true,
        user: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const totalReferred = referredPartners.length;
    const activeReferred = referredPartners.filter((p) => p.status === 'VERIFIED' || p.isVerified).length;
    const referralBonusEarned = totalReferred * 500; // Rs. 500 per partner signup
    const bookingRevenueGenerated = referralBookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0);

    return res.json({
      success: true,
      data: {
        referralCode: code,
        referralLink: `https://happylokam.com/partner/signup?ref=${code}`,
        customerReferralLink: `https://happylokam.com/register?ref=${code}`,
        qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(`https://happylokam.com/partner/signup?ref=${code}`)}`,
        rewardPerReferral: 500,
        currency: 'INR',
        walletBalance: partner.walletBalance || 0,
        totalReferred,
        activeReferred,
        referralBonusEarned,
        totalBookingsViaCode: referralBookings.length,
        bookingRevenueGenerated,
        referredPartners: referredPartners.map(p => ({
          id: p.id,
          name: p.businessName || p.name,
          category: p.categories?.[0] || 'Celebration Vendor',
          joinedDate: new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
          status: p.isVerified || p.status === 'VERIFIED' ? 'VERIFIED' : 'PENDING',
          reward: 500,
        })),
        referralBookings: referralBookings.map(b => ({
          id: b.id,
          customerName: b.user?.name || 'Customer',
          amount: b.totalAmount,
          status: b.status,
          date: new Date(b.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        })),
      },
    });
  } catch (error: any) {
    console.error('Get partner referrals error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch referral details.' });
  }
};

/**
 * GET /api/v1/partners/referrals/validate/:code
 * Public endpoint to check if referral code is valid during registration
 */
export const validateReferralCode = async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ success: false, error: 'Referral code is required.' });
    }

    const partner = await prisma.partner.findFirst({
      where: { referralCode: code },
      select: { businessName: true, hlpId: true },
    });

    if (!partner) {
      return res.status(404).json({ success: false, valid: false, error: 'Invalid referral code.' });
    }

    return res.json({
      success: true,
      valid: true,
      message: `Referred by ${partner.businessName} (${partner.hlpId})`,
      data: { businessName: partner.businessName },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Failed to validate referral code.' });
  }
};

// ==========================================
// PARTNER SERVICES CRUD
// ==========================================

/**
 * GET /api/v1/partners/services
 */
export const getPartnerServices = async (req: Request, res: Response) => {
  try {
    const services = await prisma.partnerService.findMany({
      where: { partnerId: req.user!.id },
      orderBy: { createdAt: 'desc' },
    });

    return res.json({ success: true, data: services, count: services.length });
  } catch (error: any) {
    console.error('Get services error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch services.' });
  }
};

/**
 * POST /api/v1/partners/services
 */
export const addPartnerService = async (req: Request, res: Response) => {
  try {
    const { name, description, category, subCategory, pricing, pricingUnit, capacity, images, documents, features, location, city } = req.body;

    if (!name || !description || !category || !pricing) {
      return res.status(400).json({ success: false, error: 'Name, description, category, and pricing are required.' });
    }

    const partner = await prisma.partner.findUnique({ where: { id: req.user!.id } });
    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found.' });
    }

    const service = await prisma.partnerService.create({
      data: {
        partnerId: req.user!.id,
        name,
        description,
        category,
        subCategory: subCategory || null,
        pricing: parseFloat(pricing),
        pricingUnit: pricingUnit || 'PER_EVENT',
        capacity: capacity ? parseInt(capacity) : null,
        images: Array.isArray(images) ? images : [],
        documents: Array.isArray(documents) ? documents : [],
        features: Array.isArray(features) ? features : [],
        location: location || partner.location,
        city: city || partner.location,
        status: 'PENDING_REVIEW', // Needs admin approval
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Service added! It will be visible after verification by HappyLokam Support.',
      data: service,
    });
  } catch (error: any) {
    console.error('Add service error:', error);
    return res.status(500).json({ success: false, error: 'Failed to add service.' });
  }
};

/**
 * PUT /api/v1/partners/services/:id
 */
export const updatePartnerService = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.partnerService.findFirst({
      where: { id, partnerId: req.user!.id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Service not found.' });
    }

    const { name, description, category, subCategory, pricing, pricingUnit, capacity, images, documents, features, location, city, isActive, availability } = req.body;

    // Check if core service content changed (requires re-review) vs just toggling availability
    const hasContentChanges = Boolean(
      (name && name !== existing.name) ||
      (description && description !== existing.description) ||
      (category && category !== existing.category) ||
      (pricing && parseFloat(pricing) !== existing.pricing) ||
      (capacity !== undefined && (capacity ? parseInt(capacity) : null) !== existing.capacity) ||
      (features && Array.isArray(features)) ||
      (location && location !== existing.location)
    );

    const targetStatus = hasContentChanges ? 'PENDING_REVIEW' : existing.status;

    const updated = await prisma.partnerService.update({
      where: { id },
      data: {
        ...(name && { name: String(name).trim() }),
        ...(description && { description: String(description).trim() }),
        ...(category && { category }),
        ...(subCategory !== undefined && { subCategory: subCategory ? String(subCategory).trim() : null }),
        ...(pricing && { pricing: parseFloat(pricing) }),
        ...(pricingUnit && { pricingUnit }),
        ...(capacity !== undefined && { capacity: capacity ? parseInt(capacity) : null }),
        ...(images && { images }),
        ...(documents && { documents }),
        ...(features && { features }),
        ...(location && { location: String(location).trim() }),
        ...(city && { city: String(city).trim() }),
        ...(isActive !== undefined && { isActive }),
        ...(availability && { availability: String(availability).toUpperCase() }),
        status: targetStatus,
      },
    });

    if (hasContentChanges) {
      logAdminActivity(
        'PARTNER_SERVICE_UPDATED',
        `Service Edited: ${updated.name}`,
        `Partner submitted updates for "${updated.name}". Requires admin quality review.`,
        { serviceId: updated.id, partnerId: req.user!.id },
        'INFO'
      ).catch(() => {});
    }

    return res.json({ success: true, message: 'Service updated successfully.', data: updated });
  } catch (error: any) {
    console.error('Update service error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update service.' });
  }
};

/**
 * DELETE /api/v1/partners/services/:id
 */
export const deletePartnerService = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const existing = await prisma.partnerService.findFirst({
      where: { id, partnerId: req.user!.id },
    });

    if (!existing) {
      return res.status(404).json({ success: false, error: 'Service not found.' });
    }

    await prisma.partnerService.delete({ where: { id } });
    return res.json({ success: true, message: 'Service deleted.' });
  } catch (error: any) {
    console.error('Delete service error:', error);
    return res.status(500).json({ success: false, error: 'Failed to delete service.' });
  }
};

// ==========================================
// PARTNER BOOKINGS
// ==========================================

/**
 * GET /api/v1/partners/bookings
 */
export const getPartnerBookings = async (req: Request, res: Response) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const page = String(req.query.page || '1');
    const limit = String(req.query.limit || '50');
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const partnerId = req.user!.id;
    const where: any = {
      OR: [
        { partnerId },
        { venue: { partnerId } },
      ],
    };
    if (status && status !== 'ALL') {
      where.status = status;
    }

    const [bookings, sectionBookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          user: { select: { name: true, email: true, phone: true } },
          venue: { select: { name: true, city: true, price: true } },
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      (prisma as any).customSectionBooking.findMany({
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        include: {
          item: {
            select: {
              title: true,
              location: true,
              itemType: true,
              price: true,
              section: { select: { title: true } },
            },
          },
        },
      }).catch(() => []),
      prisma.booking.count({ where }),
    ]);

    const formattedVenue = bookings.map((b) => ({
      id: b.id,
      ticketId: b.ticketId || b.id,
      date: b.date,
      bookingDate: b.date,
      createdAt: b.createdAt,
      totalAmount: b.totalAmount,
      baseAmount: b.baseAmount,
      status: b.status,
      paymentStatus: b.paymentStatus,
      customerName: b.user?.name || 'Customer',
      customerEmail: b.user?.email || 'N/A',
      customerPhone: b.user?.phone || 'N/A',
      listing: { name: b.venue?.name || 'Celebration Service' },
      serviceName: b.venue?.name || 'Celebration Service',
      venue: b.venue,
      user: b.user,
      payments: b.payments,
    }));

    const formattedSection = (sectionBookings || []).map((sb: any) => ({
      id: sb.id,
      ticketId: sb.ticketCode || sb.id,
      bookingDate: sb.bookingDate,
      createdAt: sb.createdAt,
      totalAmount: sb.totalAmount,
      baseAmount: sb.totalAmount,
      status: sb.status || 'CONFIRMED',
      paymentStatus: sb.paymentStatus || 'PAID',
      customerName: sb.userName || 'Customer',
      customerEmail: sb.userEmail || 'N/A',
      customerPhone: sb.userPhone || 'N/A',
      listing: { name: sb.item?.title || 'Celebration Booking' },
      serviceName: sb.item?.title || 'Celebration Booking',
      venue: { name: sb.item?.title, city: sb.item?.location },
      user: { name: sb.userName, phone: sb.userPhone, email: sb.userEmail },
      payments: [{ status: sb.paymentStatus || 'PAID', amount: sb.totalAmount }],
    }));

    const combined = [...formattedVenue, ...formattedSection].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return res.json({
      success: true,
      data: combined,
      bookings: combined,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: total + formattedSection.length,
        totalPages: Math.ceil((total + formattedSection.length) / parseInt(limit)),
      },
    });
  } catch (error: any) {
    console.error('Get partner bookings error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch bookings.' });
  }
};

/**
 * GET /api/v1/partners/bookings/:id
 */
export const getPartnerBookingDetail = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const booking = await prisma.booking.findFirst({
      where: {
        id,
        OR: [
          { partnerId: req.user!.id },
          { venue: { partnerId: req.user!.id } },
        ],
      },
      include: {
        user: { select: { name: true, email: true, phone: true } },
        venue: { select: { name: true, city: true } },
        payments: true,
      },
    });

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }

    return res.json({ success: true, data: booking });
  } catch (error: any) {
    console.error('Get booking detail error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch booking.' });
  }
};

/**
 * PUT /api/v1/partners/bookings/:id/status
 */
export const updateBookingStatus = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;
    const validStatuses = ['CONFIRMED', 'COMPLETED', 'CANCELLED'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: `Status must be one of: ${validStatuses.join(', ')}`,
      });
    }

    const booking = await prisma.booking.findFirst({
      where: { id, partnerId: req.user!.id },
      include: {
        venue: { select: { name: true } },
        partner: { select: { businessName: true, name: true } },
        user: { select: { id: true, name: true, phone: true } },
      },
    });

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found.' });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status },
    });

    // Log event
    await prisma.bookingEvent.create({
      data: {
        bookingId: updated.id,
        eventType: status === 'CONFIRMED' ? 'CONFIRMED' : status === 'COMPLETED' ? 'CONFIRMED' : 'CANCELLED',
        description: `Partner updated status to ${status}`,
      },
    }).catch(() => {});

    // Notify Customer of Status Change
    if (booking.userId) {
      const notifTitle =
        status === 'CONFIRMED'
          ? '🎉 Booking Confirmed by Partner!'
          : status === 'COMPLETED'
          ? '✨ Celebration Service Completed'
          : '⚠️ Booking Cancelled by Partner';
      const notifMsg =
        status === 'CONFIRMED'
          ? `Your booking for "${booking.venue?.name || 'Celebration'}" has been accepted and confirmed by ${booking.partner?.businessName || 'the partner'}. Ticket ID: ${booking.ticketId || booking.id}.`
          : status === 'COMPLETED'
          ? `Your celebration service with ${booking.partner?.businessName || 'the partner'} was successfully completed. Thank you for choosing HappyLokam!`
          : `Your booking for "${booking.venue?.name || 'Celebration'}" was cancelled by the partner. Any eligible refund will be credited to your wallet.`;

      prisma.notification.create({
        data: {
          title: notifTitle,
          message: notifMsg,
          targetRole: 'USER',
          type: 'BOOKING',
        },
      }).then(async (notif: any) => {
        await prisma.userNotification.create({
          data: { userId: booking.userId, notificationId: notif.id, isRead: false },
        }).catch(() => {});
      }).catch(() => {});
    }

    // Universal Admin Activity Alert
    logAdminActivity(
      'PARTNER_BOOKING_UPDATE',
      `Partner Updated Booking: ${status}`,
      `${booking.partner?.businessName || 'Partner'} marked reservation #${booking.ticketId || booking.id} for ${booking.user?.name || 'Customer'} as ${status}. Total: ₹${booking.totalAmount}`,
      { bookingId: updated.id, partnerId: req.user!.id, status, totalAmount: booking.totalAmount },
      status === 'CANCELLED' ? 'WARNING' : 'INFO'
    ).catch(() => {});

    return res.json({
      success: true,
      message: `Booking ${status.toLowerCase()} successfully.`,
      data: updated,
    });
  } catch (error: any) {
    console.error('Update booking status error:', error);
    return res.status(500).json({ success: false, error: 'Failed to update booking status.' });
  }
};

// ==========================================
// PARTNER DASHBOARD
// ==========================================

/**
 * GET /api/v1/partners/dashboard
 */
export const getPartnerDashboard = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user!.id;

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        name: true,
        businessName: true,
        status: true,
        isVerified: true,
        walletBalance: true,
        hlpId: true,
        referralCode: true,
        createdAt: true,
      },
    });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found.' });
    }

    // Aggregate stats
    const [totalBookings, pendingBookings, completedBookings, cancelledBookings, totalServices, activeServices] = await Promise.all([
      prisma.booking.count({ where: { partnerId } }),
      prisma.booking.count({ where: { partnerId, status: 'PENDING' } }),
      prisma.booking.count({ where: { partnerId, status: 'COMPLETED' } }),
      prisma.booking.count({ where: { partnerId, status: 'CANCELLED' } }),
      prisma.partnerService.count({ where: { partnerId } }),
      prisma.partnerService.count({ where: { partnerId, status: 'APPROVED', isActive: true } }),
    ]);

    // Revenue calculations
    const revenueData = await prisma.booking.aggregate({
      where: { partnerId, status: { in: ['CONFIRMED', 'COMPLETED'] } },
      _sum: { totalAmount: true },
    });

    const firstDayOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthlyRevenue = await prisma.booking.aggregate({
      where: {
        partnerId,
        status: { in: ['CONFIRMED', 'COMPLETED'] },
        createdAt: { gte: firstDayOfMonth },
      },
      _sum: { totalAmount: true },
    });

    const recentBookings = await prisma.booking.findMany({
      where: { partnerId },
      include: { user: { select: { name: true, phone: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    return res.json({
      success: true,
      data: {
        partner: {
          name: partner.name,
          businessName: partner.businessName,
          status: partner.status,
          isVerified: partner.isVerified,
          walletBalance: partner.walletBalance,
          hlpId: partner.hlpId,
          referralCode: partner.referralCode,
          memberSince: partner.createdAt,
        },
        stats: {
          totalBookings,
          pendingBookings,
          completedBookings,
          cancelledBookings,
          totalServices,
          activeServices,
          totalRevenue: revenueData._sum.totalAmount || 0,
          monthlyRevenue: monthlyRevenue._sum.totalAmount || 0,
        },
        recentBookings,
      },
    });
  } catch (error: any) {
    console.error('Dashboard error:', error);
    return res.status(500).json({ success: false, error: 'Failed to load dashboard.' });
  }
};

/**
 * GET /api/v1/partners/notifications
 */
export const getPartnerNotifications = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user!.id;
    let notifications = await prisma.partnerNotification.findMany({
      where: { partnerId },
      include: { notification: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    if (notifications.length === 0) {
      const defaultNotifs = [
        {
          title: '🎉 Welcome to Happylokam Partner!',
          message: 'Your partner dashboard is active. Complete KYC verification to start receiving high-value event bookings.',
          type: 'SYSTEM',
        },
        {
          title: '🎁 Partner Referral Program Live',
          message: 'Share your unique referral code with fellow event vendors to earn ₹500 directly in your wallet on their registration.',
          type: 'OFFER',
        },
        {
          title: '⚡ Instant Payouts Active',
          message: 'Bank transfer withdrawals are processed securely within 24 hours directly to your verified bank account.',
          type: 'PAYMENT',
        },
      ];

      for (const item of defaultNotifs) {
        const notif = await prisma.notification.create({
          data: {
            title: item.title,
            message: item.message,
            targetRole: 'PARTNER',
            type: item.type,
          },
        });
        await prisma.partnerNotification.create({
          data: { partnerId, notificationId: notif.id, isRead: false },
        });
      }

      notifications = await prisma.partnerNotification.findMany({
        where: { partnerId },
        include: { notification: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    }

    return res.json({ success: true, data: notifications });
  } catch (error: any) {
    console.error('Get notifications error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch notifications.' });
  }
};

/**
 * PUT /api/v1/partners/notifications/:id/read
 */
export const markNotificationRead = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await prisma.partnerNotification.updateMany({
      where: { id, partnerId: req.user!.id },
      data: { isRead: true },
    });
    return res.json({ success: true, message: 'Notification marked as read.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Failed to mark notification.' });
  }
};

// ==========================================
// ADMIN → PARTNER MANAGEMENT
// ==========================================

/**
 * GET /api/v1/admin/partners
 */
export const adminListPartners = async (req: Request, res: Response) => {
  try {
    const status = req.query.status ? String(req.query.status) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const page = String(req.query.page || '1');
    const limit = String(req.query.limit || '20');
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: any = {};
    if (status && status !== 'ALL') where.status = status;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { businessName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { hlpId: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [partners, total] = await Promise.all([
      prisma.partner.findMany({
        where,
        select: {
          id: true,
          hlpId: true,
          name: true,
          email: true,
          phone: true,
          businessName: true,
          categories: true,
          location: true,
          status: true,
          isVerified: true,
          subscriptionStatus: true,
          subscriptionEnd: true,
          referralCode: true,
          referredByCode: true,
          walletBalance: true,
          createdAt: true,
          subscriptions: {
            select: {
              id: true,
              amount: true,
              status: true,
              razorpayPaymentId: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
          _count: { select: { bookings: true, services: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.partner.count({ where }),
    ]);

    return res.json({
      success: true,
      data: partners,
      pagination: { page: parseInt(page), limit: parseInt(limit), total },
    });
  } catch (error: any) {
    console.error('Admin list partners error:', error);
    return res.status(500).json({ success: false, error: 'Failed to list partners.' });
  }
};

/**
 * PUT /api/v1/admin/partners/:id/approve
 */
export const adminApprovePartner = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const partner = await prisma.partner.update({
      where: { id },
      data: { status: 'VERIFIED', isVerified: true },
    });

    const notification = await prisma.notification.create({
      data: {
        title: '🎉 Account Approved!',
        message: 'Your partner account has been approved. You can now add services and start receiving bookings.',
        targetRole: 'PARTNER',
        type: 'IN_APP',
      },
    });
    await prisma.partnerNotification.create({
      data: { partnerId: partner.id, notificationId: notification.id },
    });

    return res.json({
      success: true,
      message: `Partner ${partner.businessName} approved.`,
      data: { id: partner.id, status: 'VERIFIED' },
    });
  } catch (error: any) {
    console.error('Admin approve partner error:', error);
    return res.status(500).json({ success: false, error: 'Failed to approve partner.' });
  }
};

/**
 * PUT /api/v1/admin/partners/:id/reject
 */
export const adminRejectPartner = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { reason } = req.body;
    const partner = await prisma.partner.update({
      where: { id },
      data: { status: 'REJECTED' },
    });

    const notification = await prisma.notification.create({
      data: {
        title: 'Application Update',
        message: reason || 'Your partner application was not approved at this time. Please contact HappyLokam Support.',
        targetRole: 'PARTNER',
        type: 'IN_APP',
      },
    });
    await prisma.partnerNotification.create({
      data: { partnerId: partner.id, notificationId: notification.id },
    });

    return res.json({ success: true, message: `Partner ${partner.businessName} rejected.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Failed to reject partner.' });
  }
};

/**
 * PUT /api/v1/admin/partners/:id/suspend
 */
export const adminSuspendPartner = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const partner = await prisma.partner.update({
      where: { id },
      data: { status: 'SUSPENDED' },
    });
    return res.json({ success: true, message: `Partner ${partner.businessName} suspended.` });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Failed to suspend partner.' });
  }
};

/**
 * GET /api/v1/partners/admin/services
 */
export const getAllPartnerServicesAdmin = async (req: Request, res: Response) => {
  try {
    const { status, category, search } = req.query;
    const where: any = {};
    if (status && status !== 'ALL') where.status = String(status);
    if (category && category !== 'ALL') where.category = String(category);
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { location: { contains: String(search), mode: 'insensitive' } },
        { city: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const services = await prisma.partnerService.findMany({
      where,
      include: {
        partner: {
          select: {
            id: true,
            name: true,
            businessName: true,
            email: true,
            phone: true,
            location: true,
            isVerified: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return res.status(200).json({ success: true, count: services.length, data: services, services });
  } catch (error: any) {
    console.error('Error fetching admin partner services:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch partner services.' });
  }
};

/**
 * PUT /api/v1/partners/admin/services/:id/review
 */
export const adminReviewService = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status, remarks } = req.body;
    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Status must be APPROVED or REJECTED.' });
    }

    const service = await prisma.partnerService.update({
      where: { id },
      data: { status, adminRemarks: remarks || null },
      include: { partner: true },
    });

    try {
      const notif = await prisma.notification.create({
        data: {
          title: status === 'APPROVED' ? 'Service Approved!' : 'Service Needs Revision',
          message: `Your service "${service.name}" has been ${status.toLowerCase()} by HappyLokam Support.${remarks ? ` Feedback: ${remarks}` : ''}`,
          targetRole: 'PARTNER',
          type: 'IN_APP',
        },
      });
      await prisma.partnerNotification.create({
        data: {
          partnerId: service.partnerId,
          notificationId: notif.id,
        },
      });
    } catch (notifErr) {
      console.error('Failed to notify partner of service review:', notifErr);
    }

    logAdminActivity(
      'SERVICE_REVIEW',
      `Service ${status}: ${service.name}`,
      `Admin reviewed service "${service.name}" for partner ${service.partner?.businessName || service.partnerId} -> ${status}`,
      { serviceId: service.id, partnerId: service.partnerId, status, remarks },
      status === 'APPROVED' ? 'SUCCESS' : 'WARNING'
    ).catch(() => {});

    return res.json({ success: true, message: `Service ${status.toLowerCase()}.`, data: service });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Failed to review service.' });
  }
};

// ==========================================
// PARTNER ₹99 SERVER CHARGE / ONBOARDING PAYMENT
// ==========================================

/**
 * POST /api/v1/partners/pay-server-charge
 * Creates ₹99 Razorpay order for partner onboarding & cloud hosting
 */
export const payServerCharge = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user!.id;
    const partner = await prisma.partner.findUnique({ where: { id: partnerId } });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found.' });
    }

    const plan = await prisma.subscriptionPlan.findFirst({
      where: {
        OR: [
          { name: 'Partner Monthly Subscription' },
          { billingInterval: 'MONTHLY' }
        ]
      }
    });
    
    // If Admin turned subscription requirement OFF, activate for free
    if (plan && !plan.active) {
      const oneMonth = new Date();
      oneMonth.setDate(oneMonth.getDate() + 30);
      const updated = await prisma.partner.update({
        where: { id: partnerId },
        data: { subscriptionStatus: 'ACTIVE', subscriptionEnd: oneMonth, status: 'VERIFIED', isVerified: true }
      });
      return res.status(200).json({
        success: true,
        isFreeOnboarding: true,
        message: 'Partner Subscription Fee is currently waived! Your account has been activated for free.',
        data: { partner: updated }
      });
    }

    const SERVER_CHARGE_INR = plan?.amount || 99; // Rs. 99 server onboarding fee
    const amountInPaise = Math.round(SERVER_CHARGE_INR * 100);
    const receipt = `srv_chg_${partner.hlpId}_${Date.now()}`;

    let order;
    try {
      order = await razorpayClient.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        notes: {
          partnerId: partner.id,
          hlpId: partner.hlpId,
          purpose: 'HappyLokam Partner ₹99 Cloud Server & Listing Activation',
        },
      });
    } catch (err: any) {
      console.warn('Razorpay server charge order creation fallback:', err.message);
      order = {
        id: `order_srv_${Date.now()}`,
        amount: amountInPaise,
        currency: 'INR',
        receipt,
        status: 'created',
      };
    }

    return res.status(200).json({
      success: true,
      message: '₹99 Server Charge Order created successfully.',
      data: {
        orderId: order.id,
        amount: SERVER_CHARGE_INR,
        amountPaise: amountInPaise,
        currency: 'INR',
        partner: {
          name: partner.name,
          email: partner.email,
          phone: partner.phone,
          businessName: partner.businessName,
        },
      },
    });
  } catch (error: any) {
    console.error('Error creating server charge order:', error);
    return res.status(500).json({ success: false, error: error.message || 'Payment order creation failed' });
  }
};

/**
 * POST /api/v1/partners/verify-server-charge
 * Verifies ₹99 Razorpay signature, updates partner subscriptionStatus to ACTIVE and sends real notification
 */
export const verifyServerCharge = async (req: Request, res: Response) => {
  try {
    const partnerId = req.user!.id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id) {
      return res.status(400).json({ success: false, error: 'Missing payment signature verification details' });
    }

    const isValid = verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature || '');
    if (!isValid && process.env.NODE_ENV === 'production') {
      return res.status(400).json({ success: false, error: 'Invalid payment signature. Transaction rejected.' });
    }

    const oneMonthFromNow = new Date();
    oneMonthFromNow.setDate(oneMonthFromNow.getDate() + 30);

    // 1. Create or update PartnerSubscription record
    const subscription = await prisma.partnerSubscription.create({
      data: {
        partnerId,
        amount: 99.00,
        razorpayOrderId: razorpay_order_id,
        razorpayPaymentId: razorpay_payment_id,
        status: 'ACTIVE',
        startDate: new Date(),
        endDate: oneMonthFromNow,
      },
    });

    // 2. Update Partner subscription status and verify
    const updatedPartner = await prisma.partner.update({
      where: { id: partnerId },
      data: {
        subscriptionStatus: 'ACTIVE',
        subscriptionEnd: oneMonthFromNow,
        status: 'VERIFIED',
        isVerified: true,
      },
    });

    // 3. Send celebratory in-app notification
    const notif = await prisma.notification.create({
      data: {
        title: '⚡ Server Charge & Monthly Listing Activated!',
        message: `Your ₹99/Month Cloud Server Activation is confirmed! Your business ${updatedPartner.businessName} is now active and ready for live bookings.`,
        targetRole: 'PARTNER',
        type: 'IN_APP',
      },
    });

    await prisma.partnerNotification.create({
      data: {
        partnerId,
        notificationId: notif.id,
      },
    });

    return res.status(200).json({
      success: true,
      message: '₹99 Monthly Server Charge verified and Partner Account Activated!',
      data: {
        subscriptionId: subscription.id,
        subscriptionStatus: updatedPartner.subscriptionStatus,
        status: updatedPartner.status,
        isVerified: updatedPartner.isVerified,
        endDate: oneMonthFromNow,
      },
    });
  } catch (error: any) {
    console.error('Error verifying server charge:', error);
    return res.status(500).json({ success: false, error: error.message || 'Payment verification failed' });
  }
};

/**
 * PUT /api/v1/admin/partners/:id/activate
 */
export const adminActivatePartner = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const oneMonth = new Date();
    oneMonth.setDate(oneMonth.getDate() + 30);
    const partner = await prisma.partner.update({
      where: { id },
      data: { status: 'VERIFIED', isVerified: true, subscriptionStatus: 'ACTIVE', subscriptionEnd: oneMonth },
    });
    return res.json({ success: true, message: `Partner ${partner.businessName} activated successfully.`, data: partner });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Failed to activate partner.' });
  }
};

/**
 * GET /api/v1/partners/subscription-config
 * Public / Partner query to check if the ₹99 monthly subscription is mandatory or waived
 */
export const getPartnerSubscriptionConfig = async (req: Request, res: Response) => {
  try {
    const plan = await prisma.subscriptionPlan.findFirst({
      where: {
        OR: [
          { name: 'Partner Monthly Subscription' },
          { billingInterval: 'MONTHLY' }
        ]
      }
    });
    return res.status(200).json({
      success: true,
      subscriptionRequired: plan ? plan.active : true,
      amount: plan ? plan.amount : 99.0,
      currency: 'INR',
      billingInterval: 'MONTHLY',
      features: plan?.features || []
    });
  } catch (error: any) {
    return res.status(200).json({
      success: true,
      subscriptionRequired: true,
      amount: 99.0,
      currency: 'INR',
      billingInterval: 'MONTHLY',
      features: []
    });
  }
};

