import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { broadcastToUsers } from './notification.controller';

const prisma = new PrismaClient();

export const createOffer = async (req: Request, res: Response) => {
  try {
    const { title, code, discountPercent, description, validFrom, validTo } = req.body;
    const offer = await prisma.offer.create({
      data: { title, code: code.toUpperCase(), discountPercent: parseFloat(discountPercent), description, validFrom: new Date(validFrom), validTo: new Date(validTo) }
    });

    // Auto broadcast notification to all users
    broadcastToUsers(
      `🎉 New Celebration Offer: ${title}`,
      `Use coupon code ${code.toUpperCase()} to get ${discountPercent}% OFF on your celebration bookings!`
    ).catch(() => {});

    res.status(201).json({ success: true, data: offer });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getActiveOffers = async (req: Request, res: Response) => {
  try {
    const now = new Date();
    const offers = await prisma.offer.findMany({ where: { status: 'Active', validTo: { gte: now } }, orderBy: { createdAt: 'desc' } });
    res.status(200).json({ success: true, data: offers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAllOffers = async (req: Request, res: Response) => {
  try {
    const offers = await prisma.offer.findMany({ orderBy: { createdAt: 'desc' } });
    res.status(200).json({ success: true, data: offers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateOffer = async (req: Request, res: Response) => {
  try {
    const offer = await prisma.offer.update({ where: { id: req.params.id as string }, data: req.body });

    // Auto broadcast notification on update
    broadcastToUsers(
      `⚡ Celebration Offer Updated: ${offer.title}`,
      `Special code ${offer.code} gives you ${offer.discountPercent}% OFF!`
    ).catch(() => {});

    res.status(200).json({ success: true, data: offer });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const validateCoupon = async (req: Request, res: Response) => {
  try {
    const code = String(req.body.code || '').trim().toUpperCase();
    const orderAmount = Number(req.body.amount || req.body.orderAmount || 0);

    if (!code) {
      return res.status(400).json({ success: false, error: 'Coupon code is required.' });
    }

    const now = new Date();
    const offer = await prisma.offer.findFirst({
      where: {
        code,
        status: 'Active',
        validFrom: { lte: now },
        validTo: { gte: now }
      }
    });

    if (!offer) {
      return res.status(404).json({ success: false, error: 'Invalid or expired coupon code.' });
    }

    const discountPercent = offer.discountPercent || 0;
    const discountAmount = orderAmount > 0 ? Math.round((orderAmount * discountPercent) / 100) : 0;
    const finalAmount = Math.max(0, orderAmount - discountAmount);

    res.status(200).json({
      success: true,
      message: `Coupon ${offer.code} applied! Saved ${discountPercent}%.`,
      data: {
        code: offer.code,
        title: offer.title,
        description: offer.description,
        discountPercent,
        discountAmount,
        originalAmount: orderAmount,
        finalAmount
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteOffer = async (req: Request, res: Response) => {
  try {
    await prisma.offer.delete({ where: { id: req.params.id as string } });
    res.status(200).json({ success: true, message: 'Offer deleted.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

