import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { logAdminActivity } from './adminActivity.controller';

const prisma = new PrismaClient();

// Send push notifications to Expo registered mobile devices
const sendExpoPushNotifications = async (tokens: string[], title: string, body: string, data?: any) => {
  if (!tokens || tokens.length === 0) return 0;
  const validTokens = tokens.filter(t => typeof t === 'string' && (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[')));
  if (validTokens.length === 0) return 0;

  let sentCount = 0;
  const CHUNK_SIZE = 100;
  for (let i = 0; i < validTokens.length; i += CHUNK_SIZE) {
    const chunk = validTokens.slice(i, i + CHUNK_SIZE);
    try {
      const messages = chunk.map(token => ({
        to: token,
        sound: 'default',
        title,
        body,
        data: data || { type: 'BROADCAST' },
        priority: 'high',
        channelId: 'default',
      }));

      const resp = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      if (resp.ok) {
        sentCount += chunk.length;
      }
    } catch (pushErr) {
      console.warn('Expo push notification dispatch failed for chunk:', pushErr);
    }
  }
  return sentCount;
};

// ==========================================
// SEND NOTIFICATION (Admin -> Users/Partners)
// ==========================================
export const sendNotification = async (req: Request, res: Response) => {
  try {
    const { title, message } = req.body;
    if (!title || !message) {
      return res.status(400).json({ success: false, error: 'Title and message are required.' });
    }

    const rawTarget = String(req.body.targetRole || req.body.target || 'ALL').trim().toUpperCase();
    let targetRole: 'ALL' | 'USER' | 'PARTNER' = 'ALL';
    if (rawTarget.includes('PARTNER')) {
      targetRole = 'PARTNER';
    } else if (rawTarget.includes('USER') || rawTarget.includes('CUSTOMER')) {
      targetRole = 'USER';
    } else {
      targetRole = 'ALL';
    }

    const requestedType = String(req.body.type || 'IN_APP').toUpperCase().replace('-', '_');
    const notifType = requestedType === 'PUSH' ? 'PUSH' : requestedType;

    // Create the notification record
    const notification = await prisma.notification.create({
      data: {
        title: String(title).trim(),
        message: String(message).trim(),
        targetRole,
        type: notifType,
      },
    });

    // Mirror into Announcement table so public queries and web banners receive the broadcast
    try {
      await prisma.announcement.create({
        data: {
          title: String(title).trim(),
          message: String(message).trim(),
          targetAudience: targetRole,
          priority: requestedType === 'URGENT' ? 'HIGH' : 'MEDIUM',
          isActive: true,
        },
      });
    } catch (annErr) {
      console.warn('Could not mirror announcement:', annErr);
    }

    let userCount = 0;
    let partnerCount = 0;
    const devicePushTokens: string[] = [];

    // Distribute to target users in safe batches
    if (targetRole === 'ALL' || targetRole === 'USER') {
      try {
        const users = await prisma.user.findMany({ select: { id: true } });
        userCount = users.length;
        const BATCH_SIZE = 500;
        for (let i = 0; i < users.length; i += BATCH_SIZE) {
          const chunk = users.slice(i, i + BATCH_SIZE);
          await prisma.userNotification.createMany({
            data: chunk.map((u) => ({ userId: u.id, notificationId: notification.id })),
            skipDuplicates: true,
          });
        }
      } catch (uErr) {
        console.error('Error distributing notification to users:', uErr);
      }
    }

    // Distribute to target partners in safe batches
    if (targetRole === 'ALL' || targetRole === 'PARTNER') {
      try {
        const partners = await prisma.partner.findMany({ select: { id: true } });
        partnerCount = partners.length;
        const BATCH_SIZE = 500;
        for (let i = 0; i < partners.length; i += BATCH_SIZE) {
          const chunk = partners.slice(i, i + BATCH_SIZE);
          await prisma.partnerNotification.createMany({
            data: chunk.map((p) => ({ partnerId: p.id, notificationId: notification.id })),
            skipDuplicates: true,
          });
        }
      } catch (pErr) {
        console.error('Error distributing notification to partners:', pErr);
      }
    }

    // Gather device tokens for push notification delivery
    try {
      const whereToken: any = {};
      if (targetRole === 'USER') {
        whereToken.userId = { not: null };
      } else if (targetRole === 'PARTNER') {
        whereToken.partnerId = { not: null };
      }
      const deviceTokens = await prisma.deviceToken.findMany({
        where: whereToken,
        select: { pushToken: true }
      });
      deviceTokens.forEach(d => {
        if (d.pushToken) devicePushTokens.push(d.pushToken);
      });
    } catch (dtErr) {
      console.warn('Could not retrieve device tokens:', dtErr);
    }

    // Send Expo push notifications to registered devices
    let pushSentCount = 0;
    if (devicePushTokens.length > 0) {
      pushSentCount = await sendExpoPushNotifications(
        devicePushTokens,
        String(title).trim(),
        String(message).trim(),
        { notificationId: notification.id, targetRole, type: notifType }
      );
    }

    // Log admin activity so the Platform Feed immediately displays this broadcast
    try {
      await logAdminActivity(
        'NOTIFICATION_BROADCAST',
        `Broadcast Sent: ${String(title).trim().substring(0, 40)}`,
        `Audience: ${targetRole}. In-app: ${userCount + partnerCount} recipients. Push delivered: ${pushSentCount} devices.`,
        {
          notificationId: notification.id,
          targetRole,
          type: notifType,
          userCount,
          partnerCount,
          pushSentCount,
        },
        requestedType === 'URGENT' ? 'URGENT' : 'INFO'
      );
    } catch (logErr) {
      console.warn('Could not log broadcast activity:', logErr);
    }

    res.status(201).json({
      success: true,
      data: notification,
      recipientCount: userCount + partnerCount,
      pushSentCount,
      message: `Notification broadcasted successfully to ${targetRole === 'ALL' ? 'all users & partners' : targetRole.toLowerCase() + 's'}. (${userCount + partnerCount} in-app, ${pushSentCount} push devices).`,
    });
  } catch (error: any) {
    console.error('sendNotification error:', error);
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

      const partnerNotifIds = new Set(notifications.map(pn => pn.notificationId));
      const publicNotifs = await prisma.notification.findMany({
        where: {
          targetRole: { in: ['ALL', 'PARTNER'] },
          type: { not: 'WALLET' }
        },
        orderBy: { createdAt: 'desc' },
        take: 20
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

      const additionalPublic = publicNotifs
        .filter(pn => !partnerNotifIds.has(pn.id))
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

      const combined = [...formatted, ...additionalPublic].sort((a, b) => 
        new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime()
      );

      return res.status(200).json({ success: true, data: combined });
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

