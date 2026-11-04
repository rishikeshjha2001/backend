import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { broadcastToUsers } from './notification.controller';
import { logAdminActivity } from './adminActivity.controller';

const prisma = new PrismaClient();



const DEFAULT_CELEBRATION_HEROES = [
  {
    id: 'hero_birthday_throne',
    image: 'https://happylokam.com/images/hero/hero_birthday_throne.jpg',
    badge: 'ROYAL BIRTHDAYS',
    title1: 'Grand Royal Birthday',
    title2: '& Fiesta Themes',
    desc: 'Enchanted golden thrones, balloon arches, neon backdrops, live magicians & celebration feasts for all ages.',
    ctaText: 'Book Birthday Theme',
    ctaLink: '/(tabs)/explore?category=Birthdays',
    gradient: 'from-pink-600 to-purple-800',
    order: 1,
    isActive: true,
  },
  {
    id: 'hero_wedding_rings',
    image: 'https://happylokam.com/images/hero/hero_wedding_rings.jpg',
    badge: 'DESTINATION PALACES',
    title1: 'Luxury Destination Weddings',
    title2: '& Lakeside Palaces',
    desc: 'Sunset lake views, royal heritage suites, 200+ valet parking & royal bridal entries in Rajasthan.',
    ctaText: 'View Palaces',
    ctaLink: '/(tabs)/explore?category=Weddings',
    gradient: 'from-rose-500 to-amber-700',
    order: 2,
    isActive: true,
  },
  {
    id: 'hero_corporate_events',
    image: 'https://happylokam.com/images/hero/hero_corporate_events.jpg',
    badge: 'EXECUTIVE GATHERINGS',
    title1: 'The Secret Behind',
    title2: 'Memorable Corporate Events',
    desc: 'High-level executive summits, luxury banquets, 5-star live gourmet counters & complete AV production.',
    ctaText: 'Discover Packages',
    ctaLink: '/(tabs)/explore?category=Packages',
    gradient: 'from-slate-900 to-amber-900',
    order: 3,
    isActive: true,
  },
  {
    id: 'hero_vedic_vivah',
    image: 'https://happylokam.com/images/hero/hero_vedic_vivah.jpg',
    badge: 'ROYAL VEDIC CELEBRATION',
    title1: 'Traditional Vedic Vivah',
    title2: '& Sacred Mandaps',
    desc: 'Experience timeless rituals, certified vedic pandits, sacred havan, and bespoke floral decor for your special day.',
    ctaText: 'Explore Weddings',
    ctaLink: '/(tabs)/explore?category=Weddings',
    gradient: 'from-amber-600 to-rose-700',
    order: 4,
    isActive: true,
  },
];

// PUBLIC: Get active hero slides (with fallback seeds)
export const getHeroSlides = async (req: Request, res: Response) => {
  try {
    let slides = [];
    try {
      slides = await (prisma as any).heroSlide.findMany({
        where: { isActive: true },
        orderBy: { order: 'asc' },
      });
    } catch (dbErr) {
      console.warn('DB query heroSlide fallback:', dbErr);
    }

    const result = Array.isArray(slides) && slides.length > 0 ? slides : DEFAULT_CELEBRATION_HEROES;
    res.status(200).json({ success: true, data: result, slides: result });
  } catch (error: any) {
    console.error('Error fetching hero slides:', error);
    res.status(200).json({ success: true, data: DEFAULT_CELEBRATION_HEROES, slides: DEFAULT_CELEBRATION_HEROES });
  }
};

// ADMIN: Get all hero slides
// ADMIN: Get all hero slides (no auto-seeding)
export const getAllHeroSlidesAdmin = async (req: Request, res: Response) => {
  try {
    const slides = await (prisma as any).heroSlide.findMany({
      orderBy: { order: 'asc' },
    });

    res.status(200).json({ success: true, data: slides, slides });
  } catch (error: any) {
    console.error('Error fetching admin hero slides:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ADMIN: Create hero slide
export const createHeroSlide = async (req: Request, res: Response) => {
  try {
    const { image, badge, title1, title2, desc, ctaText, ctaLink, gradient, order, isActive } = req.body;

    if (!image || !title1) {
      return res.status(400).json({ success: false, error: 'Image URL and Title 1 are required.' });
    }

    const slide = await (prisma as any).heroSlide.create({
      data: {
        image: String(image).trim(),
        badge: badge ? String(badge).trim() : 'Happylokam Special',
        title1: String(title1).trim(),
        title2: title2 ? String(title2).trim() : '',
        desc: desc ? String(desc).trim() : '',
        ctaText: ctaText ? String(ctaText).trim() : 'Search Packages',
        ctaLink: ctaLink ? String(ctaLink).trim() : '/search',
        gradient: gradient ? String(gradient).trim() : 'from-rose-500 to-rose-700',
        order: order !== undefined ? Number(order) : 0,
        isActive: isActive !== undefined ? Boolean(isActive) : true,
      },
    });

    // Auto broadcast to users about this special highlight
    broadcastToUsers(
      `✨ ${badge || 'Happylokam Special'}: ${title1}`,
      `${title2 ? title2 + ' - ' : ''}${desc || 'Explore our latest celebration packages and discounts!'}`
    ).catch(() => {});

    logAdminActivity(
      'CONTENT_UPDATED',
      `🎨 New Hero Slide: ${title1}`,
      `Admin published new hero carousel slide "${title1} ${title2 || ''}".`,
      { slideId: slide.id, title1 },
      'INFO'
    ).catch(() => {});

    res.status(201).json({ success: true, message: 'Hero slide created successfully.', data: slide });
  } catch (error: any) {
    console.error('Error creating hero slide:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ADMIN: Update hero slide
export const updateHeroSlide = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const data: any = { ...req.body };
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;

    if (data.order !== undefined) data.order = Number(data.order);
    if (data.isActive !== undefined) data.isActive = Boolean(data.isActive);

    const slide = await (prisma as any).heroSlide.update({
      where: { id },
      data,
    });

    logAdminActivity(
      'CONTENT_UPDATED',
      `🎨 Hero Slide Updated: ${slide.title1 || id}`,
      `Hero carousel slide settings updated.`,
      { slideId: id },
      'INFO'
    ).catch(() => {});

    res.status(200).json({ success: true, message: 'Hero slide updated successfully.', data: slide });
  } catch (error: any) {
    console.error('Error updating hero slide:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

// ADMIN: Delete hero slide
export const deleteHeroSlide = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    await (prisma as any).heroSlide.delete({ where: { id } });

    logAdminActivity(
      'CONTENT_UPDATED',
      `🗑️ Hero Slide Removed`,
      `Hero carousel slide ${id} was deleted from platform.`,
      { slideId: id },
      'WARNING'
    ).catch(() => {});

    res.status(200).json({ success: true, message: 'Hero slide deleted successfully.' });
  } catch (error: any) {
    console.error('Error deleting hero slide:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
