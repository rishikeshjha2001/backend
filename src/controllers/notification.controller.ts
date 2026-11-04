import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ==========================================
// SEND NOTIFICATION (Admin -> Users/Partners)
// ==========================================
export const sendNotification = async (req: Request, res: Response) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'Title and message are required.' });
    }

    const rawTarget = String(req.body.targetRole || req.body.target || 'ALL').toUpperCase();
    const targetRole = rawTarget.includes('USER') ? 'USER' : rawTarget.includes('PARTNER') ? 'PARTNER' : 'ALL';
    // Browser and mobile apps currently support durable in-app alerts. Do not
    // label a broadcast as a device push until a push provider and device-token
    // delivery worker are configured.
    const requestedType = String(req.body.type || 'IN_APP').toUpperCase().replace('-', '_');
    const notifType = requestedType === 'PUSH' ? 'IN_APP' : requestedType;

    // Create the notification record
    const notification = await prisma.notification.create({
      data: { title: String(title).trim(), message: String(message).trim(), targetRole, type: notifType }
    });

    // Distribute to target users/partners
    if (targetRole === 'ALL' || targetRole === 'USER') {
      const users = await prisma.user.findMany({ select: { id: true } });
      if (users.length > 0) {
        await prisma.userNotification.createMany({
          data: users.map(u => ({ userId: u.id, notificationId: notification.id })),
          skipDuplicates: true
        });
      }
    }

    if (targetRole === 'ALL' || targetRole === 'PARTNER') {
      const partners = await prisma.partner.findMany({ select: { id: true } });
      if (partners.length > 0) {
        await prisma.partnerNotification.createMany({
          data: partners.map(p => ({ partnerId: p.id, notificationId: notification.id })),
          skipDuplicates: true
        });
      }
    }

    res.status(201).json({
      success: true,
      data: notification,
      message: requestedType === 'PUSH'
        ? 'In-app broadcast sent. Device push delivery is not configured yet.'
        : 'In-app notification broadcasted successfully.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// HELPER: Broadcast notification directly to all users
export const broadcastToUsers = async (title: string, message: string, type = 'IN_APP') => {
  try {
    const notification = await prisma.notification.create({
      data: { title: title.trim(), message: message.trim(), targetRole: 'USER', type }
    });
    const users = await prisma.user.findMany({ select: { id: true } });
    if (users.length > 0) {
      await prisma.userNotification.createMany({
        data: users.map(u => ({ userId: u.id, notificationId: notification.id })),
        skipDuplicates: true
      });
    }
    return notification;
  } catch (err) {
    console.error('Error broadcasting notification to users:', err);
    return null;
  }
};


// ==========================================
// GET MY NOTIFICATIONS (for logged-in user/partner)
// ==========================================
export const getMyNotifications = async (req: Request, res: Response) => {
  try {
    const { id, role } = req.user!;

    if (role === 'PARTNER') {
      const notifications = await prisma.partnerNotification.findMany({
        where: { partnerId: id },
        include: { notification: true },
        orderBy: { createdAt: 'desc' },
        take: 50
      });
      const formatted = notifications.map(pn => ({
        id: pn.id,
        notificationId: pn.notificationId,
        title: pn.notification.title,
        message: pn.notification.message,
        type: pn.notification.type,
        isRead: pn.isRead,
        createdAt: pn.createdAt || pn.notification.createdAt,
        sentAt: pn.notification.createdAt || pn.createdAt
      }));
      return res.status(200).json({ success: true, data: formatted });
    }

    // USER
    const notifications = await prisma.userNotification.findMany({
      where: { userId: id },
      include: { notification: true },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    const publicNotifs = await prisma.notification.findMany({
      where: {
        targetRole: { in: ['ALL', 'USER'] },
        type: { not: 'WALLET' }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    });

    const userNotifIds = new Set(notifications.map(un => un.notificationId));
    const formattedUserNotifs = notifications.map(un => ({
      id: un.id,
      notificationId: un.notificationId,
      title: un.notification.title,
      message: un.notification.message,
      type: un.notification.type,
      isRead: un.isRead,
      createdAt: un.createdAt || un.notification.createdAt,
      sentAt: un.notification.createdAt || un.createdAt
    }));

    const additionalPublic = publicNotifs
      .filter(pn => !userNotifIds.has(pn.id))
      .map(pn => ({
        id: `pub_${pn.id}`,
        notificationId: pn.id,
        title: pn.title,
        message: pn.message,
        type: pn.type,
        isRead: false,
        createdAt: pn.createdAt,
        sentAt: pn.createdAt
      }));

    const combined = [...formattedUserNotifs, ...additionalPublic].sort((a, b) => 
      new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
    );

    res.status(200).json({ success: true, data: combined });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// MARK AS READ
// ==========================================
export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { role, id: authId } = req.user!;
    const id = String(req.params.id);
    if (role === 'PARTNER') {
      const updated = await prisma.partnerNotification.updateMany({
        where: { id, partnerId: authId },
        data: { isRead: true },
      });
      if (updated.count === 0) {
        return res.status(404).json({ success: false, error: 'Notification not found or access denied.' });
      }
    } else {
      const updated = await prisma.userNotification.updateMany({
        where: { id, userId: authId },
        data: { isRead: true },
      });
      if (updated.count === 0) {
        return res.status(404).json({ success: false, error: 'Notification not found or access denied.' });
      }
    }
    res.status(200).json({ success: true, message: 'Marked as read.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// GET ALL NOTIFICATIONS (Admin view)
// ==========================================
export const getAllNotifications = async (req: Request, res: Response) => {
  try {
    const notifications = await prisma.notification.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json({ success: true, data: notifications });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// GET PUBLIC NOTIFICATIONS (User App Notification Bar)
// ==========================================
export const getPublicNotifications = async (req: Request, res: Response) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: {
        targetRole: { in: ['ALL', 'USER'] },
        type: { not: 'WALLET' },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    const formatted = notifications.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      isRead: false,
      createdAt: n.createdAt,
      sentAt: n.createdAt
    }));
    res.status(200).json({ success: true, data: formatted });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

