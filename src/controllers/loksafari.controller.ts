import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const createPackage = async (req: Request, res: Response) => {
  try {
    const { title, location, duration, price, description, imageUrl, status } = req.body || {};
    if (!title || !location || !price) {
      return res.status(400).json({ success: false, error: 'Title, location, and price are required.' });
    }

    const newPackage = await prisma.lokSafariPackage.create({
      data: {
        title: String(title).trim(),
        location: String(location).trim(),
        duration: duration ? String(duration).trim() : 'Full Day',
        price: parseFloat(price) || 0,
        description: description ? String(description).trim() : '',
        imageUrl: imageUrl || 'https://images.unsplash.com/photo-1590073242678-70ee3fc28e8e?auto=format&fit=crop&w=1200&q=80',
        status: status || 'Active'
      }
    });
    res.status(201).json({ success: true, data: newPackage, package: newPackage });
  } catch (error: any) {
    console.error('Error creating LokSafari package:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getAllPackages = async (req: Request, res: Response) => {
  try {
    const packages = await prisma.lokSafariPackage.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: packages, packages });
  } catch (error: any) {
    console.error('Error fetching LokSafari packages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getActivePackages = async (req: Request, res: Response) => {
  try {
    const packages = await prisma.lokSafariPackage.findMany({
      where: { status: 'Active' },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, data: packages, packages });
  } catch (error: any) {
    console.error('Error fetching active LokSafari packages:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getPackageById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pkg = await prisma.lokSafariPackage.findUnique({ where: { id: id as string } });
    if (!pkg) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }
    res.status(200).json({ success: true, data: pkg, package: pkg });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updatePackage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { title, location, duration, price, description, imageUrl, status } = req.body || {};

    const updated = await prisma.lokSafariPackage.update({
      where: { id: id as string },
      data: {
        ...(title && { title: String(title).trim() }),
        ...(location && { location: String(location).trim() }),
        ...(duration && { duration: String(duration).trim() }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(description !== undefined && { description: String(description).trim() }),
        ...(imageUrl && { imageUrl }),
        ...(status && { status })
      }
    });

    res.status(200).json({ success: true, data: updated, package: updated });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deletePackage = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await prisma.lokSafariPackage.delete({ where: { id: id as string } });
    res.status(200).json({ success: true, message: 'Package deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
