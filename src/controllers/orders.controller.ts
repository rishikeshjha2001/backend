import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAllOrders = async (req: Request, res: Response) => {
  try {
    const bookings = await prisma.booking.findMany({
      include: {
        user: { select: { name: true, email: true } },
        partner: { select: { businessName: true, name: true } },
        venue: { select: { name: true } },
        events: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    const orders = bookings.map(b => ({
      id: b.id,
      customerName: b.user?.name || 'Customer',
      customerEmail: b.user?.email || '',
      partnerName: b.partner?.businessName || b.partner?.name || 'HappyLokam Venue',
      venueName: b.venue?.name || 'Venue Booking',
      amount: b.totalAmount,
      status: b.status,
      paymentStatus: b.paymentStatus,
      createdAt: b.createdAt,
      events: b.events,
    }));

    res.json({ success: true, data: orders, orders });
  } catch (error: any) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

