import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ==========================================
// ADMIN: Get Full Referral Dashboard Data
// ==========================================
export const getAdminReferralDashboard = async (req: Request, res: Response) => {
  try {
    // Get all partners with their referral codes
    const partners = await prisma.partner.findMany({
      where: { referralCode: { not: null } },
      select: {
        id: true,
        hlpId: true,
        name: true,
        businessName: true,
        referralCode: true,
        status: true,
      }
    });

    // Get all bookings that used a referral code
    const referralBookings = await prisma.booking.findMany({
      where: { referralCodeUsed: { not: null } },
      select: {
        id: true,
        referralCodeUsed: true,
        totalAmount: true,
        userId: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    const referralEventBookings = await prisma.eventBooking.findMany({
      where: { referralCodeUsed: { not: null } },
      select: {
        id: true,
        referralCodeUsed: true,
        totalAmount: true,
        userId: true,
        createdAt: true,
        user: {
          select: { id: true, name: true, email: true }
        }
      }
    });

    const allBookings: any[] = [...referralBookings, ...referralEventBookings];

    // Get all partners who signed up via referrals
    const referredPartnersAll = await prisma.partner.findMany({
      where: { referredByCode: { not: null } },
      select: {
        id: true,
        hlpId: true,
        name: true,
        businessName: true,
        referredByCode: true,
        status: true,
        isVerified: true,
        createdAt: true,
      }
    });

    // Build per-partner stats
    const partnerStats = partners.map(partner => {
      const partnerBookings = allBookings.filter(
        (b: any) => b.referralCodeUsed === partner.referralCode || b.referralCodeUsed === partner.hlpId
      );

      const signups = referredPartnersAll.filter(
        (p: any) => p.referredByCode === partner.referralCode || p.referredByCode === partner.hlpId
      );

      const bookingRevenue = partnerBookings.reduce((sum: number, b: any) => sum + (b.totalAmount || 0), 0);
      const referralBonusEarned = signups.length * 500; // Rs. 500 per partner signup

      return {
        partnerId: partner.id,
        partnerName: partner.businessName || partner.name,
        hlpId: partner.hlpId,
        referralCode: partner.referralCode,
        referralLink: `https://happylokam.com/partner/signup?ref=${partner.referralCode}`,
        status: partner.status === 'VERIFIED' || partner.status === 'APPROVED' ? 'Active' : 'Pending',
        totalSignups: signups.length,
        bookingsViaCode: partnerBookings.length,
        bookingRevenueGenerated: bookingRevenue,
        referralBonusEarned,
        signups: signups.map((s: any) => ({
          id: s.id,
          name: s.businessName || s.name,
          status: s.status,
          joinedAt: s.createdAt,
        })),
        users: partnerBookings.map((b: any) => ({
          userId: b.user?.id,
          userName: b.user?.name || 'Customer',
          userEmail: b.user?.email,
          bookingAmount: b.totalAmount,
          bookedAt: b.createdAt,
        })),
      };
    });

    // Aggregate stats
    const totalSignupsViaReferral = partnerStats.reduce((sum, p) => sum + p.totalSignups, 0);
    const totalBookingsViaReferral = partnerStats.reduce((sum, p) => sum + p.bookingsViaCode, 0);
    const totalReferralRevenue = partnerStats.reduce((sum, p) => sum + p.bookingRevenueGenerated, 0);
    const totalBonusDistributed = partnerStats.reduce((sum, p) => sum + p.referralBonusEarned, 0);

    res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalSignupsViaReferral,
          totalBookingsViaReferral,
          totalReferralRevenue,
          totalBonusDistributed,
        },
        partners: partnerStats,
      }
    });
  } catch (error: any) {
    console.error('Referral dashboard error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// PUBLIC: Get bookings by referral code (for partner dashboard)
// ==========================================
export const getBookingsByReferralCode = async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code).trim().toUpperCase();
    const caller = (req as any).user;

    // Security check: Only Admin or the Partner/User owning this referral code may view bookings
    if (caller && caller.role !== 'ADMIN' && caller.role !== 'SUPER_ADMIN') {
      const isOwnerPartner = await prisma.partner.findFirst({
        where: {
          OR: [
            { id: caller.id, referralCode: code },
            { id: caller.id, hlpId: code },
          ]
        }
      });

      const isOwnerUser = !isOwnerPartner ? await prisma.user.findFirst({
        where: { id: caller.id, referralCode: code }
      }) : null;

      if (!isOwnerPartner && !isOwnerUser) {
        return res.status(403).json({
          success: false,
          error: 'Unauthorized. You do not have permission to view bookings for this referral code.'
        });
      }
    }
    
    const bookings = await prisma.booking.findMany({
      where: { referralCodeUsed: code },
      select: {
        id: true,
        totalAmount: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const eventBookings = await prisma.eventBooking.findMany({
      where: { referralCodeUsed: code },
      select: {
        id: true,
        totalAmount: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const allBookings = [...bookings, ...eventBookings].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.status(200).json({
      success: true,
      data: {
        referralCode: code,
        totalBookings: allBookings.length,
        totalRevenue: allBookings.reduce((sum, b) => sum + b.totalAmount, 0),
        bookings: allBookings.map(b => ({
          bookingId: b.id,
          userName: b.user.name,
          userEmail: b.user.email,
          amount: b.totalAmount,
          date: b.createdAt,
        }))
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// PUBLIC: Validate a referral code for User App / Web
// ==========================================
export const validateReferralCode = async (req: Request, res: Response) => {
  try {
    const code = String(req.params.code).trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ success: false, error: 'Referral code is required.' });
    }

    // Check if code exists on a partner or user
    const partner = await prisma.partner.findFirst({
      where: {
        OR: [{ referralCode: code }, { hlpId: code }]
      },
      select: { id: true, name: true, businessName: true, referralCode: true }
    });

    const user = await prisma.user.findFirst({
      where: { referralCode: code },
      select: { id: true, name: true, referralCode: true }
    });

    if (partner || user || code.startsWith('LOKAM')) {
      return res.status(200).json({
        success: true,
        valid: true,
        code,
        discountAmount: 100,
        bonusCoins: 150,
        referrerName: partner ? (partner.businessName || partner.name) : (user ? user.name : 'HappyLokam VIP Ambassador'),
        message: '🎉 Referral code applied! ₹100 instant pass discount activated.'
      });
    }

    return res.status(404).json({
      success: false,
      valid: false,
      error: 'Invalid referral code. Please check and try again.'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};


