import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ==========================================
// SECTIONS & CATEGORIES CONTROLLER
// ==========================================

export const formatSectionItem = (item: any) => {
  if (!item) return item;
  const rawTags: string[] = Array.isArray(item.tags) ? item.tags : [];
  const features: string[] = Array.isArray(item.features) && item.features.length > 0 ? [...item.features] : [];
  const availableTimes: string[] = Array.isArray(item.availableTimes) && item.availableTimes.length > 0 ? [...item.availableTimes] : [];
  const cleanTags: string[] = [];
  let badge = item.badge || item.subtitle || '';

  rawTags.forEach((t: string) => {
    if (typeof t === 'string') {
      if (t.startsWith('FEAT:')) {
        const feat = t.substring(5).trim();
        if (!features.includes(feat)) features.push(feat);
      } else if (t.startsWith('TIME:')) {
        const time = t.substring(5).trim();
        if (!availableTimes.includes(time)) availableTimes.push(time);
      } else if (t.startsWith('CORNER:') || t.startsWith('BADGE:')) {
        if (!badge) badge = t.split(':')[1].trim();
      } else {
        cleanTags.push(t.trim());
      }
    }
  });

  if (!badge && cleanTags.length > 0) {
    badge = cleanTags[0];
  }

  return {
    ...item,
    badge: badge || 'Featured',
    cornerTag: badge || 'Featured',
    tag: badge || 'Featured',
    features: features.length > 0 ? features : ['100% Verified Quality', 'Instant Digital Pass', 'Dedicated Coordination', 'Flexible Rescheduling'],
    availableTimes: availableTimes.length > 0 ? availableTimes : ['10:00 AM - 02:00 PM', '02:30 PM - 06:30 PM', '07:00 PM - 11:30 PM'],
    availableDates: Array.isArray(item.availableDates) ? item.availableDates : [],
    capacity: item.totalSlots || 100,
    tags: cleanTags.length > 0 ? cleanTags : ['Verified', 'Popular', 'HappyLokam Choice'],
  };
};

// ==========================================
// SECTION CONTROLLERS
// ==========================================

/**
 * GET /api/v1/sections
 * Fetch all active custom sections with their formatted items
 */
