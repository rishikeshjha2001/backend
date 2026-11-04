import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ==========================================
// DASHBOARD KPIs
// ==========================================
export const getDashboardKPIs = async (req: Request, res: Response) => {
  try {
    const { from, to } = req.query;
    const dateFilter: any = {};
    if (from) dateFilter.gte = new Date(String(from));
    if (to) dateFilter.lte = new Date(String(to));
    const createdAtFilter = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};

    const [
      totalUsers,
      totalPartners,
      pendingPartners,
      totalVenues,
      serviceBookingsCount,
      eventBookingsCount,
      serviceRevenueAgg,
      eventRevenueAgg,
      serviceBookings,
      eventBookings,
      monthlyRevenueRaw
    ] = await Promise.all([
      prisma.user.count({ where: createdAtFilter }),
      prisma.partner.count({ where: createdAtFilter }),
      prisma.partner.count({ where: { OR: [{ status: 'PENDING' }, { isVerified: false }], ...createdAtFilter } }),
      prisma.venue.count({ where: createdAtFilter }),
      prisma.booking.count({ where: createdAtFilter }),
      prisma.eventBooking.count({ where: createdAtFilter }),
      prisma.booking.aggregate({ _sum: { totalAmount: true }, where: createdAtFilter }),
      prisma.eventBooking.aggregate({ _sum: { totalAmount: true }, where: createdAtFilter }),
      prisma.booking.findMany({
        take: 10,
        where: createdAtFilter,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          venue: { select: { name: true } },
          partner: { select: { name: true, businessName: true } }
        }
      }),
      prisma.eventBooking.findMany({
        take: 10,
        where: createdAtFilter,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          event: { select: { title: true, location: true, category: true } }
        }
      }),
      prisma.$queryRaw<Array<{ month: string; revenue: number; count: number }>>`
        SELECT month, COALESCE(SUM(revenue), 0)::float as revenue, COALESCE(SUM(count), 0)::int as count FROM (
          SELECT TO_CHAR("createdAt", 'YYYY-MM') as month, SUM("totalAmount") as revenue, COUNT(*)::int as count
          FROM "Booking"
          GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
          UNION ALL
          SELECT TO_CHAR("createdAt", 'YYYY-MM') as month, SUM("totalAmount") as revenue, COUNT(*)::int as count
          FROM "EventBooking"
          GROUP BY TO_CHAR("createdAt", 'YYYY-MM')
        ) t
        GROUP BY month
        ORDER BY month ASC
        LIMIT 12
      `
    ]);

    const totalBookings = serviceBookingsCount + eventBookingsCount;
    const totalRevenue = (serviceRevenueAgg._sum.totalAmount || 0) + (eventRevenueAgg._sum.totalAmount || 0);

    // Merge recent bookings cleanly with unified structure
    const combinedRecent = [
      ...serviceBookings.map((b) => ({
        id: b.id,
        type: 'SERVICE',
        title: b.venue?.name || b.partner?.businessName || b.partner?.name || 'Service Booking',
        customerName: b.user?.name || 'Customer',
        customerEmail: b.user?.email || '',
        customerPhone: b.user?.phone || '',
        amount: b.totalAmount,
        status: b.status,
        date: b.date,
        createdAt: b.createdAt,
        referralCode: b.referralCodeUsed || null
      })),
      ...eventBookings.map((eb) => ({
        id: eb.id,
        type: 'EVENT_PASS',
        title: eb.event?.title || 'Event Pass',
        customerName: eb.user?.name || 'Pass Holder',
        customerEmail: eb.user?.email || '',
        customerPhone: eb.user?.phone || '',
        amount: eb.totalAmount,
        status: eb.status,
        date: eb.createdAt,
        createdAt: eb.createdAt,
        tierName: eb.tierName,
        ticketsCount: eb.ticketsCount,
        referralCode: eb.referralCodeUsed || null
      }))
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 10);

    res.status(200).json({
      success: true,
      data: {
        kpis: {
          totalUsers,
          totalPartners,
          pendingPartners,
          totalVenues,
          totalBookings,
          totalRevenue,
          serviceBookingsCount,
          eventBookingsCount
        },
        recentBookings: combinedRecent,
        monthlyRevenue: monthlyRevenueRaw || []
      }
    });
  } catch (error: any) {
    console.error('Error fetching dashboard KPIs:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// USER MANAGEMENT
// ==========================================
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { search, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { email: { contains: String(search), mode: 'insensitive' } },
        { phone: { contains: String(search), mode: 'insensitive' } }
      ];
    }
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: parseInt(String(limit)),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          walletBalance: true,
          referralCode: true,
          createdAt: true
        }
      }),
      prisma.user.count({ where })
    ]);
    res.status(200).json({ success: true, data: users, total, page: parseInt(String(page)), pages: Math.ceil(total / parseInt(String(limit))) });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateUserWallet = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { amount, action, reason = 'Admin celebration discount credit' } = req.body;

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ success: false, error: 'Valid positive amount is required.' });
    }

    const user = await prisma.user.findUnique({ where: { id: id as string } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    let newBalance = (user.walletBalance || 0);
    const resolvedAction = action ? String(action).toUpperCase() : 'SET';

    if (resolvedAction === 'ADD') {
      newBalance += numAmount;
    } else if (resolvedAction === 'SUBTRACT') {
      newBalance = Math.max(0, newBalance - numAmount);
    } else {
      newBalance = numAmount;
    }

    const updated = await prisma.user.update({
      where: { id: id as string },
      data: { walletBalance: newBalance },
      select: { id: true, name: true, email: true, phone: true, walletBalance: true }
    });

    // Notify user in-app (Private notification)
    prisma.notification.create({
      data: {
        title: `🎁 Celebration Wallet Credited!`,
        message: `Your HappyLokam Celebration Wallet now has a balance of ₹${newBalance}. ${reason}. Use it for instant discounts at checkout!`,
        targetRole: 'PERSONAL',
        type: 'WALLET',
      },
    }).then(async (notif: any) => {
      await prisma.userNotification.create({
        data: { userId: id as string, notificationId: notif.id, isRead: false },
      }).catch(() => {});
    }).catch(() => {});

    res.status(200).json({
      success: true,
      message: `User wallet updated. Balance is now ₹${newBalance}`,
      data: updated,
      reason
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    const userId = req.params.id as string;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    // 1. Delete event bookings
    await prisma.eventBooking.deleteMany({ where: { userId } }).catch(() => {});

    // 2. Delete service bookings and their child records
    const bookings = await prisma.booking.findMany({ where: { userId }, select: { id: true } });
    const bookingIds = bookings.map(b => b.id);
    if (bookingIds.length > 0) {
      const payments = await prisma.payment.findMany({ where: { bookingId: { in: bookingIds } }, select: { id: true } });
      const paymentIds = payments.map(p => p.id);
      if (paymentIds.length > 0) {
        await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } }).catch(() => {});
        await prisma.paymentEvent.deleteMany({ where: { paymentId: { in: paymentIds } } }).catch(() => {});
        await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } }).catch(() => {});
      }
      await prisma.bookingEvent.deleteMany({ where: { bookingId: { in: bookingIds } } }).catch(() => {});
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } }).catch(() => {});
    }

    // 3. Delete user notifications
    await prisma.userNotification.deleteMany({ where: { userId } }).catch(() => {});

    // 4. Delete device tokens
    await prisma.deviceToken.deleteMany({ where: { userId } }).catch(() => {});

    // 5. Delete user
    await prisma.user.delete({ where: { id: userId } });

    res.status(200).json({ success: true, message: `User ${user.name} and all associated records deleted.` });
  } catch (error: any) {
    console.error('Delete user error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// PARTNER MANAGEMENT
// ==========================================
// PARTNER MANAGEMENT
// ==========================================
export const getAllPartners = async (req: Request, res: Response) => {
  try {
    const { search, verified, status, page = '1', limit = '50' } = req.query;
    const skip = (parseInt(String(page)) - 1) * parseInt(String(limit));
    const where: any = {};
    if (search) {
      where.OR = [
        { name: { contains: String(search), mode: 'insensitive' } },
        { businessName: { contains: String(search), mode: 'insensitive' } },
        { email: { contains: String(search), mode: 'insensitive' } },
        { phone: { contains: String(search), mode: 'insensitive' } },
        { hlpId: { contains: String(search), mode: 'insensitive' } }
      ];
    }
    if (verified === 'true') where.isVerified = true;
    if (verified === 'false') where.isVerified = false;
    if (status && status !== 'ALL') where.status = String(status);

    const [partners, total] = await Promise.all([
      prisma.partner.findMany({
        where,
        skip,
        take: parseInt(String(limit)),
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          hlpId: true,
          name: true,
          email: true,
          phone: true,
          businessName: true,
          categories: true,
          location: true,
          isVerified: true,
          status: true,
          ownerName: true,
          gstNumber: true,
          panNumber: true,
          bankAccount: true,
          bankIfsc: true,
          subscriptionStatus: true,
          walletBalance: true,
          createdAt: true,
        }
      }),
      prisma.partner.count({ where })
    ]);

    res.status(200).json({
      success: true,
      data: partners,
      partners: partners,
      total,
      page: parseInt(String(page)),
      pages: Math.ceil(total / parseInt(String(limit)))
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getPartnerById = async (req: Request, res: Response) => {
  try {
    const partner = await prisma.partner.findUnique({
      where: { id: req.params.id as string },
      include: { venues: true, subscriptions: true, services: true }
    });
    if (!partner) return res.status(404).json({ success: false, error: 'Partner not found' });
    res.status(200).json({ success: true, data: partner, partner });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyPartner = async (req: Request, res: Response) => {
  try {
    const { isVerified, status } = req.body;
    const newStatus = status || (isVerified ? 'VERIFIED' : 'REJECTED');
    const partner = await prisma.partner.update({
      where: { id: req.params.id as string },
      data: {
        isVerified: Boolean(isVerified),
        status: newStatus
      }
    });
    res.status(200).json({
      success: true,
      data: partner,
      partner,
      message: isVerified ? 'Partner verified & approved.' : 'Partner verification rejected.'
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const approvePartner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const partner = await prisma.partner.update({ 
      where: { id: id as string }, 
      data: { isVerified: true, status: 'VERIFIED' } 
    });
    res.status(200).json({ success: true, data: partner, partner, message: 'Partner approved successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const rejectPartner = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};
    const partner = await prisma.partner.update({
      where: { id: id as string },
      data: { isVerified: false, status: 'REJECTED' }
    });
    res.status(200).json({ success: true, data: partner, partner, message: 'Partner application rejected.', reason });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deletePartner = async (req: Request, res: Response) => {
  try {
    const targetId = req.params.id as string;
    const partner = await prisma.partner.findFirst({
      where: {
        OR: [{ id: targetId }, { hlpId: targetId }]
      }
    });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found.' });
    }

    const partnerId = partner.id;

    // 1. Find all partner venue IDs
    const venues = await prisma.venue.findMany({ where: { partnerId }, select: { id: true } });
    const venueIds = venues.map(v => v.id);

    // 2. Find ALL bookings associated with partner or partner's venues
    const bookings = await prisma.booking.findMany({
      where: {
        OR: [
          { partnerId },
          ...(venueIds.length > 0 ? [{ venueId: { in: venueIds } }] : [])
        ]
      },
      select: { id: true }
    });
    const bookingIds = bookings.map(b => b.id);

    if (bookingIds.length > 0) {
      // Delete payment events and refunds for these bookings
      const payments = await prisma.payment.findMany({
        where: { bookingId: { in: bookingIds } },
        select: { id: true }
      });
      const paymentIds = payments.map(p => p.id);
      if (paymentIds.length > 0) {
        await prisma.refund.deleteMany({ where: { paymentId: { in: paymentIds } } }).catch(() => {});
        await prisma.paymentEvent.deleteMany({ where: { paymentId: { in: paymentIds } } }).catch(() => {});
        await prisma.payment.deleteMany({ where: { id: { in: paymentIds } } }).catch(() => {});
      }
      await prisma.bookingEvent.deleteMany({ where: { bookingId: { in: bookingIds } } }).catch(() => {});
      await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } }).catch(() => {});
    }

    // 3. Delete partner subscriptions and their events
    const subscriptions = await prisma.partnerSubscription.findMany({ where: { partnerId }, select: { id: true } });
    const subIds = subscriptions.map(s => s.id);
    if (subIds.length > 0) {
      await prisma.subscriptionEvent.deleteMany({ where: { subscriptionId: { in: subIds } } }).catch(() => {});
      await prisma.partnerSubscription.deleteMany({ where: { id: { in: subIds } } }).catch(() => {});
    }

    // 4. Delete venues
    await prisma.venue.deleteMany({ where: { partnerId } }).catch(() => {});
    if (venueIds.length > 0) {
      await prisma.venue.deleteMany({ where: { id: { in: venueIds } } }).catch(() => {});
    }

    // 5. Delete services, bills, payouts, notifications, tokens
    await prisma.partnerService.deleteMany({ where: { partnerId } }).catch(() => {});
    await prisma.bill.deleteMany({ where: { partnerId } }).catch(() => {});
    await prisma.payout.deleteMany({ where: { partnerId } }).catch(() => {});
    await prisma.partnerNotification.deleteMany({ where: { partnerId } }).catch(() => {});
    await prisma.deviceToken.deleteMany({ where: { partnerId } }).catch(() => {});

    // 6. Unset referredByCode on other partners if referencing this partner
    const codesToClear = [partner.referralCode, partner.hlpId].filter(Boolean) as string[];
    if (codesToClear.length > 0) {
      await prisma.partner.updateMany({
        where: { referredByCode: { in: codesToClear } },
        data: { referredByCode: null }
      }).catch(() => {});
    }

    // 7. Finally delete partner record
    await prisma.partner.delete({ where: { id: partnerId } });

    res.status(200).json({ success: true, message: `Partner ${partner.businessName || partner.name} and all associated records deleted successfully.` });
  } catch (error: any) {
    console.error('Delete partner error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to delete partner.' });
  }
};

export const createPartner = async (req: Request, res: Response) => {
  try {
    const { name, businessName, email, phone, password, location, categories, isVerified, status, image, imageUrl } = req.body;

    if (!email || !businessName || !phone) {
      return res.status(400).json({ success: false, error: 'Business name, email, and phone are required.' });
    }

    const existing = await prisma.partner.findFirst({
      where: {
        OR: [{ email: String(email).trim() }, { phone: String(phone).trim() }]
      }
    });

    if (existing) {
      return res.status(400).json({ success: false, error: 'A partner with this email or phone already exists.' });
    }

    const rawPassword = password || 'Happy@1234';
    const passwordHash = await bcrypt.hash(rawPassword, 10);
    const hlpId = `HLP-${Date.now().toString(36).toUpperCase()}`;

    const finalImage = (image || imageUrl || '').trim() || null;

    const partner = await prisma.partner.create({
      data: {
        hlpId,
        name: name ? String(name).trim() : String(businessName).trim(),
        businessName: String(businessName).trim(),
        email: String(email).trim().toLowerCase(),
        phone: String(phone).trim(),
        passwordHash,
        location: location ? String(location).trim() : 'India',
        categories: Array.isArray(categories) ? categories : (categories ? String(categories).split(',').map((c: string) => c.trim()).filter(Boolean) : ['Wedding']),
        isVerified: isVerified !== undefined ? Boolean(isVerified) : true,
        status: status || 'VERIFIED',
        subscriptionStatus: 'ACTIVE',
        image: finalImage,
        imageUrl: finalImage,
      }
    });

    res.status(201).json({ success: true, message: 'Partner onboarded successfully.', data: partner, partner });
  } catch (error: any) {
    console.error('Error creating partner:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updatePartner = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, businessName, email, phone, location, categories, isVerified, status, image, imageUrl } = req.body;
    const finalImage = image !== undefined ? (image ? String(image).trim() : null) : (imageUrl !== undefined ? (imageUrl ? String(imageUrl).trim() : null) : undefined);

    const partner = await prisma.partner.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: String(name).trim() }),
        ...(businessName !== undefined && { businessName: String(businessName).trim() }),
        ...(email !== undefined && { email: String(email).trim().toLowerCase() }),
        ...(phone !== undefined && { phone: String(phone).trim() }),
        ...(location !== undefined && { location: String(location).trim() }),
        ...(categories !== undefined && { categories: { set: Array.isArray(categories) ? categories : String(categories).split(',').map((c: string) => c.trim()).filter(Boolean) } }),
        ...(isVerified !== undefined && { isVerified: Boolean(isVerified) }),
        ...(status !== undefined && { status: String(status) }),
        ...(finalImage !== undefined && { image: finalImage, imageUrl: finalImage }),
      },
    });

    res.status(200).json({ success: true, message: 'Partner updated successfully.', data: partner, partner });
  } catch (error: any) {
    console.error('Error updating partner:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};


// ==========================================
// BOOKING MANAGEMENT (Unified Service & Event Passes)
// ==========================================
export const getAllBookings = async (req: Request, res: Response) => {
  try {
    const { status, type, search } = req.query;

    const bookingWhere: any = {};
    const eventBookingWhere: any = {};

    if (status && status !== 'ALL') {
      bookingWhere.status = String(status);
      eventBookingWhere.status = String(status);
    }

    const [venueBookings, eventBookings, customSectionBookings] = await Promise.all([
      prisma.booking.findMany({
        where: bookingWhere,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          venue: { select: { id: true, name: true, city: true, price: true } },
          partner: { select: { id: true, businessName: true, phone: true } },
        },
      }),
      prisma.eventBooking.findMany({
        where: eventBookingWhere,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true, phone: true } },
          event: { select: { id: true, title: true, category: true, date: true, location: true, price: true } },
        },
      }),
      (prisma as any).customSectionBooking.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          item: {
            select: {
              id: true,
              title: true,
              location: true,
              image: true,
              itemType: true,
              price: true,
              section: { select: { title: true } },
              category: { select: { name: true } },
            },
          },
        },
      }).catch(() => []),
    ]);

    // Map venue bookings
    const mappedVenueBookings = venueBookings.map((b) => ({
      id: b.id,
      ticketId: b.ticketId || b.id,
      type: 'VENUE_BOOKING',
      bookingType: 'Venue Reservation',
      customerName: b.user?.name || 'Customer',
      customerPhone: b.user?.phone || 'N/A',
      customerEmail: b.user?.email || 'N/A',
      serviceName: b.venue?.name || 'Venue Reservation',
      category: 'Venue',
      location: b.venue?.city || 'Patna',
      eventDate: (b.date || b.createdAt ? new Date(b.date || b.createdAt) : new Date()).toISOString(),
      ticketsCount: 1,
      amount: b.totalAmount,
      totalAmount: b.totalAmount,
      paymentId: b.razorpayPaymentId || 'N/A',
      status: b.status || 'CONFIRMED',
      partnerName: b.partner?.businessName || 'Assigned Partner',
      createdAt: (b.createdAt ? new Date(b.createdAt) : new Date()).toISOString(),
      user: b.user,
      venue: b.venue,
    }));

    // Map event celebration passes (Dandiya, Garba, etc.)
    const mappedEventBookings = eventBookings.map((eb) => ({
      id: eb.id,
      ticketId: eb.id, // e.g. hplc300920261709
      type: 'EVENT_PASS',
      bookingType: 'Celebration Pass',
      customerName: eb.user?.name || 'Guest',
      customerPhone: eb.user?.phone || 'N/A',
      customerEmail: eb.user?.email || 'N/A',
      serviceName: eb.event?.title || 'Celebration Event',
      category: eb.event?.category || 'Dandiya & Garba',
      location: eb.event?.location || 'Patna',
      eventDate: (eb.event?.date || eb.createdAt ? new Date(eb.event?.date || eb.createdAt) : new Date()).toISOString(),
      ticketsCount: eb.ticketsCount,
      tierType: (eb as any).tierType || 'SINGLE',
      tierName: (eb as any).tierName || 'Single Pass',
      amount: eb.totalAmount,
      totalAmount: eb.totalAmount,
      paymentId: eb.paymentId || 'N/A',
      status: eb.status || 'CONFIRMED',
      partnerName: 'Official happylokam Host',
      referralCode: eb.referralCodeUsed || null,
      createdAt: (eb.createdAt ? new Date(eb.createdAt) : new Date()).toISOString(),
      user: eb.user,
      event: eb.event,
    }));

    // Map custom section & category bookings
    const mappedSectionBookings = (customSectionBookings || []).map((sb: any) => ({
      id: sb.id,
      ticketId: sb.ticketCode || sb.id,
      type: sb.itemType === 'TICKET' ? 'TICKET_PASS' : 'SECTION_BOOKING',
      bookingType: sb.itemType === 'TICKET' ? 'Admission Pass' : 'Custom Booking',
      customerName: sb.userName || 'Guest',
      customerPhone: sb.userPhone || 'N/A',
      customerEmail: sb.userEmail || 'N/A',
      serviceName: sb.item?.title || 'Celebration Booking',
      category: sb.item?.category?.name || sb.item?.section?.title || 'Custom Section',
      location: sb.item?.location || 'India',
      eventDate: sb.bookingDate || (sb.createdAt ? new Date(sb.createdAt).toISOString() : new Date().toISOString()),
      ticketsCount: sb.quantity || 1,
      amount: sb.totalAmount || 0,
      totalAmount: sb.totalAmount || 0,
      paymentId: sb.paymentStatus || 'PAID',
      status: sb.status || 'CONFIRMED',
      partnerName: 'Direct / Admin',
      createdAt: (sb.createdAt ? new Date(sb.createdAt) : new Date()).toISOString(),
      user: { name: sb.userName, phone: sb.userPhone, email: sb.userEmail },
    }));

    // Combine and sort by createdAt descending
    let combined = [...mappedVenueBookings, ...mappedEventBookings, ...mappedSectionBookings].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Apply optional type filter
    if (type && type !== 'ALL') {
      combined = combined.filter((b) => b.type === String(type));
    }

    // Apply optional search filter (customer name, phone, ticket ID, service name)
    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      combined = combined.filter(
        (b) =>
          b.customerName.toLowerCase().includes(q) ||
          b.customerPhone.toLowerCase().includes(q) ||
          b.customerEmail.toLowerCase().includes(q) ||
          b.ticketId.toLowerCase().includes(q) ||
          b.serviceName.toLowerCase().includes(q)
      );
    }

    // Calculate summary statistics
    const totalRevenue = combined.reduce((acc, curr) => acc + (Number(curr.amount) || 0), 0);
    const confirmedCount = combined.filter((b) => b.status === 'CONFIRMED' || b.status === 'SUCCESS').length;
    const pendingCount = combined.filter((b) => b.status === 'PENDING').length;

    res.status(200).json({
      success: true,
      data: combined,
      bookings: combined,
      total: combined.length,
      stats: {
        totalBookings: combined.length,
        totalRevenue,
        confirmedCount,
        pendingCount,
        eventPassesCount: mappedEventBookings.length,
        venueBookingsCount: mappedVenueBookings.length,
      },
    });
  } catch (error: any) {
    console.error('getAllBookings error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// SUBSCRIPTION & ₹99 SYSTEM MANAGEMENT
// ==========================================

async function getOrCreatePartnerSubscriptionPlan() {
  let plan = await prisma.subscriptionPlan.findFirst({
    where: {
      OR: [
        { name: 'Partner Monthly Subscription' },
        { name: 'Partner Annual Subscription' }
      ]
    }
  });
  if (plan) {
    if (plan.billingInterval !== 'MONTHLY' || plan.name !== 'Partner Monthly Subscription') {
      plan = await prisma.subscriptionPlan.update({
        where: { id: plan.id },
        data: {
          name: 'Partner Monthly Subscription',
          billingInterval: 'MONTHLY',
          amount: 99.0,
        }
      });
    }
    return plan;
  }
  return await prisma.subscriptionPlan.create({
    data: {
      name: 'Partner Monthly Subscription',
      amount: 99.0,
      currency: 'INR',
      billingInterval: 'MONTHLY',
      features: [
        'Verified Listing on Happylokam Directory',
        'Unlimited Customer Inquiries & Leads',
        'Priority Ranking in Search & Recommendations',
        'Direct WhatsApp & Instant Phone Connect',
        'Dedicated 24/7 Concierge Support'
      ],
      active: true,
      version: 1
    }
  });
}

export const getSubscriptionConfig = async (req: Request, res: Response) => {
  try {
    const plan = await getOrCreatePartnerSubscriptionPlan();
    return res.status(200).json({
      success: true,
      config: {
        planId: plan.id,
        name: plan.name,
        amount: plan.amount,
        currency: plan.currency,
        billingInterval: plan.billingInterval,
        active: plan.active,
        features: plan.features
      }
    });
  } catch (error: any) {
    console.error('Error fetching subscription config:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateSubscriptionConfig = async (req: Request, res: Response) => {
  try {
    const { active, amount, features } = req.body || {};
    const plan = await getOrCreatePartnerSubscriptionPlan();

    const updated = await prisma.subscriptionPlan.update({
      where: { id: plan.id },
      data: {
        ...(active !== undefined && { active: Boolean(active) }),
        ...(amount !== undefined && { amount: parseFloat(amount) }),
        ...(Array.isArray(features) && { features })
      }
    });

    return res.status(200).json({
      success: true,
      message: `Partner subscription requirement has been turned ${updated.active ? 'ON (Mandatory ₹' + updated.amount + ')' : 'OFF (Free Onboarding Mode)'}`,
      config: {
        planId: updated.id,
        name: updated.name,
        amount: updated.amount,
        currency: updated.currency,
        billingInterval: updated.billingInterval,
        active: updated.active,
        features: updated.features
      }
    });
  } catch (error: any) {
    console.error('Error updating subscription config:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const togglePartnerSubscription = async (req: Request, res: Response) => {
  try {
    const { partnerId } = req.params;
    const { status, durationDays } = req.body || {};

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId as string }
    });

    if (!partner) {
      return res.status(404).json({ success: false, error: 'Partner not found.' });
    }

    const newStatus = status ? String(status).toUpperCase() : (partner.subscriptionStatus === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE');
    const isNowActive = newStatus === 'ACTIVE';

    const days = parseInt(durationDays) || 30; // Strictly 30-day monthly subscription
    const endDate = isNowActive ? new Date(Date.now() + days * 86400000) : null;

    const updated = await prisma.partner.update({
      where: { id: partnerId as string },
      data: {
        subscriptionStatus: newStatus,
        subscriptionEnd: endDate,
        ...(isNowActive && { isVerified: true, status: 'VERIFIED' })
      }
    });

    // Record subscription audit if activated
    if (isNowActive) {
      const plan = await getOrCreatePartnerSubscriptionPlan();
      await prisma.partnerSubscription.create({
        data: {
          partnerId: partner.id,
          planId: plan.id,
          amount: plan.amount,
          razorpayPaymentId: 'ADMIN_GRANTED',
          status: 'ACTIVE',
          startDate: new Date(),
          endDate: endDate,
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: `Partner ${partner.businessName} subscription set to ${newStatus}.`,
      partner: {
        id: updated.id,
        businessName: updated.businessName,
        subscriptionStatus: updated.subscriptionStatus,
        subscriptionEnd: updated.subscriptionEnd,
        isVerified: updated.isVerified,
        status: updated.status
      }
    });
  } catch (error: any) {
    console.error('Error toggling partner subscription:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const getAllSubscriptions = async (req: Request, res: Response) => {
  try {
    const plan = await getOrCreatePartnerSubscriptionPlan();

    const partners = await prisma.partner.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        hlpId: true,
        name: true,
        businessName: true,
        email: true,
        phone: true,
        location: true,
        isVerified: true,
        status: true,
        subscriptionStatus: true,
        subscriptionEnd: true,
        createdAt: true,
        subscriptions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            amount: true,
            status: true,
            startDate: true,
            endDate: true,
            razorpayPaymentId: true,
            createdAt: true
          }
        }
      }
    });

    const activeCount = partners.filter(p => p.subscriptionStatus === 'ACTIVE').length;
    const totalCollected = partners.reduce((sum, p) => {
      const sub = p.subscriptions[0];
      return sum + (sub?.amount && sub?.status === 'ACTIVE' ? sub.amount : 0);
    }, 0);

    res.status(200).json({
      success: true,
      config: {
        planId: plan.id,
        name: plan.name,
        amount: plan.amount,
        currency: plan.currency,
        active: plan.active,
        features: plan.features
      },
      stats: {
        totalPartners: partners.length,
        activeSubscriptions: activeCount,
        inactiveSubscriptions: partners.length - activeCount,
        totalCollected,
        subscriptionEnforcement: plan.active
      },
      partners
    });
  } catch (error: any) {
    console.error('Error in getAllSubscriptions:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// MANAGER MANAGEMENT
// ==========================================
export const createManager = async (req: Request, res: Response) => {
  try {
    const { name, email, phone, location, password } = req.body;
    
    if (!name || !email || !location || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, location, and password are required.' });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    
    // Generate HLP ID for manager
    const count = await prisma.manager.count();
    const hlpId = `hlpm${(count + 1).toString().padStart(4, '0')}`;

    const manager = await prisma.manager.create({
      data: {
        hlpId,
        name,
        email,
        phone: phone || '',
        passwordHash,
        location
      },
      select: { id: true, name: true, email: true, location: true, hlpId: true }
    });

    res.status(201).json({ success: true, data: manager });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getManagers = async (req: Request, res: Response) => {
  try {
    const managers = await prisma.manager.findMany({
      select: { id: true, name: true, email: true, phone: true, location: true, isActive: true, hlpId: true, createdAt: true }
    });
    res.status(200).json({ success: true, data: managers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// ADMIN BOOKING STATUS & DELETE
// ==========================================
export const updateAdminBookingStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required.' });
    }

    // Check if it's an EventBooking first
    const eventBooking = await prisma.eventBooking.findUnique({ where: { id: id as string } });
    if (eventBooking) {
      const updated = await prisma.eventBooking.update({
        where: { id: id as string },
        data: { status: String(status) }
      });
      return res.status(200).json({ success: true, data: updated, message: 'Event pass booking updated successfully.' });
    }

    // Check if it's a regular Booking (Venue / Partner service)
    const booking = await prisma.booking.findUnique({ where: { id: id as string } });
    if (booking) {
      const updated = await prisma.booking.update({
        where: { id: id as string },
        data: { status: String(status) }
      });
      return res.status(200).json({ success: true, data: updated, message: 'Venue booking updated successfully.' });
    }

    return res.status(404).json({ success: false, error: 'Booking record not found.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteAdminBooking = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Check if it's an EventBooking first
    const eventBooking = await prisma.eventBooking.findUnique({ where: { id: id as string } });
    if (eventBooking) {
      await prisma.eventBooking.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true, message: 'Event pass record deleted successfully.' });
    }

    // Check if it's a regular Booking
    const booking = await prisma.booking.findUnique({ where: { id: id as string } });
    if (booking) {
      await prisma.bookingEvent.deleteMany({ where: { bookingId: id as string } }).catch(() => {});
      await prisma.payment.deleteMany({ where: { bookingId: id as string } }).catch(() => {});
      await prisma.booking.delete({ where: { id: id as string } });
      return res.status(200).json({ success: true, message: 'Booking record deleted successfully.' });
    }

    return res.status(404).json({ success: false, error: 'Booking record not found.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

