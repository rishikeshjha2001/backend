import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// In-memory fallback in case table hasn't migrated on remote server yet
let inMemoryActivities: any[] = [
  {
    id: 'act_seed_1',
    type: 'SYSTEM',
    title: 'Happy Lokam Enterprise OS Online',
    message: 'Admin activity monitor and notification engine initialized successfully.',
    severity: 'SUCCESS',
    isRead: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'act_seed_2',
    type: 'BOOKING_CREATED',
    title: 'New Wedding Mandap Inquiry',
    message: 'Anand Sharma reserved Udaivilas Royal Heritage Palace for 250 guests.',
    severity: 'SUCCESS',
    metadata: { guestCount: 250, package: 'Udaivilas Royal Heritage' },
    isRead: false,
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
  },
  {
    id: 'act_seed_3',
    type: 'PAYMENT_RECEIVED',
    title: 'Payment Confirmed: ₹25,000',
    message: 'Razorpay UPI payment captured for Princess Castle Birthday Theme (Pass #HL-TCK-92813).',
    severity: 'SUCCESS',
    metadata: { amount: 25000, method: 'UPI' },
    isRead: false,
    createdAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
  },
];

/**
 * Universal helper to record an admin platform activity from ANY controller
 */
export const logAdminActivity = async (
  type: string,
  title: string,
  message: string,
  metadata?: any,
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'URGENT' = 'INFO'
) => {
  const newActivity = {
    id: `act_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    type,
    title,
    message,
    metadata: metadata || null,
    severity,
    isRead: false,
    createdAt: new Date(),
  };

  try {
    if ((prisma as any).adminActivityNotification) {
      await (prisma as any).adminActivityNotification.create({
        data: newActivity,
      });
      return;
    }
  } catch (err) {
    console.warn('[AdminActivity] Prisma fallback, saving in memory:', err);
  }

  // Fallback to in-memory buffer (keep last 100 entries)
  inMemoryActivities.unshift(newActivity);
  if (inMemoryActivities.length > 100) {
    inMemoryActivities = inMemoryActivities.slice(0, 100);
  }
};

/**
 * GET /api/v1/admin/activity-notifications
 * Returns activity notifications with unread count
 */
export const getAdminActivities = async (req: Request, res: Response) => {
  try {
    const { type, unreadOnly, page = 1, limit = 30 } = req.query;
    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(100, Math.max(1, Number(limit)));
    const skip = (pageNum - 1) * limitNum;

    let items: any[] = [];
    let total = 0;
    let unreadCount = 0;

    try {
      if ((prisma as any).adminActivityNotification) {
        const where: any = {};
        if (type && type !== 'ALL') where.type = String(type);
        if (unreadOnly === 'true') where.isRead = false;

        const [dbItems, dbTotal, dbUnread] = await Promise.all([
          (prisma as any).adminActivityNotification.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limitNum,
          }),
          (prisma as any).adminActivityNotification.count({ where }),
          (prisma as any).adminActivityNotification.count({ where: { isRead: false } }),
        ]);

        items = dbItems;
        total = dbTotal;
        unreadCount = dbUnread;
      }
    } catch {
      // Fallback to in-memory
    }

    if (items.length === 0 && inMemoryActivities.length > 0) {
      let filtered = [...inMemoryActivities];
      if (type && type !== 'ALL') filtered = filtered.filter((i) => i.type === type);
      if (unreadOnly === 'true') filtered = filtered.filter((i) => !i.isRead);

      total = filtered.length;
      unreadCount = inMemoryActivities.filter((i) => !i.isRead).length;
      items = filtered.slice(skip, skip + limitNum);
    }

    return res.status(200).json({
      success: true,
      data: items,
      total,
      unreadCount,
      page: pageNum,
      limit: limitNum,
    });
  } catch (error: any) {
    console.error('Error in getAdminActivities:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PATCH /api/v1/admin/activity-notifications/:id/read
 */
export const markAdminActivityAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    try {
      if ((prisma as any).adminActivityNotification) {
        await (prisma as any).adminActivityNotification.update({
          where: { id },
          data: { isRead: true },
        });
      }
    } catch {
      // In-memory fallback
    }

    const item = inMemoryActivities.find((i) => i.id === id);
    if (item) item.isRead = true;

    return res.status(200).json({ success: true, message: 'Marked as read' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/admin/activity-notifications/mark-all-read
 */
export const markAllAdminActivitiesAsRead = async (req: Request, res: Response) => {
  try {
    try {
      if ((prisma as any).adminActivityNotification) {
        await (prisma as any).adminActivityNotification.updateMany({
          where: { isRead: false },
          data: { isRead: true },
        });
      }
    } catch {
      // In-memory fallback
    }

    inMemoryActivities.forEach((i) => (i.isRead = true));

    return res.status(200).json({ success: true, message: 'All notifications marked as read' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * DELETE /api/v1/admin/activity-notifications/:id
 */
export const deleteAdminActivity = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    try {
      if ((prisma as any).adminActivityNotification) {
        await (prisma as any).adminActivityNotification.delete({
          where: { id },
        });
      }
    } catch {
      // In-memory fallback
    }

    inMemoryActivities = inMemoryActivities.filter((i) => i.id !== id);

    return res.status(200).json({ success: true, message: 'Notification deleted' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};
