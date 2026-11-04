import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createAnnouncement = async (req: Request, res: Response) => {
  try {
    const { title, message, targetAudience, priority, expiresAt } = req.body;
    const announcement = await prisma.announcement.create({
      data: { title, message, targetAudience: targetAudience || 'ALL', priority: priority || 'MEDIUM', expiresAt: expiresAt ? new Date(expiresAt) : null }
    });
    res.status(201).json({ success: true, data: announcement });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getActiveAnnouncements = async (req: Request, res: Response) => {
  try {
    const role = req.user?.role;
    const targetRole = role === 'PARTNER' ? 'PARTNER' : (role === 'ADMIN' ? 'ALL' : 'USER');

    const announcements = await prisma.announcement.findMany({
      where: {
        isActive: true,
        OR: [{ targetAudience: 'ALL' }, { targetAudience: targetRole }],
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] }]
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: announcements });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAllAnnouncements = async (req: Request, res: Response) => {
  try {
    const announcements = await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json({ success: true, data: announcements });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateAnnouncement = async (req: Request, res: Response) => {
  try {
    const announcement = await prisma.announcement.update({ where: { id: req.params.id as string }, data: req.body });
    res.status(200).json({ success: true, data: announcement });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteAnnouncement = async (req: Request, res: Response) => {
  try {
    await prisma.announcement.delete({ where: { id: req.params.id as string } });
    res.status(200).json({ success: true, message: 'Announcement deleted.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
