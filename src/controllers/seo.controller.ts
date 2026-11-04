import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const getSeoMetadata = async (req: Request, res: Response) => {
  try {
    const metadata = await prisma.seoMetadata.findMany();
    res.json(metadata);
  } catch (error) {
    console.error('Error fetching SEO metadata:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const updateSeoMetadata = async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { title, description, canonical, robots, ogImage } = req.body;
  try {
    const updated = await prisma.seoMetadata.update({
      where: { id },
      data: { title, description, canonical, robots, ogImage },
    });
    res.json({ message: 'SEO metadata updated', metadata: updated });
  } catch (error) {
    console.error('Error updating SEO metadata:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};
