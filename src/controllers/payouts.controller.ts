import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getAllPayouts = async (req: Request, res: Response) => {
  try {
    const payouts = await prisma.payout.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(payouts);
  } catch (error) {
    console.error('Error fetching payouts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const processPayout = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  try {
    const payout = await prisma.payout.update({
      where: { id },
      data: { status: 'PROCESSED', settlementDate: new Date() },
    });
    res.json({ message: 'Payout processed', payout });
  } catch (error) {
    console.error('Error processing payout:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
