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
    const item = await (prisma as any).customSectionItem.findUnique({
      where: { id: itemId },
      include: {
        section: { select: { id: true, title: true, subtitle: true, tag: true } },
        category: { select: { id: true, name: true, image: true } },
      },
    });

    if (!item || !item.isActive) {
      return res.status(404).json({ success: false, error: 'Item not found or unavailable' });
    }

    return res.status(200).json({
      success: true,
      data: formatSectionItem(item),
    });
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

    const item = await (prisma as any).customSectionItem.create({
      data: {
        sectionId: sectionId || undefined,
        categoryId: categoryId || undefined,
        title: title.trim(),
        subtitle: subtitle?.trim() || finalBadge || null,
        badge: finalBadge,
        location: location?.trim() || 'Pan-India',
        itemType: String(itemType).toUpperCase() === 'TICKET' ? 'TICKET' : 'BOOKING',
        price: numPrice,
        priceUnit: priceUnit?.trim() || 'per booking',
        availableDates: dateArr,
        availableTimes: timeArr,
        features: featArr,
        totalSlots: calculatedSlots,
        bookedSlots: 0,
        rating: 4.9,
        reviews: 0,
        image: image?.trim() || 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=800&q=80',
        tags: Array.isArray(tags) ? tags : [finalBadge],
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
    if (availableTimes !== undefined) {
      updateData.availableTimes = Array.isArray(availableTimes) ? availableTimes : String(availableTimes).split(',').map(s => s.trim()).filter(Boolean);
    }
    if (availableDates !== undefined) {
      updateData.availableDates = Array.isArray(availableDates) ? availableDates : String(availableDates).split(',').map(s => s.trim()).filter(Boolean);
    }
    if (tags !== undefined) {
      updateData.tags = Array.isArray(tags) ? tags : [badge || 'Featured'];
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

    const item = await (prisma as any).customSectionItem.findUnique({
      where: { id: itemId },
      include: { section: true, category: true },
    });

    if (!item || !item.isActive) {
      return res.status(404).json({ success: false, error: 'Item not found or currently unavailable' });
    }

    if (!bookingDate) {
      return res.status(400).json({ success: false, error: 'Please select a booking date' });
    }

    const cleanDate = String(bookingDate).trim();

    // Check if item has specific available dates configured and ensure requested date is permitted
    if (Array.isArray(item.availableDates) && item.availableDates.length > 0) {
      const isDateAvailable = item.availableDates.some((d: string) => String(d).trim() === cleanDate);
      if (!isDateAvailable) {
        return res.status(400).json({
          success: false,
          error: `The date ${cleanDate} is not available for this package. Available dates: ${item.availableDates.join(', ')}`,
        });
      }
    }

    // For non-ticket reservation bookings, check if date is already booked
    if (item.itemType !== 'TICKET') {
      const existingDateBooking = await (prisma as any).customSectionBooking.findFirst({
        where: {
          itemId,
          bookingDate: cleanDate,
          status: { in: ['CONFIRMED', 'PENDING'] },
        },
      });
      if (existingDateBooking) {
        return res.status(400).json({
          success: false,
          error: `This service is already booked or reserved on ${cleanDate}. Please select another available date.`,
        });
      }
    }

    if (!userName || !userName.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }

    if (!userPhone || !userPhone.trim()) {
      return res.status(400).json({ success: false, error: 'Contact phone number is required' });
    }

    const numQty = Math.max(1, parseInt(quantity) || 1);

    if (item.totalSlots && item.bookedSlots + numQty > item.totalSlots) {
      return res.status(400).json({
        success: false,
        error: `Only ${Math.max(0, item.totalSlots - item.bookedSlots)} spots/tickets remaining for this item`,
      });
    }

    const userId = (req as any).user?.id || null;
    const baseTotal = item.price * numQty;

    // Handle authenticated user wallet deduction if requested
    const requestedWalletDeduct = Number(req.body.walletDiscount || req.body.walletDeducted || (req.body.useWallet ? 500 : 0));
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

    // Strictly require gateway payment verification for paid items: only free items confirm immediately
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
        bookingDate: String(bookingDate).trim(),
        bookingTime: bookingTime ? String(bookingTime).trim() : null,
        quantity: numQty,
        itemType: item.itemType,
        totalAmount,
        status: bookingStatus,
        ticketCode,
        paymentStatus,
        notes: notes?.trim() || null,
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

    // Increment booked slots only when payment is confirmed or item is free
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
          message: `Your booking for "${item.title}" on ${bookingDate} is confirmed. Pass Code: ${ticketCode}`,
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
        message: `${userName} (${userPhone}) booked ${numQty}x "${item.title}" for ${bookingDate}. Pass Code: ${ticketCode}. Total: ₹${totalAmount}`,
        targetRole: 'ADMIN',
        type: 'BOOKING',
      },
    }).catch(() => {});

    return res.status(201).json({
      success: true,
      message: `${item.itemType === 'TICKET' ? 'Ticket pass' : 'Booking'} confirmed successfully!`,
      data: booking,
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
