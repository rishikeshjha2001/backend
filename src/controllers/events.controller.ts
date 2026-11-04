import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { broadcastToUsers } from './notification.controller';

const prisma = new PrismaClient();

// ==========================================
// EVENTS CRUD (Admin)
// ==========================================

// Helper to parse dates safely without crashing Prisma
function parseEventDate(input: any): Date {
  if (!input) return new Date(Date.now() + 86400000);
  if (input instanceof Date && !isNaN(input.getTime())) return input;

  if (typeof input === 'number' && !isNaN(input) && input > 0) {
    const d = new Date(input > 1e11 ? input : input * 1000);
    if (!isNaN(d.getTime())) return d;
  }

  if (typeof input === 'string') {
    const str = input.trim();
    if (!str) return new Date(Date.now() + 86400000);

    const d = new Date(str);
    if (!isNaN(d.getTime())) return d;

    // Handle DD-MM-YYYY or DD/MM/YYYY
    const parts = str.split(/[-/T :.]+/);
    if (parts.length >= 3) {
      let y = parseInt(parts[0], 10);
      let m = parseInt(parts[1], 10) - 1;
      let day = parseInt(parts[2], 10);

      if (y < 100 && day > 1000) {
        const temp = y;
        y = day;
        day = temp;
      }
      const hr = parts[3] ? parseInt(parts[3], 10) : 12;
      const min = parts[4] ? parseInt(parts[4], 10) : 0;
      const sec = parts[5] ? parseInt(parts[5], 10) : 0;
      const parsed = new Date(y, m, day, hr, min, sec);
      if (!isNaN(parsed.getTime())) return parsed;
    }
  }

  return new Date(Date.now() + 86400000);
}

export interface TicketTiersConfig {
  single: number;
  couple: number;
  family4: number;
  family6: number;
  group5: number;
  child: number;
  [key: string]: any;
}

export function computeDefaultTicketTiers(basePrice: number, existing?: any): TicketTiersConfig {
  const p = Math.max(0, Number(basePrice) || 0);
  const single = existing?.single !== undefined && existing?.single !== null && !isNaN(Number(existing?.single))
    ? Math.max(0, Number(existing.single))
    : p;
  const couple = existing?.couple !== undefined && existing?.couple !== null && !isNaN(Number(existing?.couple))
    ? Math.max(0, Number(existing.couple))
    : Math.round(p * 1.8);
  const family4 = existing?.family4 !== undefined && existing?.family4 !== null && !isNaN(Number(existing?.family4))
    ? Math.max(0, Number(existing.family4))
    : Math.round(p * 3.4);
  const family6 = existing?.family6 !== undefined && existing?.family6 !== null && !isNaN(Number(existing?.family6))
    ? Math.max(0, Number(existing.family6))
    : Math.round(p * 4.8);
  const group5 = existing?.group5 !== undefined && existing?.group5 !== null && !isNaN(Number(existing?.group5))
    ? Math.max(0, Number(existing.group5))
    : Math.round(p * 4.2);
  const child = existing?.child !== undefined && existing?.child !== null && !isNaN(Number(existing?.child))
    ? Math.max(0, Number(existing.child))
    : Math.round(p * 0.5);

  return { single, couple, family4, family6, group5, child };
}

