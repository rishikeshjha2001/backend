import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Helper: generate unique HLP ID for partners
const generateHlpId = async (): Promise<string> => {
  const count = await prisma.partner.count();
  const nextNumber = 1708 + count;
  return `hlpr${nextNumber.toString().padStart(6, '0')}`;
};

export const createPartner = async (req: Request, res: Response) => {
  try {
    const { 
      name, email, phone, password, businessName, categories, location,
      ownerName, gstNumber, panNumber, bankAccount, bankIfsc 
    } = req.body;

    const managerId = req.user!.id; // Authenticated manager

    if (!name || !email || !phone || !businessName || !password) {
      return res.status(400).json({ success: false, error: 'Name, email, phone, business name, and password are required.' });
    }

    const existing = await prisma.partner.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({ success: false, error: 'Partner with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(12);
    const passwordHash = await bcrypt.hash(password, salt);
    const hlpId = await generateHlpId();
    const referralCode = `HLP-REF-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;

    const partner = await prisma.partner.create({
      data: {
        hlpId,
        name,
        email,
        passwordHash,
        phone,
        businessName,
        categories: categories || [],
        location: location || '',
        referralCode,
        ownerName: ownerName || null,
        gstNumber: gstNumber || null,
        panNumber: panNumber || null,
        bankAccount: bankAccount || null,
        bankIfsc: bankIfsc || null,
        managerId, // Link partner to the manager
        isVerified: false // Needs admin approval
      }
    });

    res.status(201).json({ success: true, partner: { id: partner.id, name: partner.name, hlpId: partner.hlpId } });
  } catch (error: any) {
    console.error('Partner creation error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getMyPartners = async (req: Request, res: Response) => {
  try {
    const partners = await prisma.partner.findMany({
      where: { managerId: req.user!.id },
      select: { id: true, hlpId: true, name: true, businessName: true, phone: true, isVerified: true, status: true, location: true }
    });
    res.status(200).json({ success: true, data: partners });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// NOTES & DATA ENTRY
// ==========================================
export const createNote = async (req: Request, res: Response) => {
  try {
    const { title, content, reminderAt } = req.body;
    const note = await prisma.managerNote.create({
      data: {
        managerId: req.user!.id,
        title,
        content,
        reminderAt: reminderAt ? new Date(reminderAt) : null,
      }
    });
    res.status(201).json({ success: true, data: note });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getNotes = async (req: Request, res: Response) => {
  try {
    const notes = await prisma.managerNote.findMany({
      where: { managerId: req.user!.id },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: notes });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateNoteStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const note = await prisma.managerNote.update({
      where: { id: id as string },
      data: { status }
    });
    res.status(200).json({ success: true, data: note });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// TICKET CHECKING (Dandiya etc)
// ==========================================
export const checkTicket = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.body;
    if (!ticketId || !String(ticketId).trim()) {
      return res.status(400).json({ success: false, error: 'Ticket ID is required' });
    }

    const cleanId = String(ticketId).trim();

    // 1. Check standard Booking (by ticketId or id)
    const booking = await prisma.booking.findFirst({
      where: { OR: [{ ticketId: cleanId }, { id: cleanId }] },
      include: {
        user: { select: { name: true, phone: true } },
        venue: { select: { name: true } },
        partner: { select: { businessName: true } }
      }
    });

    if (booking) {
      if (booking.status === 'COMPLETED') {
        return res.status(400).json({ success: false, error: 'Ticket already scanned/used.', data: booking });
      }
      return res.status(200).json({
        success: true,
        data: {
          ...booking,
          ticketId: booking.ticketId || booking.id,
          type: 'VENUE_BOOKING',
          customerName: booking.user?.name || 'Customer',
          customerPhone: booking.user?.phone || 'N/A',
          serviceName: booking.venue?.name || 'Celebration Booking'
        }
      });
    }

    // 2. Check CustomSectionBooking (by ticketCode or id)
    const sectionBooking = await (prisma as any).customSectionBooking.findFirst({
      where: { OR: [{ ticketCode: cleanId }, { id: cleanId }] },
      include: {
        item: { select: { title: true, location: true, price: true } }
      }
    });

    if (sectionBooking) {
      if (sectionBooking.status === 'COMPLETED') {
        return res.status(400).json({ success: false, error: 'Ticket already scanned/used.', data: sectionBooking });
      }
      return res.status(200).json({
        success: true,
        data: {
          id: sectionBooking.id,
          ticketId: sectionBooking.ticketCode || sectionBooking.id,
          type: 'SECTION_BOOKING',
          customerName: sectionBooking.userName,
          customerPhone: sectionBooking.userPhone,
          serviceName: sectionBooking.item?.title || 'Celebration Booking',
          status: sectionBooking.status,
          paymentStatus: sectionBooking.paymentStatus,
          totalAmount: sectionBooking.totalAmount,
          date: sectionBooking.bookingDate,
          user: { name: sectionBooking.userName, phone: sectionBooking.userPhone },
          venue: { name: sectionBooking.item?.title }
        }
      });
    }

    // 3. Check EventBooking (by id)
    const eventBooking = await prisma.eventBooking.findUnique({
      where: { id: cleanId },
      include: {
        user: { select: { name: true, phone: true } },
        event: { select: { title: true, location: true, date: true } }
      }
    });

    if (eventBooking) {
      if (eventBooking.status === 'COMPLETED') {
        return res.status(400).json({ success: false, error: 'Ticket already scanned/used.', data: eventBooking });
      }
      return res.status(200).json({
        success: true,
        data: {
          id: eventBooking.id,
          ticketId: eventBooking.id,
          type: 'EVENT_PASS',
          customerName: eventBooking.user?.name || 'Guest',
          customerPhone: eventBooking.user?.phone || 'N/A',
          serviceName: eventBooking.event?.title || 'Event Pass',
          status: eventBooking.status,
          paymentStatus: 'PAID',
          totalAmount: eventBooking.totalAmount,
          date: eventBooking.event?.date,
          user: eventBooking.user,
          venue: { name: eventBooking.event?.title }
        }
      });
    }

    return res.status(404).json({ success: false, error: 'Ticket not found or invalid.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const markTicketUsed = async (req: Request, res: Response) => {
  try {
    const { ticketId } = req.body;
    if (!ticketId || !String(ticketId).trim()) {
      return res.status(400).json({ success: false, error: 'Ticket ID is required' });
    }

    const cleanId = String(ticketId).trim();

    // Check standard booking
    const booking = await prisma.booking.findFirst({
      where: { OR: [{ ticketId: cleanId }, { id: cleanId }] }
    });
    if (booking) {
      const updated = await prisma.booking.update({
        where: { id: booking.id },
        data: { status: 'COMPLETED' }
      });
      return res.status(200).json({ success: true, data: updated, message: 'Ticket marked as used.' });
    }

    // Check custom section booking
    const sectionBooking = await (prisma as any).customSectionBooking.findFirst({
      where: { OR: [{ ticketCode: cleanId }, { id: cleanId }] }
    });
    if (sectionBooking) {
      const updated = await (prisma as any).customSectionBooking.update({
        where: { id: sectionBooking.id },
        data: { status: 'COMPLETED' }
      });
      return res.status(200).json({ success: true, data: updated, message: 'Ticket marked as used.' });
    }

    // Check event booking
    const eventBooking = await prisma.eventBooking.findUnique({
      where: { id: cleanId }
    });
    if (eventBooking) {
      const updated = await prisma.eventBooking.update({
        where: { id: eventBooking.id },
        data: { status: 'COMPLETED' }
      });
      return res.status(200).json({ success: true, data: updated, message: 'Ticket marked as used.' });
    }

    return res.status(404).json({ success: false, error: 'Ticket not found.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// MANAGER DASHBOARD STATS
// ==========================================
export const getManagerDashboardStats = async (req: Request, res: Response) => {
  try {
    const managerId = req.user!.id;

    const [totalPartners, activePartners, pendingPartners, notes, scannedToday] = await Promise.all([
      prisma.partner.count({ where: { managerId } }),
      prisma.partner.count({ where: { managerId, isVerified: true } }),
      prisma.partner.count({ where: { managerId, isVerified: false } }),
      prisma.managerNote.findMany({
        where: { managerId },
        orderBy: { createdAt: 'desc' },
        take: 5
      }),
      prisma.booking.count({
        where: {
          status: 'COMPLETED',
          createdAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0))
          }
        }
      })
    ]);

    const recentPartners = await prisma.partner.findMany({
      where: { managerId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        hlpId: true,
        name: true,
        businessName: true,
        phone: true,
        isVerified: true,
        status: true,
        createdAt: true
      }
    });

    res.status(200).json({
      success: true,
      data: {
        totalPartners,
        activePartners,
        pendingPartners,
        scannedToday,
        notes,
        recentPartners
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteNote = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.managerNote.delete({
      where: { id: id as string }
    });
    res.status(200).json({ success: true, message: 'Note deleted successfully.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