export const getAllSections = async (req: Request, res: Response) => {
  try {
    const sections = await (prisma as any).customSection.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      include: {
        items: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const formattedSections = sections.map((sec: any) => ({
      ...sec,
      name: sec.title,
      items: (sec.items || []).map(formatSectionItem),
    }));

    return res.status(200).json({
      success: true,
      data: formattedSections,
    });
  } catch (error: any) {
    console.error('getAllSections error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/sections/:id
 */
export const getSectionById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const section = await (prisma as any).customSection.findUnique({
      where: { id },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!section) {
      return res.status(404).json({ success: false, error: 'Section not found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...section,
        name: section.title,
        items: (section.items || []).map(formatSectionItem),
      },
    });
  } catch (error: any) {
    console.error('getSectionById error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/sections
 * Admin create new section (User prompt: in the section only name asked)
 */
export const createSection = async (req: Request, res: Response) => {
  try {
    const { name, title, subtitle, tag, order } = req.body;
    const finalTitle = (name || title || '').trim();

    if (!finalTitle) {
      return res.status(400).json({ success: false, error: 'Section name is required' });
    }

    const section = await (prisma as any).customSection.create({
      data: {
        title: finalTitle,
        subtitle: subtitle?.trim() || null,
        tag: tag?.trim() || null,
        order: typeof order === 'number' ? order : 0,
        isActive: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Section created successfully',
      data: { ...section, name: section.title },
    });
  } catch (error: any) {
    console.error('createSection error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/v1/sections/:id
 * Admin update section
 */
export const updateSection = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, title, subtitle, tag, order, isActive } = req.body;
    const finalTitle = name !== undefined ? name.trim() : (title !== undefined ? title.trim() : undefined);

    const updated = await (prisma as any).customSection.update({
      where: { id },
      data: {
        ...(finalTitle !== undefined && { title: finalTitle }),
        ...(subtitle !== undefined && { subtitle: subtitle.trim() }),
        ...(tag !== undefined && { tag: tag.trim() }),
        ...(order !== undefined && { order: Number(order) }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Section updated successfully',
      data: { ...updated, name: updated.title },
    });
  } catch (error: any) {
    console.error('updateSection error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * DELETE /api/v1/sections/:id
 * Admin delete section
 */
export const deleteSection = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await (prisma as any).customSection.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: 'Section and associated items deleted successfully',
    });
  } catch (error: any) {
    console.error('deleteSection error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// CATEGORY CONTROLLERS (Name + Image)
// ==========================================

/**
 * GET /api/v1/categories
 * Fetch all active categories with their items
 */
export const getAllCategories = async (req: Request, res: Response) => {
  try {
    const categories = await (prisma as any).customCategory.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
      include: {
        items: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    const formatted = categories.map((cat: any) => ({
      ...cat,
      items: (cat.items || []).map(formatSectionItem),
    }));

    return res.status(200).json({
      success: true,
      data: formatted,
    });
  } catch (error: any) {
    console.error('getAllCategories error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/categories/:id
 */
export const getCategoryById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const category = await (prisma as any).customCategory.findUnique({
      where: { id },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!category) {
      return res.status(404).json({ success: false, error: 'Category not found' });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...category,
        items: (category.items || []).map(formatSectionItem),
      },
    });
  } catch (error: any) {
    console.error('getCategoryById error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/categories
 * Admin create new category (User prompt: in the categories ask name and image)
 */
export const createCategory = async (req: Request, res: Response) => {
  try {
    const { name, image, tag, order } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Category name is required' });
    }

    if (!image || !image.trim()) {
      return res.status(400).json({ success: false, error: 'Category image is required' });
    }

    const category = await (prisma as any).customCategory.create({
      data: {
        name: name.trim(),
        image: image.trim(),
        tag: tag?.trim() || null,
        order: typeof order === 'number' ? order : 0,
        isActive: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Category created successfully',
      data: category,
    });
  } catch (error: any) {
    console.error('createCategory error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/v1/categories/:id
 */
export const updateCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, image, tag, order, isActive } = req.body;

    const updated = await (prisma as any).customCategory.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(image !== undefined && { image: image.trim() }),
        ...(tag !== undefined && { tag: tag.trim() }),
        ...(order !== undefined && { order: Number(order) }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Category updated successfully',
      data: updated,
    });
  } catch (error: any) {
    console.error('updateCategory error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * DELETE /api/v1/categories/:id
 */
export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await (prisma as any).customCategory.delete({
      where: { id },
    });

    return res.status(200).json({
      success: true,
      message: 'Category deleted successfully',
    });
  } catch (error: any) {
    console.error('deleteCategory error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// ITEM CONTROLLER (Title, Subtitle, Badge, Price, Description, Image, Features, Available Dates & Times)
// ==========================================

/**
 * GET /api/v1/sections/items/:itemId
 */
export const getSectionItemById = async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const targetItemId = String(itemId);
    const item = await (prisma as any).customSectionItem.findUnique({
      where: { id: targetItemId },
      include: {
        section: { select: { id: true, title: true, subtitle: true, tag: true } },
        category: { select: { id: true, name: true, image: true } },
      },
    });

    if (item && item.isActive) {
      return res.status(200).json({
        success: true,
        data: formatSectionItem(item),
      });
    }

    // Fallback 1: Check PartnerService
    const partnerService: any = await (prisma as any).partnerService.findUnique({
      where: { id: targetItemId },
      include: { partner: true },
    });

    if (partnerService && partnerService.isActive) {
      const formatted = {
        id: partnerService.id,
        title: partnerService.name,
        subtitle: partnerService.partner?.businessName || partnerService.subCategory || partnerService.category,
        badge: partnerService.category,
        cornerTag: partnerService.category,
        tag: partnerService.category,
        price: partnerService.pricing,
        priceUnit: partnerService.pricingUnit === 'PER_PLATE' ? 'per plate' : (partnerService.pricingUnit === 'PER_DAY' ? 'per day' : 'per booking'),
        itemType: 'BOOKING',
        location: partnerService.location || partnerService.city || 'Bihar, India',
        image: (partnerService.images && partnerService.images[0]) || '',
        images: partnerService.images || [],
        features: partnerService.features && partnerService.features.length > 0 ? partnerService.features : ['100% Verified Quality', 'Instant Digital Pass', 'Dedicated Coordination'],
        availableTimes: ['10:00 AM - 02:00 PM', '02:30 PM - 06:30 PM', '07:00 PM - 11:30 PM'],
        availableDates: [],
        capacity: partnerService.capacity || 100,
        tags: [
          partnerService.category,
          partnerService.category ? partnerService.category.replace(/_/g, ' ').toLowerCase() : '',
          partnerService.subCategory || '',
          partnerService.city || 'Verified',
          String(partnerService.category).includes('MANDAP') || String(partnerService.category).includes('VENUE') ? 'wedding' : '',
          String(partnerService.category).includes('CATERING') ? 'catering' : '',
          String(partnerService.category).includes('DJ') ? 'dj sound' : '',
          String(partnerService.category).includes('DECOR') ? 'decor' : '',
          String(partnerService.category).includes('PHOTO') ? 'photography' : '',
        ].filter(Boolean),
        description: partnerService.description,
        rating: partnerService.rating || 4.9,
        reviews: partnerService.totalBookings || 12,
        partnerId: partnerService.partnerId,
        isActive: true,
      };
      return res.status(200).json({
        success: true,
        data: formatted,
      });
    }

    // Fallback 2: Check Venue
    const venue: any = await (prisma as any).venue.findUnique({
      where: { id: targetItemId },
      include: { partner: true },
    });

    if (venue && venue.status !== 'INACTIVE') {
      const formatted = {
        id: venue.id,
        title: venue.name,
        subtitle: venue.partner?.businessName || venue.city,
        badge: 'Venue',
        cornerTag: 'Venue',
        tag: 'Venue',
        price: venue.price,
        priceUnit: 'per day',
        itemType: 'BOOKING',
        location: venue.city || 'Bihar, India',
        image: (venue.images && venue.images[0]) || '',
        images: venue.images || [],
        features: ['Air Conditioned', 'Power Backup', 'Parking Space', 'Dedicated Manager'],
        availableTimes: ['Full Day (09:00 AM - 11:00 PM)'],
        availableDates: [],
        capacity: 250,
        tags: ['Venue', 'wedding', 'banquet', 'palace', venue.city || 'Verified'],
        description: venue.description,
        rating: 4.9,
        reviews: 24,
        partnerId: venue.partnerId,
        isActive: true,
      };
      return res.status(200).json({
        success: true,
        data: formatted,
      });
    }

    return res.status(404).json({ success: false, error: 'Item not found or unavailable' });
  } catch (error: any) {
    console.error('getSectionItemById error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * POST /api/v1/sections/:sectionId/items or /api/v1/sections/items
 * Admin add item to section or category
 */
export const createSectionItem = async (req: Request, res: Response) => {
  try {
    const sectionId = req.params.sectionId || req.body.sectionId || null;
    const categoryId = req.params.categoryId || req.body.categoryId || null;

    const {
      title,
      subtitle,
      badge,
      tag,
      cornerTag,
      location,
      itemType = 'BOOKING',
      price,
      priceUnit = 'per booking',
      availableDates = [],
      availableTimes = [],
      features = [],
      totalSlots,
      capacity,
      image,
      tags = [],
      description,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Item title is required' });
    }

    const numPrice = parseFloat(price);
    if (isNaN(numPrice) || numPrice < 0) {
      return res.status(400).json({ success: false, error: 'A valid price is required' });
    }

    const finalBadge = String(badge || cornerTag || tag || subtitle || 'Featured').trim();

    // Parse features into an array of strings
    let featArr: string[] = [];
    if (Array.isArray(features)) {
      featArr = features.map(f => String(f).trim()).filter(Boolean);
    } else if (typeof features === 'string') {
      featArr = features.split(',').map(f => f.trim()).filter(Boolean);
    }

    // Parse times into array of strings
    let timeArr: string[] = [];
    if (Array.isArray(availableTimes)) {
      timeArr = availableTimes.map(t => String(t).trim()).filter(Boolean);
    } else if (typeof availableTimes === 'string') {
      timeArr = availableTimes.split(',').map(t => t.trim()).filter(Boolean);
    }

    // Parse dates into array of strings
    let dateArr: string[] = [];
    if (Array.isArray(availableDates)) {
      dateArr = availableDates.map(d => String(d).trim()).filter(Boolean);
    } else if (typeof availableDates === 'string') {
      dateArr = availableDates.split(',').map(d => d.trim()).filter(Boolean);
    }

    const calculatedSlots = Number(capacity) || Number(totalSlots) || 100;

    const isTicketItem = String(itemType).toUpperCase() === 'TICKET';

    // Parse tags into clean array
    let tagArr: string[] = [];
    if (Array.isArray(tags)) {
      tagArr = tags.map(t => String(t).trim()).filter(Boolean);
    } else if (typeof tags === 'string') {
      tagArr = tags.split(',').map(t => t.trim()).filter(Boolean);
    }
    if (tagArr.length === 0 && finalBadge) {
      tagArr = [finalBadge];
    }

    const item = await (prisma as any).customSectionItem.create({
      data: {
        sectionId: sectionId || undefined,
        categoryId: categoryId || undefined,
        title: title.trim(),
        subtitle: subtitle?.trim() || finalBadge || null,
        badge: finalBadge,
        location: location?.trim() || 'Pan-India',
        itemType: isTicketItem ? 'TICKET' : 'BOOKING',
        price: numPrice,
        priceUnit: priceUnit?.trim() || 'per booking',
        availableDates: isTicketItem ? dateArr : [],
        availableTimes: timeArr,
        features: featArr,
        totalSlots: calculatedSlots,
        bookedSlots: 0,
        rating: 4.9,
        reviews: 0,
        image: image?.trim() || 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
        tags: tagArr,
        description: description?.trim() || null,
        isActive: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Item added successfully',
      data: formatSectionItem(item),
    });
  } catch (error: any) {
    console.error('createSectionItem error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/v1/sections/items/:itemId
 */
export const updateSectionItem = async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const {
      title,
      subtitle,
      badge,
      location,
      itemType,
      price,
      priceUnit,
      availableDates,
      availableTimes,
      features,
      totalSlots,
      image,
      tags,
      description,
      isActive,
      sectionId,
      categoryId,
    } = req.body;

    const updateData: any = {};
    if (title !== undefined) updateData.title = title.trim();
    if (subtitle !== undefined) updateData.subtitle = subtitle.trim();
    if (badge !== undefined) updateData.badge = badge.trim();
    if (location !== undefined) updateData.location = location.trim();
    if (itemType !== undefined) updateData.itemType = String(itemType).toUpperCase() === 'TICKET' ? 'TICKET' : 'BOOKING';
    if (price !== undefined) updateData.price = parseFloat(price);
    if (priceUnit !== undefined) updateData.priceUnit = priceUnit.trim();
    if (image !== undefined) updateData.image = image.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (totalSlots !== undefined) updateData.totalSlots = Number(totalSlots);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);
    if (sectionId !== undefined) updateData.sectionId = sectionId || null;
    if (categoryId !== undefined) updateData.categoryId = categoryId || null;

    if (features !== undefined) {
      updateData.features = Array.isArray(features) ? features : String(features).split(',').map(s => s.trim()).filter(Boolean);
    }
    let isTicketType = updateData.itemType === 'TICKET';
    if (updateData.itemType === undefined && availableDates !== undefined) {
      const existing = await (prisma as any).customSectionItem.findUnique({
        where: { id: itemId },
        select: { itemType: true },
      });
      isTicketType = existing?.itemType === 'TICKET';
    }

    if (availableTimes !== undefined) {
      updateData.availableTimes = Array.isArray(availableTimes) ? availableTimes : String(availableTimes).split(',').map(s => s.trim()).filter(Boolean);
    }
    if (availableDates !== undefined) {
      updateData.availableDates = isTicketType
        ? (Array.isArray(availableDates) ? availableDates : String(availableDates).split(',').map(s => s.trim()).filter(Boolean))
        : [];
    } else if (updateData.itemType && !isTicketType) {
      updateData.availableDates = [];
    }
    if (tags !== undefined) {
      let tagArr: string[] = [];
      if (Array.isArray(tags)) {
        tagArr = tags.map(t => String(t).trim()).filter(Boolean);
      } else if (typeof tags === 'string') {
        tagArr = tags.split(',').map(t => t.trim()).filter(Boolean);
      }
      updateData.tags = tagArr.length > 0 ? tagArr : (badge ? [badge] : ['Featured']);
    }

    const updated = await (prisma as any).customSectionItem.update({
      where: { id: itemId },
      data: updateData,
    });

    return res.status(200).json({
      success: true,
      message: 'Item updated successfully',
      data: formatSectionItem(updated),
    });
  } catch (error: any) {
    console.error('updateSectionItem error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * DELETE /api/v1/sections/items/:itemId
 */
export const deleteSectionItem = async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    await (prisma as any).customSectionItem.delete({
      where: { id: itemId },
    });

    return res.status(200).json({
      success: true,
      message: 'Item removed successfully',
    });
  } catch (error: any) {
    console.error('deleteSectionItem error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// ITEM BOOKING CONTROLLER (USERS)
// ==========================================

/**
 * POST /api/v1/sections/items/:itemId/book
 * User books item with date, time, and details
 */
export const bookSectionItem = async (req: Request, res: Response) => {
  try {
    const { itemId } = req.params;
    const {
      bookingDate,
      bookingTime,
      quantity = 1,
      userName,
      userPhone,
      userEmail,
      notes,
    } = req.body;

    if (!userName || !userName.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    if (!userPhone || !userPhone.trim()) {
      return res.status(400).json({ success: false, error: 'Contact phone number is required' });
    }

    if (!bookingDate) {
      return res.status(400).json({ success: false, error: 'Please select a booking date' });
    }

    const cleanDate = String(bookingDate).trim();
    const numQty = Math.max(1, parseInt(quantity) || 1);
    const targetItemId = String(itemId);

    // 1. Try CustomSectionItem (Admin configured section item)
    const item = await (prisma as any).customSectionItem.findUnique({
      where: { id: targetItemId },
      include: { section: true, category: true },
    });

    if (item && item.isActive) {
      // Check if item is a ticket with specific dates configured; regular bookings have all dates available
      if (item.itemType === 'TICKET' && Array.isArray(item.availableDates) && item.availableDates.length > 0) {
        const isDateAvailable = item.availableDates.some((d: string) => String(d).trim() === cleanDate);
        if (!isDateAvailable) {
          return res.status(400).json({
            success: false,
            error: `The date ${cleanDate} is not available for this ticket pass. Available dates: ${item.availableDates.join(', ')}`,
          });
        }
      }

      // Check slot limits
      if (item.totalSlots && item.bookedSlots + numQty > item.totalSlots) {
        return res.status(400).json({
          success: false,
          error: `Only ${Math.max(0, item.totalSlots - item.bookedSlots)} spots/tickets remaining for this item`,
        });
      }

      const userId = (req as any).user?.id || null;
      const baseTotal = item.price * numQty;

      // Authentic wallet balance deduction if requested (strictly based on database balance)
      const requestedWalletDeduct = req.body.walletDiscount !== undefined || req.body.walletDeducted !== undefined
        ? Number(req.body.walletDiscount || req.body.walletDeducted)
        : (req.body.useWallet ? Infinity : 0);
      let actualWalletDeduction = 0;
      if (requestedWalletDeduct > 0 && userId) {
        const userProfile = await prisma.user.findUnique({
          where: { id: userId },
          select: { walletBalance: true },
        });
        if (userProfile && userProfile.walletBalance > 0) {
          actualWalletDeduction = Math.min(requestedWalletDeduct, userProfile.walletBalance, baseTotal);
          if (actualWalletDeduction > 0) {
            await prisma.user.update({
              where: { id: userId },
              data: { walletBalance: { decrement: actualWalletDeduction } },
            });
          }
        }
      }

      const totalAmount = Math.max(0, baseTotal - actualWalletDeduction);

      const prefix = item.itemType === 'TICKET' ? 'HL-TCK' : 'HL-BKG';
      const randPart = Math.floor(100000 + Math.random() * 900000);
      const ticketCode = `${prefix}-${Date.now().toString(36).toUpperCase()}-${randPart}`;

      const paymentConfirmed = totalAmount === 0;
      const bookingStatus = paymentConfirmed ? 'CONFIRMED' : 'PENDING';
      const paymentStatus = paymentConfirmed ? 'PAID' : 'PENDING';

      const booking = await (prisma as any).customSectionBooking.create({
        data: {
          itemId,
          userId,
          userName: userName.trim(),
          userPhone: userPhone.trim(),
          userEmail: userEmail?.trim() || null,
          bookingDate: cleanDate,
          bookingTime: bookingTime ? String(bookingTime).trim() : null,
          quantity: numQty,
          itemType: item.itemType,
          totalAmount,
          status: bookingStatus,
          ticketCode,
          paymentStatus,
          notes: actualWalletDeduction > 0 ? `Wallet discount applied: ₹${actualWalletDeduction}. ${notes?.trim() || ''}` : (notes?.trim() || null),
        },
        include: {
          item: {
            select: {
              title: true,
              location: true,
              image: true,
              price: true,
              itemType: true,
              badge: true,
            },
          },
        },
      });

      if (paymentConfirmed) {
        await (prisma as any).customSectionItem.update({
          where: { id: itemId },
          data: { bookedSlots: { increment: numQty } },
        });
      }

      // Notify User only when confirmed
      if (userId && paymentConfirmed) {
        prisma.notification.create({
          data: {
            title: `🎟️ ${item.itemType === 'TICKET' ? 'Ticket Pass' : 'Celebration Booking'} Confirmed!`,
            message: `Your booking for "${item.title}" on ${cleanDate} is confirmed. Pass Code: ${ticketCode}`,
            targetRole: 'USER',
            type: 'BOOKING',
          },
        }).then(async (notif: any) => {
          await prisma.userNotification.create({
            data: { userId, notificationId: notif.id, isRead: false },
          }).catch(() => {});
        }).catch(() => {});
      }

      // Notify Admin
      prisma.notification.create({
        data: {
          title: `📢 New ${item.itemType === 'TICKET' ? 'Ticket' : 'Booking'} - ${item.title}`,
          message: `${userName} (${userPhone}) booked ${numQty}x "${item.title}" for ${cleanDate}. Pass Code: ${ticketCode}. Total: ₹${totalAmount}`,
          targetRole: 'ADMIN',
          type: 'BOOKING',
        },
      }).catch(() => {});

      return res.status(201).json({
        success: true,
        message: `${item.itemType === 'TICKET' ? 'Ticket pass' : 'Booking'} created successfully!`,
        data: booking,
      });
    }

    // 2. Try PartnerService or Venue (Partner uploaded services)
    const [partnerService, venue]: [any, any] = await Promise.all([
      (prisma as any).partnerService.findUnique({ where: { id: targetItemId }, include: { partner: true } }),
      (prisma as any).venue.findUnique({ where: { id: targetItemId }, include: { partner: true } }),
    ]);

    const isPartnerActive = partnerService ? Boolean(partnerService.isActive) : false;
    const isVenueActive = venue ? venue.status !== 'INACTIVE' : false;

    if (!partnerService && !venue) {
      return res.status(404).json({ success: false, error: 'Item not found or currently unavailable' });
    }
    if (partnerService && !isPartnerActive) {
      return res.status(404).json({ success: false, error: 'Partner service is currently unavailable' });
    }
    if (venue && !isVenueActive) {
      return res.status(404).json({ success: false, error: 'Venue is currently unavailable' });
    }

    const partnerEntity = partnerService || venue;
    const isPartnerService = Boolean(partnerService);
    const partnerId = partnerEntity.partnerId;
    const unitPrice = isPartnerService ? partnerService.pricing : venue.price;
    const baseTotal = unitPrice * numQty;

    // Find or create user record so foreign key userId constraint is satisfied
    let targetUserId = (req as any).user?.id || null;
    if (!targetUserId) {
      let existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { phone: userPhone.trim() },
            ...(userEmail ? [{ email: userEmail.trim() }] : []),
          ],
        },
      });
      if (!existingUser) {
        const cleanPhone = userPhone.trim().replace(/\D/g, '');
        existingUser = await prisma.user.create({
          data: {
            name: userName.trim(),
            email: userEmail?.trim() || `customer_${cleanPhone || Date.now()}@happylokam.com`,
            phone: userPhone.trim(),
            passwordHash: 'GUEST_USER_SECURE',
            role: 'USER',
          },
        });
      }
      targetUserId = existingUser.id;
    }

    // Authentic wallet balance deduction if requested (strictly based on database balance)
    const requestedWalletDeduct = req.body.walletDiscount !== undefined || req.body.walletDeducted !== undefined
      ? Number(req.body.walletDiscount || req.body.walletDeducted)
      : (req.body.useWallet ? Infinity : 0);
    let actualWalletDeduction = 0;
    if (requestedWalletDeduct > 0 && targetUserId) {
      const userProfile = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { walletBalance: true },
      });
      if (userProfile && userProfile.walletBalance > 0) {
        actualWalletDeduction = Math.min(requestedWalletDeduct, userProfile.walletBalance, baseTotal);
        if (actualWalletDeduction > 0) {
          await prisma.user.update({
            where: { id: targetUserId },
            data: { walletBalance: { decrement: actualWalletDeduction } },
          });
        }
      }
    }

    const totalAmount = Math.max(0, baseTotal - actualWalletDeduction);

    const randPart = Math.floor(100000 + Math.random() * 900000);
    const ticketCode = `HL-BKG-${Date.now().toString(36).toUpperCase()}-${randPart}`;
    const paymentConfirmed = totalAmount === 0;
    const bookingStatus = paymentConfirmed ? 'CONFIRMED' : 'PENDING';
    const paymentStatus = paymentConfirmed ? 'PAID' : 'PENDING';

    let bookingDateObj: Date;
    try {
      bookingDateObj = new Date(cleanDate);
      if (isNaN(bookingDateObj.getTime())) {
        bookingDateObj = new Date();
      }
    } catch {
      bookingDateObj = new Date();
    }

    const booking = await prisma.booking.create({
      data: {
        userId: targetUserId,
        partnerId: partnerId,
        venueId: isPartnerService ? null : venue!.id,
        date: bookingDateObj,
        baseAmount: baseTotal,
        discountAmount: actualWalletDeduction,
        totalAmount: totalAmount,
        ticketId: ticketCode,
        referralCodeUsed: isPartnerService ? partnerService!.name : venue!.name,
        status: bookingStatus,
        paymentStatus: paymentStatus,
      },
      include: {
        venue: { select: { name: true, city: true, price: true } },
        user: { select: { name: true, email: true, phone: true } },
      },
    });

    // Notify Partner immediately so Partner App updates in real time
    try {
      const entityName = isPartnerService ? partnerService!.name : venue!.name;
      const notif = await prisma.notification.create({
        data: {
          title: `🎉 New Booking: ${entityName}`,
          message: `Booking received from ${userName.trim()} (${userPhone.trim()}) for ${cleanDate}. Total: ₹${totalAmount}`,
          targetRole: 'PARTNER',
          type: 'IN_APP',
        },
      });
      await prisma.partnerNotification.create({
        data: {
          partnerId: partnerId,
          notificationId: notif.id,
        },
      });
    } catch (notifErr) {
      console.warn('Partner notification error (non-fatal):', notifErr);
    }

    // Notify Admin
    prisma.notification.create({
      data: {
        title: `📢 Partner Service Booked: ${isPartnerService ? partnerService!.name : venue!.name}`,
        message: `${userName} (${userPhone}) booked ${numQty}x for ${cleanDate}. Pass Code: ${ticketCode}. Total: ₹${totalAmount}`,
        targetRole: 'ADMIN',
        type: 'BOOKING',
      },
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: paymentConfirmed ? 'Booking confirmed successfully!' : 'Booking created. Proceeding to payment.',
      data: {
        id: booking.id,
        ticketCode: ticketCode,
        status: bookingStatus,
        paymentStatus: paymentStatus,
        totalAmount: totalAmount,
        bookingDate: cleanDate,
        bookingTime: bookingTime || null,
        item: {
          title: isPartnerService ? partnerService!.name : venue!.name,
          location: isPartnerService ? partnerService!.city : venue!.city,
          image: isPartnerService ? ((partnerService!.images && partnerService!.images[0]) || '') : ((venue!.images && venue!.images[0]) || ''),
          price: unitPrice,
          itemType: 'BOOKING',
          badge: isPartnerService ? partnerService!.category : 'Venue',
        },
      },
    });
  } catch (error: any) {
    console.error('bookSectionItem error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/sections/bookings/my
 * User view their own bookings
 */
export const getMySectionBookings = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    const userPhone = (req as any).user?.phone;

    if (!userId && !userPhone) {
      return res.status(200).json({ success: true, data: [] });
    }

    const orClauses: any[] = [];
    if (userId) orClauses.push({ userId });
    if (userPhone) orClauses.push({ userPhone });

    const bookings = await (prisma as any).customSectionBooking.findMany({
      where: { OR: orClauses },
      orderBy: { createdAt: 'desc' },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            location: true,
            image: true,
            itemType: true,
            price: true,
            priceUnit: true,
            badge: true,
            section: { select: { title: true } },
            category: { select: { name: true } },
          },
        },
      },
    });

    return res.status(200).json({ success: true, data: bookings });
  } catch (error: any) {
    console.error('getMySectionBookings error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * GET /api/v1/sections/bookings/all
 * Admin view all section bookings
 */
export const getAllSectionBookings = async (req: Request, res: Response) => {
  try {
    const bookings = await (prisma as any).customSectionBooking.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        item: {
          select: {
            id: true,
            title: true,
            location: true,
            image: true,
            itemType: true,
            price: true,
            priceUnit: true,
            badge: true,
            section: { select: { title: true } },
            category: { select: { name: true } },
          },
        },
      },
    });

    return res.status(200).json({ success: true, data: bookings });
  } catch (error: any) {
    console.error('getAllSectionBookings error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/v1/sections/bookings/:id/status
 * Admin update booking status
 */
export const updateSectionBookingStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const updated = await (prisma as any).customSectionBooking.update({
      where: { id },
      data: { status },
    });

    return res.status(200).json({ success: true, data: updated });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

// ==========================================
// ADVANCE FILTERS & THEMES CMS (ADMIN & USER)
// ==========================================

export const DEFAULT_ADVANCE_FILTERS = [
  {
    id: 'filter_wed_themes',
    title: 'Wedding Themes & Mandaps',
    subtitle: 'Royal palaces, varmala stages & destination packages',
    tag: 'WEDDING',
    route: '/(tabs)/explore?category=Wedding Themes',
    category: 'Wedding Themes',
    keywords: ['wedding', 'mandap', 'varmala', 'palace', 'royal', 'stage', 'vivah'],
    icon: 'Crown',
    filterType: 'THEME',
    order: 1,
    isActive: true,
  },
  {
    id: 'filter_bday_themes',
    title: 'Birthday Themes & Fiesta',
    subtitle: 'Neon backdrops, DJ parties, magicians & cake setups',
    tag: 'BIRTHDAY',
    route: '/(tabs)/explore?category=Birthday Themes',
    category: 'Birthday Themes',
    keywords: ['birthday', 'party', 'neon', 'dj', 'balloon', 'kids'],
    icon: 'Cake',
    filterType: 'THEME',
    order: 2,
    isActive: true,
  },
  {
    id: 'filter_catering_56',
    title: 'Catering & 56-Bhog Feasts',
    subtitle: 'Pure Desi Ghee banquets, live chaat & mocktails',
    tag: 'CATERING',
    route: '/(tabs)/explore?category=Catering',
    category: 'Catering',
    keywords: ['catering', 'food', 'plate', 'buffet', 'ghee', 'veg', 'feast'],
    icon: 'Utensils',
    filterType: 'OCCASION',
    order: 3,
    isActive: true,
  },
  {
    id: 'filter_baby_shower',
    title: 'Baby Shower & Mom-to-Be',
    subtitle: 'Pastel balloon arches, high tea & cradle setups',
    tag: 'BABY',
    route: '/(tabs)/explore?category=Baby Shower',
    category: 'Baby Shower',
    keywords: ['baby', 'cradle', 'shower', 'balloon', 'pastel'],
    icon: 'Gift',
    filterType: 'OCCASION',
    order: 4,
    isActive: true,
  },
  {
    id: 'filter_roka_engage',
    title: 'Engagements & Roka Setups',
    subtitle: 'Ring ceremony stages, acoustic music & fairy lights',
    tag: 'ROKA',
    route: '/(tabs)/explore?category=Engagements',
    category: 'Engagements',
    keywords: ['engagement', 'roka', 'ring', 'sangeet', 'ceremony'],
    icon: 'Sparkles',
    filterType: 'OCCASION',
    order: 5,
    isActive: true,
  },
  {
    id: 'filter_mandap_decor',
    title: 'Mandap & Haldi Decor',
    subtitle: 'Haldi bohemian, fairy forest lights & fresh florals',
    tag: 'DECOR',
    route: '/(tabs)/explore?category=Decor',
    category: 'Decor',
    keywords: ['decor', 'haldi', 'mandap', 'floral', 'flower', 'lights'],
    icon: 'Palette',
    filterType: 'THEME',
    order: 6,
    isActive: true,
  },
  {
    id: 'filter_budget_friendly',
    title: 'Budget Under ₹30,000',
    subtitle: 'Affordable verified packages with 100% quality assurance',
    tag: 'BUDGET',
    route: '/(tabs)/explore?priceRange=under_30k',
    category: 'All',
    keywords: ['budget', 'affordable', 'value', 'pocket'],
    icon: 'Tag',
    filterType: 'BUDGET',
    order: 7,
    isActive: true,
  },
  {
    id: 'filter_large_capacity',
    title: 'Grand Capacity (500+ Guests)',
    subtitle: 'Spacious AC halls, sprawling lawns & massive valet parking',
    tag: 'GRAND',
    route: '/(tabs)/explore?capacity=500_plus',
    category: 'Venues',
    keywords: ['capacity', 'grand', '500', 'spacious', 'lawn'],
    icon: 'Layers',
    filterType: 'CAPACITY',
    order: 8,
    isActive: true,
  },
];

/**
 * GET /api/v1/sections/filters
 * Fetch all advance celebration filters & themes
 */
export const getAllAdvanceFilters = async (req: Request, res: Response) => {
  try {
    const raw = await prisma.announcement.findMany({
      where: { targetAudience: 'ADV_FILTER' },
      orderBy: { createdAt: 'desc' },
    });

    if (!raw || raw.length === 0) {
      return res.status(200).json({ success: true, data: DEFAULT_ADVANCE_FILTERS });
    }

    const customFilters = raw.map((item) => {
      let meta: any = {};
      try {
        meta = JSON.parse(item.message);
      } catch {
        meta = {};
      }
      return {
        id: item.id,
        title: item.title,
        subtitle: meta.subtitle || '',
        tag: meta.tag || item.priority || 'FEATURED',
        route: meta.route || `/(tabs)/explore?category=${encodeURIComponent(item.title)}`,
        category: meta.category || item.title,
        keywords: Array.isArray(meta.keywords) ? meta.keywords : (meta.keywords ? String(meta.keywords).split(',').map((s: string) => s.trim()) : [item.title.toLowerCase()]),
        icon: meta.icon || 'Sparkles',
        filterType: item.priority || meta.filterType || 'THEME',
        order: meta.order || 0,
        isActive: item.isActive,
        createdAt: item.createdAt,
      };
    });

    return res.status(200).json({ success: true, data: customFilters });
  } catch (error: any) {
    console.error('getAllAdvanceFilters error:', error);
    return res.status(200).json({ success: true, data: DEFAULT_ADVANCE_FILTERS });
  }
};

/**
 * POST /api/v1/sections/filters
 * Admin create new advance filter / theme
 */
export const createAdvanceFilter = async (req: Request, res: Response) => {
  try {
    const { title, subtitle, tag, route, category, keywords, icon, filterType = 'THEME', order = 0 } = req.body;
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: 'Filter title is required' });
    }

    const payload = {
      subtitle: subtitle?.trim() || '',
      tag: (tag || 'FEATURED').trim().toUpperCase(),
      route: route?.trim() || `/(tabs)/explore?category=${encodeURIComponent(title.trim())}`,
      category: category?.trim() || title.trim(),
      keywords: Array.isArray(keywords) ? keywords : String(keywords || '').split(',').map((k: string) => k.trim()).filter(Boolean),
      icon: icon?.trim() || 'Sparkles',
      filterType: filterType?.trim() || 'THEME',
      order: typeof order === 'number' ? order : 0,
    };

    const created = await prisma.announcement.create({
      data: {
        title: title.trim(),
        message: JSON.stringify(payload),
        targetAudience: 'ADV_FILTER',
        priority: payload.filterType,
        isActive: true,
      },
    });

    return res.status(201).json({
      success: true,
      message: 'Advance filter created successfully',
      data: {
        id: created.id,
        title: created.title,
        ...payload,
        isActive: created.isActive,
      },
    });
  } catch (error: any) {
    console.error('createAdvanceFilter error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * PUT /api/v1/sections/filters/:id
 * Admin update advance filter
 */
export const updateAdvanceFilter = async (req: Request, res: Response) => {
  try {
    const filterId = String(req.params.id);
    const { title, subtitle, tag, route, category, keywords, icon, filterType, isActive, order } = req.body;

    const existing = await prisma.announcement.findUnique({ where: { id: filterId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Filter not found' });
    }

    let currentMeta: any = {};
    try {
      currentMeta = JSON.parse(existing.message);
    } catch {}

    const payload = {
      subtitle: subtitle !== undefined ? subtitle.trim() : currentMeta.subtitle,
      tag: tag !== undefined ? tag.trim().toUpperCase() : currentMeta.tag,
      route: route !== undefined ? route.trim() : currentMeta.route,
      category: category !== undefined ? category.trim() : currentMeta.category,
      keywords: keywords !== undefined ? (Array.isArray(keywords) ? keywords : String(keywords).split(',').map((k: string) => k.trim())) : currentMeta.keywords,
      icon: icon !== undefined ? icon.trim() : currentMeta.icon,
      filterType: filterType !== undefined ? filterType.trim() : (existing.priority || 'THEME'),
      order: order !== undefined ? Number(order) : (currentMeta.order || 0),
    };

    const updated = await prisma.announcement.update({
      where: { id: filterId },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        message: JSON.stringify(payload),
        ...(filterType !== undefined && { priority: payload.filterType }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Advance filter updated successfully',
      data: {
        id: updated.id,
        title: updated.title,
        ...payload,
        isActive: updated.isActive,
      },
    });
  } catch (error: any) {
    console.error('updateAdvanceFilter error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * DELETE /api/v1/sections/filters/:id
 * Admin delete advance filter
 */
export const deleteAdvanceFilter = async (req: Request, res: Response) => {
  try {
    const filterId = String(req.params.id);
    await prisma.announcement.delete({ where: { id: filterId } });
    return res.status(200).json({ success: true, message: 'Filter deleted successfully' });
  } catch (error: any) {
    console.error('deleteAdvanceFilter error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};