export const createEvent = async (req: Request, res: Response) => {
  try {
    const { title, category, date, location, description, imageUrl, price, totalTickets, features, ticketTiers } = req.body;
    
    if (!title || !category || !location) {
      return res.status(400).json({ success: false, error: 'Title, category, and location are required.' });
    }

    const eventDate = parseEventDate(date);
    const basePrice = price ? Math.max(0, parseFloat(price)) : 0;
    const computedTiers = computeDefaultTicketTiers(basePrice, ticketTiers);

    const event = await prisma.upcomingEvent.create({
      data: {
        title: String(title).trim(),
        category: String(category).trim(),
        date: eventDate,
        location: String(location).trim(),
        description: description ? String(description).trim() : '',
        imageUrl: imageUrl ? String(imageUrl).trim() : '',
        price: basePrice,
        totalTickets: totalTickets ? Math.max(0, parseInt(totalTickets)) : 0,
        ticketsSold: 0,
        features: Array.isArray(features) ? features : (features ? String(features).split(',').map((f: string) => f.trim()).filter(Boolean) : []),
        ticketTiers: computedTiers,
        status: 'Active'
      }
    });

    // Auto broadcast notification to all users about new celebration
    broadcastToUsers(
      `🎪 New Celebration Announced: ${title}`,
      `Join ${title} at ${location}! Exclusive passes starting from ₹${basePrice}. Book yours today!`
    ).catch(() => {});

    res.status(201).json({ success: true, data: { ...event, ticketTiers: computedTiers } });
  } catch (error: any) {
    console.error('Create event error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getEvents = async (req: Request, res: Response) => {
  try {
    const { category } = req.query;
    const where: any = { status: 'Active' };
    if (category) where.category = category as string;

    const events = await prisma.upcomingEvent.findMany({
      where,
      orderBy: { date: 'asc' },
    });

    // Add computed fields & guaranteed ticket tiers
    const enriched = events.map(e => ({
      ...e,
      ticketsLeft: e.totalTickets - e.ticketsSold,
      ticketTiers: computeDefaultTicketTiers(e.price || 0, e.ticketTiers),
    }));

    res.status(200).json({ success: true, data: enriched });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAllEvents = async (req: Request, res: Response) => {
  try {
    const events = await prisma.upcomingEvent.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { bookings: true }
        }
      }
    });

    const enriched = events.map(e => ({
      ...e,
      ticketsLeft: e.totalTickets - e.ticketsSold,
      bookingsCount: e._count.bookings,
      ticketTiers: computeDefaultTicketTiers(e.price || 0, e.ticketTiers),
    }));

    res.status(200).json({ success: true, data: enriched });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getEventById = async (req: Request, res: Response) => {
  try {
    const event = await prisma.upcomingEvent.findUnique({
      where: { id: req.params.id as string },
    });

    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });

    res.status(200).json({
      success: true,
      data: {
        ...event,
        ticketsLeft: event.totalTickets - event.ticketsSold,
        ticketTiers: computeDefaultTicketTiers(event.price || 0, event.ticketTiers),
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateEvent = async (req: Request, res: Response) => {
  try {
    const data: any = { ...req.body };
    if (data.date !== undefined) data.date = parseEventDate(data.date);
    if (data.price !== undefined) data.price = Math.max(0, parseFloat(data.price) || 0);
    if (data.totalTickets !== undefined) data.totalTickets = Math.max(0, parseInt(data.totalTickets) || 0);
    if (data.features && typeof data.features === 'string') {
      data.features = data.features.split(',').map((f: string) => f.trim()).filter(Boolean);
    }
    if (data.ticketTiers !== undefined || data.price !== undefined) {
      const p = data.price !== undefined ? data.price : 0;
      data.ticketTiers = computeDefaultTicketTiers(p, data.ticketTiers);
    }

    // Strip uneditable and computed fields
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    delete data.bookings;
    delete data.ticketsLeft;
    delete data.bookingsCount;

    const event = await prisma.upcomingEvent.update({
      where: { id: req.params.id as string },
      data
    });

    res.status(200).json({ 
      success: true, 
      data: {
        ...event,
        ticketTiers: computeDefaultTicketTiers(event.price || 0, event.ticketTiers)
      } 
    });
  } catch (error: any) {
    console.error('Update event error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteEvent = async (req: Request, res: Response) => {
  try {
    const eventId = req.params.id as string;
    const existing = await prisma.upcomingEvent.findUnique({ where: { id: eventId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Event not found.' });
    }
    // Delete associated event bookings first
    await prisma.eventBooking.deleteMany({ where: { eventId } });
    await prisma.upcomingEvent.delete({ where: { id: eventId } });
    res.status(200).json({ success: true, message: 'Event deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// EVENT BOOKINGS (User-facing)
// ==========================================

export const bookEvent = async (req: Request, res: Response) => {
  try {
    const { eventId, paymentId, referralCodeUsed, tierType, tierName } = req.body;
    const ticketsCount = Math.max(1, Number(req.body.ticketsCount || req.body.tickets || 1));

    let userId = req.user?.id;
    if (!userId) {
      const customerPhone = String(req.body.phone || req.body.customerPhone || '9876543210').trim();
      const customerName = String(req.body.name || req.body.customerName || 'Celebration Guest').trim();
      const customerEmail = String(req.body.email || req.body.customerEmail || `guest_${Date.now()}@happylokam.com`).trim().toLowerCase();

      let guestUser = await prisma.user.findFirst({
        where: {
          OR: [{ phone: customerPhone }, { email: customerEmail }]
        }
      });

      if (!guestUser) {
        guestUser = await prisma.user.create({
          data: {
            name: customerName,
            email: customerEmail,
            phone: customerPhone,
            passwordHash: 'GUEST_CHECKOUT',
            role: 'USER',
          }
        });
      }
      userId = guestUser.id;
    }

    if (!eventId || !ticketsCount || ticketsCount < 1) {
      return res.status(400).json({ success: false, error: 'eventId and ticketsCount are required.' });
    }


    const event = await prisma.upcomingEvent.findUnique({ where: { id: eventId } });
    if (!event) return res.status(404).json({ success: false, error: 'Event not found.' });

    const ticketsLeft = event.totalTickets - event.ticketsSold;
    if (ticketsLeft < ticketsCount) {
      return res.status(400).json({ success: false, error: `Only ${ticketsLeft} tickets remaining.` });
    }

    // Resolve ticket tier price
    const tiers = computeDefaultTicketTiers(event.price || 0, event.ticketTiers);
    const selectedTierKey = String(tierType || 'single').toLowerCase().trim();
    const tierUnitPrice = (tiers as any)[selectedTierKey] ?? tiers.single;

    const basePrice = tierUnitPrice * ticketsCount;
    const platformFee = Number((basePrice * 0.02).toFixed(2));
    const feeGst = Number((platformFee * 0.18).toFixed(2));
    const eventGst = basePrice > 500 ? Number((basePrice * 0.18).toFixed(2)) : 0;

    // Referral Discount & Coin Rewards Logic
    let discountAmount = 0;
    let validatedReferralCode: string | null = null;
    let referrerPartner: any = null;

    if (referralCodeUsed && typeof referralCodeUsed === 'string' && referralCodeUsed.trim().length > 0) {
      const cleanCode = referralCodeUsed.trim().toUpperCase();
      referrerPartner = await prisma.partner.findFirst({
        where: { OR: [{ referralCode: cleanCode }, { hlpId: cleanCode }] },
        select: { id: true, businessName: true, name: true, walletBalance: true }
      });

      const referrerUser = !referrerPartner ? await prisma.user.findFirst({
        where: { referralCode: cleanCode },
        select: { id: true, name: true }
      }) : null;

      if (referrerPartner || referrerUser || cleanCode.startsWith('LOKAM')) {
        validatedReferralCode = cleanCode;
        // Instant pass discount of ₹100 (capped at 50% of base price)
        discountAmount = Math.min(100, Math.round(basePrice * 0.5));
      }
    }

    // Coupon Code Validation & Discount
    let couponDiscountAmount = 0;
    let appliedCouponCode: string | null = null;
    const requestedCoupon = req.body.couponCode || req.body.coupon;
    if (requestedCoupon && typeof requestedCoupon === 'string' && requestedCoupon.trim().length > 0) {
      const cleanCoupon = requestedCoupon.trim().toUpperCase();
      const offer = await prisma.offer.findUnique({ where: { code: cleanCoupon } });
      if (offer && (offer.status === 'Active' || (offer as any).isActive)) {
        const now = new Date();
        const isValidDate = (!offer.validFrom || new Date(offer.validFrom) <= now) &&
                            (!offer.validTo || new Date(offer.validTo) >= now);
        if (isValidDate) {
          appliedCouponCode = cleanCoupon;
          couponDiscountAmount = Math.round((basePrice * offer.discountPercent) / 100);
        }
      }
    }

    // Celebration Wallet Balance Deduction (System generated discount)
    let actualWalletDeduction = 0;
    const requestedWalletDeduct = Number(req.body.walletDeducted || req.body.walletDiscount || 0);
    if (requestedWalletDeduct > 0 && userId) {
      const userRec = await prisma.user.findUnique({
        where: { id: userId },
        select: { walletBalance: true }
      });
      if (userRec && userRec.walletBalance > 0) {
        const remainingBase = Math.max(0, basePrice - discountAmount - couponDiscountAmount);
        actualWalletDeduction = Math.min(requestedWalletDeduct, userRec.walletBalance, remainingBase);
      }
    }

    const totalAmount = Math.max(1, Math.round(basePrice + platformFee + feeGst + eventGst - discountAmount - couponDiscountAmount - actualWalletDeduction));

    // Generate Ticket ID: Formula: hplc + date of event (DDMMYYYY) + sequential starting at 1709 (+1 each)
    const eventDateObj = new Date(event.date);
    const d = String(eventDateObj.getDate()).padStart(2, '0');
    const m = String(eventDateObj.getMonth() + 1).padStart(2, '0');
    const y = String(eventDateObj.getFullYear());
    const eventDateFormatted = `${d}${m}${y}`;

    // Secure non-sequential ticket code generation (SEC-007)
    let ticketId = `hplc${eventDateFormatted}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    while (await prisma.eventBooking.findUnique({ where: { id: ticketId } })) {
      ticketId = `hplc${eventDateFormatted}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    }

    const humanTierName = tierName || (
      selectedTierKey === 'couple' ? 'Couple Pass' :
      selectedTierKey === 'family4' ? 'Family Pass (4 Pax)' :
      selectedTierKey === 'family6' ? 'Family Pass (6 Pax)' :
      selectedTierKey === 'group5' ? 'Group Pass (5 Adults)' :
      selectedTierKey === 'child' ? 'Child Pass' : 'Single Pass'
    );

    // Only confirm immediately if event is free or wallet balance fully covers the ticket price
    const isConfirmed = totalAmount === 0 || actualWalletDeduction >= totalAmount;
    const bookingStatus = isConfirmed ? 'CONFIRMED' : 'PENDING';

    // Create booking and update ticketsSold & user wallet atomically
    const txOperations: any[] = [
      prisma.eventBooking.create({
        data: {
          id: ticketId,
          userId,
          eventId,
          ticketsCount,
          tierType: selectedTierKey.toUpperCase(),
          tierName: humanTierName,
          totalAmount,
          paymentId: paymentId || (actualWalletDeduction > 0 ? 'WALLET_DISCOUNT' : null),
          referralCodeUsed: validatedReferralCode || appliedCouponCode,
          status: bookingStatus,
        }
      })
    ];

    if (isConfirmed) {
      txOperations.push(
        prisma.upcomingEvent.update({
          where: { id: eventId },
          data: { ticketsSold: { increment: ticketsCount } }
        })
      );
    }

    if (actualWalletDeduction > 0 && userId) {
      txOperations.push(
        prisma.user.update({
          where: { id: userId },
          data: { walletBalance: { decrement: actualWalletDeduction } }
        })
      );
    }

    const [booking] = await prisma.$transaction(txOperations);

    // Handle Referral Rewards - ONLY credit when booking is confirmed/paid (LOGIC-005)
    if (referrerPartner && isConfirmed) {
      try {
        const bonusReward = Math.max(150, 50 * ticketsCount);
        await prisma.partner.update({
          where: { id: referrerPartner.id },
          data: { walletBalance: { increment: bonusReward } }
        });

        const refNotif = await prisma.notification.create({
          data: {
            title: '🎁 Referral Coins Credited!',
            message: `A customer booked ${ticketsCount} pass(es) for ${event.title} using code ${validatedReferralCode}! ₹${bonusReward} coins credited to your wallet.`,
            targetRole: 'PARTNER',
            type: 'IN_APP',
          }
        });
        await prisma.partnerNotification.create({
          data: { partnerId: referrerPartner.id, notificationId: refNotif.id, isRead: false }
        });
      } catch (refErr) {
        // Log silently
      }
    }

    res.status(201).json({ success: true, data: booking });
  } catch (error: any) {
    console.error('Book event error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getEventBookings = async (req: Request, res: Response) => {
  try {
    const bookings = await prisma.eventBooking.findMany({
      where: { eventId: req.params.id as string },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const totalTicketsSold = bookings.reduce((sum, b) => sum + b.ticketsCount, 0);
    const totalRevenue = bookings.reduce((sum, b) => sum + b.totalAmount, 0);

    res.status(200).json({
      success: true,
      data: {
        bookings,
        stats: { totalTicketsSold, totalRevenue, totalBookings: bookings.length }
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getUserEventBookings = async (req: Request, res: Response) => {
  try {
    const bookings = await prisma.eventBooking.findMany({
      where: { userId: req.user!.id },
      include: {
        event: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ success: true, data: bookings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const verifyTicket = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.params;
    const booking = await prisma.eventBooking.findUnique({
      where: { id: ticketId as string },
      include: {
        event: true,
        user: { select: { name: true, email: true } }
      }
    });

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Ticket not found or invalid.' });
    }

    if (booking.status !== 'CONFIRMED') {
      return res.status(400).json({ success: false, error: 'Ticket is not confirmed.', data: booking });
    }

    res.status(200).json({ success: true, data: booking });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
