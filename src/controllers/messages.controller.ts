import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const sendMessage = async (req: Request, res: Response) => {
  try {
    const { receiverId, receiverRole, content } = req.body;
    const senderId = req.user!.id;
    const senderRole = req.user!.role;

    if (!receiverId || !receiverRole || !content) {
      return res.status(400).json({ success: false, error: 'Receiver ID, role, and content are required.' });
    }

    const message = await prisma.message.create({
      data: {
        senderId,
        senderRole,
        receiverId,
        receiverRole,
        content
      }
    });

    res.status(201).json({ success: true, data: message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getInbox = async (req: Request, res: Response) => {
  try {
    const receiverId = req.user!.id;
    const receiverRole = req.user!.role;

    const messages = await prisma.message.findMany({
      where: { receiverId, receiverRole },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ success: true, data: messages });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getOutbox = async (req: Request, res: Response) => {
  try {
    const senderId = req.user!.id;
    const senderRole = req.user!.role;

    const messages = await prisma.message.findMany({
      where: { senderId, senderRole },
      orderBy: { createdAt: 'desc' }
    });

    res.status(200).json({ success: true, data: messages });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const message = await prisma.message.updateMany({
      where: { id: id as string, receiverId: req.user!.id },
      data: { isRead: true }
    });
    res.status(200).json({ success: true, data: message });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
