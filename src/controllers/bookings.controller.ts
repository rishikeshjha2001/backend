import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createBooking = async (req: Request, res: Response) => {
  try {
    const { venueId, partnerId, date, totalAmount, referralCode, guestsCount, guestCount, platesCount, quantity } = req.body;

    // Validation
    if (!venueId || !date) {
      return res.status(400).json({ success: false, error: 'Venue/Service and event date are required' });
    }

    const userId = req.user!.id; // Use authenticated user ID

    // Look up venue/service to ensure valid business partner and realistic pricing
    let resolvedPartnerId = partnerId;
    let basePrice = 0;

    const venue = await prisma.venue.findUnique({ where: { id: venueId } }).catch(() => null);
    if (venue) {
      resolvedPartnerId = venue.partnerId || partnerId;
      if (venue.price) {
        basePrice = typeof venue.price === 'number' ? venue.price : parseFloat(venue.price);
      }
    } else {
      // Check partnerService if not in venue table
      const pService = await prisma.partnerService.findUnique({ where: { id: venueId } }).catch(() => null);
      if (pService) {
        if (pService.availability === 'UNAVAILABLE' || pService.isActive === false) {
          return res.status(400).json({
            success: false,
            error: `"${pService.name}" is currently marked as unavailable by the partner. Please select another date or service.`,
          });
        }
        resolvedPartnerId = pService.partnerId;
        const numPlates = Number(platesCount || 0);
        const numGuests = Number(guestsCount || guestCount || quantity || 1);
        if (pService.pricingUnit === 'PER_PLATE' || (pService.category === 'CATERING' && numPlates > 0)) {
          basePrice = pService.pricing * Math.max(1, numPlates || numGuests);
        } else if (pService.pricingUnit === 'PER_PERSON') {
          basePrice = pService.pricing * Math.max(1, numGuests);
        } else {
          basePrice = pService.pricing;
        }
      }
    }

    if (basePrice <= 0) {
      basePrice = parseFloat(totalAmount || '0');
    }

    if (basePrice <= 0) {
      return res.status(400).json({ success: false, error: 'Invalid booking pricing' });
    }

    if (!resolvedPartnerId) {
      return res.status(400).json({ success: false, error: 'Could not resolve the service partner. Please select a valid venue or service.' });
    }

    // Check Date Availability & Conflicts (prevent double booking)
    const bookingDateObj = new Date(date);
    if (isNaN(bookingDateObj.getTime())) {
      return res.status(400).json({ success: false, error: 'Invalid event date provided' });
    }
    const startOfDay = new Date(bookingDateObj);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(bookingDateObj);
    endOfDay.setHours(23, 59, 59, 999);

    const existingConflict = await prisma.booking.findFirst({
      where: {
        venueId,
        date: { gte: startOfDay, lte: endOfDay },
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
    });

    if (existingConflict) {
      return res.status(400).json({
        success: false,
        error: `This service/venue is already booked or not available on ${bookingDateObj.toLocaleDateString('en-IN')}. Please select another date.`,
      });
    }

    // Platform fee (5%) and GST (18%) calculation
    const platformFee = Math.round(basePrice * 0.05);
    const taxAmount = Math.round(basePrice * 0.18);

    // Referral Discount & Coin Rewards Logic
    let discountAmount = 0;
    let validatedReferralCode: string | null = null;
    let referrerPartner: any = null;

    if (referralCode && typeof referralCode === 'string' && referralCode.trim().length > 0) {
      const cleanCode = referralCode.trim().toUpperCase();
      // Look up partner with this code or hlpId
      referrerPartner = await prisma.partner.findFirst({
        where: { OR: [{ referralCode: cleanCode }, { hlpId: cleanCode }] },
        select: { id: true, businessName: true, name: true, walletBalance: true }
      });

      // Also check user referral
      const referrerUser = !referrerPartner ? await prisma.user.findFirst({
        where: { referralCode: cleanCode },
        select: { id: true, name: true }
      }) : null;

      if (referrerPartner || referrerUser || cleanCode.startsWith('LOKAM')) {
        validatedReferralCode = cleanCode;
        // Discount of ₹100 (capped at 50% of basePrice)
        discountAmount = Math.min(100, Math.round(basePrice * 0.5));
      }
    }

    // Wallet Balance Deduction Option (strictly based on authentic database balance)
    let walletDeducted = 0;
    const requestedWallet = req.body.walletAmount !== undefined || req.body.walletDiscount !== undefined || req.body.walletDeducted !== undefined
      ? Number(req.body.walletAmount || req.body.walletDiscount || req.body.walletDeducted)
      : (req.body.useWallet ? Infinity : 0);
    if (requestedWallet > 0 && userId) {
      const userProfile = await prisma.user.findUnique({
        where: { id: userId },
        select: { walletBalance: true },
      });
      if (userProfile && userProfile.walletBalance > 0) {
        walletDeducted = Math.min(requestedWallet, userProfile.walletBalance, basePrice);
        if (walletDeducted > 0) {
          await prisma.user.update({
            where: { id: userId },
            data: { walletBalance: { decrement: walletDeducted } },
          });
          discountAmount += walletDeducted;
        }
      }
    }

    const finalTotalAmount = Math.max(1, basePrice + platformFee + taxAmount - discountAmount);

    // Generate unique ticket ID for venue bookings: hlc+date+time+2_digit
    const dateObj = new Date();
    const dateStr = dateObj.toISOString().split('T')[0].replace(/-/g, '');
    const timeStr = dateObj.toTimeString().split(' ')[0].replace(/:/g, '');
    const random2Digit = Math.floor(10 + Math.random() * 90);
    const ticketId = `hlc${dateStr}${timeStr}${random2Digit}`;

    const newBooking = await prisma.booking.create({
      data: {
        userId,
        venueId,
        partnerId: resolvedPartnerId,
        date: new Date(date),
        baseAmount: basePrice,
        platformFee,
        taxAmount,
        discountAmount,
        totalAmount: finalTotalAmount,
        referralCodeUsed: validatedReferralCode,
        ticketId,
        status: 'PENDING',
        paymentStatus: 'PENDING',
      },
      include: {
        venue: true,
        partner: true,
      },
    });

    // Create initial BookingEvent
    await prisma.bookingEvent.create({
      data: {
        bookingId: newBooking.id,
        eventType: 'CREATED',
        description: `Booking initiated for date ${new Date(date).toLocaleDateString('en-IN')}. Ticket ID: ${ticketId}`
      }
    }).catch(() => {});

    // Note: Partner referral bonus is credited ONLY after payment is captured in payments.controller.ts (LOGIC-005)
    if (referrerPartner) {
      // Notify partner of pending referral booking
      await prisma.notification.create({
        data: {
          title: '📢 Booking Initiated with your Referral Code',
          message: `A booking was initiated using your code ${validatedReferralCode}. Your ₹150 coins will be credited once payment is captured.`,
          targetRole: 'PARTNER',
          type: 'IN_APP',
        }
      }).then(async (notif) => {
        await prisma.partnerNotification.create({
          data: { partnerId: referrerPartner.id, notificationId: notif.id, isRead: false }
        }).catch(() => {});
      }).catch(() => {});
    }

    // Notify Partner of new incoming booking
    if (resolvedPartnerId) {
      try {
        const notif = await prisma.notification.create({
          data: {
            title: '🎉 New Event Booking Request!',
            message: `New booking (${ticketId}) received for ${new Date(date).toLocaleDateString('en-IN')}. Total value: ₹${finalTotalAmount.toLocaleString('en-IN')}.`,
            targetRole: 'PARTNER',
            type: 'BOOKING',
          },
        });
        await prisma.partnerNotification.create({
          data: { partnerId: resolvedPartnerId, notificationId: notif.id, isRead: false },
        });
      } catch (notifErr) {
        // Log silently
      }
    }

    // Notify User of booking confirmation
    if (userId) {
      try {
        const userNotif = await prisma.notification.create({
          data: {
            title: '🎟️ Booking Confirmed!',
            message: `Your celebration booking (${ticketId}) for ${new Date(date).toLocaleDateString('en-IN')} has been confirmed! Total: ₹${finalTotalAmount.toLocaleString('en-IN')}.`,
            targetRole: 'USER',
            type: 'BOOKING',
          },
        });
        await prisma.userNotification.create({
          data: { userId, notificationId: userNotif.id, isRead: false },
        });
      } catch (userNotifErr) {
        // Log silently
      }
    }

    // Notify Admin of new booking
    try {
      await prisma.notification.create({
        data: {
          title: '🔔 New Event Booking Placed',
          message: `Booking (${ticketId}) created for ${new Date(date).toLocaleDateString('en-IN')}. Amount: ₹${finalTotalAmount.toLocaleString('en-IN')}.`,
          targetRole: 'ADMIN',
          type: 'BOOKING',
        },
      });
    } catch (adminNotifErr) {
      // Log silently
    }

    res.status(201).json({ success: true, data: newBooking });
  } catch (error: any) {
    console.error('Create booking error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to create booking' });
  }
};

