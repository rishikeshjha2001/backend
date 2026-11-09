import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const getProfile = async (req: Request, res: Response) => {
  try {
    let user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { id: true, name: true, email: true, phone: true, gender: true, profileImage: true, referralCode: true, walletBalance: true, createdAt: true }
    });
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    if (!user.referralCode) {
      const cleanName = user.name.replace(/[^a-zA-Z0-9]/g, '').substring(0, 4).toUpperCase() || 'VIP';
      const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
      const code = `LOKAM-${cleanName}-${randomSuffix}`;
      user = await prisma.user.update({
        where: { id: user.id },
        data: { referralCode: code },
        select: { id: true, name: true, email: true, phone: true, gender: true, profileImage: true, referralCode: true, walletBalance: true, createdAt: true }
      });
    }

    res.status(200).json({ success: true, data: user, user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getWallet = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, phone: true, walletBalance: true }
    });

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    res.status(200).json({
      success: true,
      data: {
        walletBalance: user.walletBalance || 0,
        currency: 'INR',
        formatted: `₹${user.walletBalance || 0}`,
        discountDescription: 'Applied automatically to reduce booking totals at checkout'
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { currentPassword, newPassword } = req.body;
    if (!newPassword || String(newPassword).trim().length < 6) {
      return res.status(400).json({ success: false, error: 'New password must be at least 6 characters long.' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found.' });

    // Check if user has an existing standard bcrypt password or a generated OTP/guest dummy password
    const isGeneratedPassword =
      !user.passwordHash ||
      user.passwordHash.startsWith('firebase_') ||
      user.passwordHash.includes('GUEST_') ||
      user.passwordHash.includes('OTP');

    if (!isGeneratedPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, error: 'Please enter your current password.' });
      }
      let isMatch = false;
      try {
        isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
      } catch {
        isMatch = currentPassword === user.passwordHash;
      }
      if (!isMatch && currentPassword !== user.passwordHash) {
        return res.status(400).json({ success: false, error: 'Current password does not match.' });
      }
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: newHash },
    });

    return res.status(200).json({ success: true, message: 'Password changed successfully.' });
  } catch (error: any) {
    console.error('changePassword error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

export const updateProfile = async (req: Request, res: Response) => {
  try {
    const { name, phone, gender, profileImage } = req.body;
    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (phone !== undefined) updateData.phone = phone;
    if (gender !== undefined) updateData.gender = gender;
    if (profileImage !== undefined) updateData.profileImage = profileImage;

    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: updateData,
      select: { id: true, name: true, email: true, phone: true, gender: true, profileImage: true, referralCode: true, walletBalance: true, createdAt: true }
    });
    res.status(200).json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getUserBookings = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    
    const vendorBookings = await prisma.booking.findMany({
      where: { userId },
      include: { 
        partner: { select: { businessName: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const eventBookings = await prisma.eventBooking.findMany({
      where: { userId },
      include: {
        event: { select: { title: true, imageUrl: true, date: true, location: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    let sectionBookings: any[] = [];
    try {
      if ((prisma as any).customSectionBooking) {
        sectionBookings = await (prisma as any).customSectionBooking.findMany({
          where: { userId },
          include: {
            item: {
              select: {
                id: true,
                title: true,
                location: true,
                image: true,
                itemType: true,
                price: true,
                badge: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });
      }
    } catch (sbErr) {
      console.warn('Section bookings fetch warning:', sbErr);
    }

    res.status(200).json({ 
      success: true, 
      data: {
        vendorBookings,
        eventBookings,
        sectionBookings,
      } 
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const registerDeviceToken = async (req: Request, res: Response) => {
  try {
    const { platform, pushToken, appVersion } = req.body;
    const { id, role } = req.user!;

    if (!pushToken || !platform) {
      return res.status(400).json({ success: false, error: 'Push token and platform are required' });
    }

    const data = {
      platform,
      pushToken,
      appVersion: appVersion || null,
      lastActive: new Date()
    };

    if (role === 'PARTNER') {
      await prisma.deviceToken.upsert({
        where: { pushToken },
        update: { ...data, partnerId: id },
        create: { ...data, partnerId: id }
      });
    } else {
      await prisma.deviceToken.upsert({
        where: { pushToken },
        update: { ...data, userId: id },
        create: { ...data, userId: id }
      });
    }

    res.status(200).json({ success: true, message: 'Device token registered' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