export const getBookingById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const booking = await prisma.booking.findUnique({
      where: { id },
      include: {
        venue: true,
        partner: true,
        user: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    // Security check: Ensure caller is Admin, the booking User, or the assigned Partner
    const callerId = req.user!.id;
    const callerRole = req.user!.role;
    const isOwner = callerId === booking.userId || callerId === booking.partnerId;
    const isAdmin = callerRole === 'ADMIN' || callerRole === 'SUPER_ADMIN';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ success: false, error: 'Unauthorized to view this booking' });
    }

    res.status(200).json({ success: true, booking, data: booking });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getUserBookings = async (req: Request, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: { userId: req.user!.id },
      include: { venue: true, partner: true },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ success: true, data: bookings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getPartnerBookings = async (req: Request, res: Response) => {
  try {
    const partnerId = String(req.params.partnerId);

    // Security: Ensure only the partner themselves or an admin can view their bookings
    if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'ADMIN' && req.user!.id !== partnerId) {
      return res.status(403).json({ success: false, error: 'Unauthorized access to partner bookings' });
    }

    const bookings = await prisma.booking.findMany({
      where: { partnerId },
      include: {
        venue: true,
        user: { select: { name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ success: true, data: bookings });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateBookingStatus = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;

    // Security: Fetch booking to verify ownership
    const booking = await prisma.booking.findUnique({ where: { id } });
    if (!booking) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    // Only allow Admin or the Partner who owns the booking to update its status
    if (req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'ADMIN' && req.user!.id !== booking.partnerId) {
      return res.status(403).json({ success: false, error: 'Unauthorized to update this booking' });
    }

    const updated = await prisma.booking.update({
      where: { id },
      data: { status },
    });
    res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
