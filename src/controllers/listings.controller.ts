import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Helper to normalize Venue and PartnerService into a unified Listing shape
function formatListing(item: any, type: 'VENUE' | 'SERVICE') {
  return {
    id: item.id,
    title: item.name,
    name: item.name,
    type,
    category: type === 'VENUE' ? 'VENUE' : (item.category || 'SERVICE'),
    subCategory: item.subCategory || null,
    description: item.description || '',
    city: item.city || item.location || 'Patna',
    location: item.location || item.city || '',
    price: typeof item.price === 'number' ? item.price : (item.pricing || 0),
    pricing: typeof item.price === 'number' ? item.price : (item.pricing || 0),
    pricingUnit: item.pricingUnit || 'PER_EVENT',
    capacity: item.capacity || null,
    images: Array.isArray(item.images) && item.images.length > 0 ? item.images : ['/og-image.jpg'],
    features: Array.isArray(item.features) ? item.features : [],
    status: item.status || 'Active',
    rating: item.rating || 4.9,
    totalBookings: item.totalBookings || 0,
    partnerId: item.partnerId,
    partner: item.partner ? {
      id: item.partner.id,
      hlpId: item.partner.hlpId,
      name: item.partner.name,
      businessName: item.partner.businessName,
      phone: item.partner.phone,
      isVerified: item.partner.isVerified,
      status: item.partner.status,
    } : null,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt || item.createdAt,
  };
}

export const createVenue = async (req: Request, res: Response) => {
  try {
    const { name, description, city, location, price, pricing, images, category, subCategory, capacity, features } = req.body;
    
    // Only PARTNER or ADMIN can create listings
    if (req.user!.role !== 'PARTNER' && req.user!.role !== 'SUPER_ADMIN' && req.user!.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Unauthorized to create listings' });
    }
    
    const partnerId = req.user!.role === 'PARTNER' ? req.user!.id : req.body.partnerId;
    
    if (!partnerId) {
      return res.status(400).json({ success: false, error: 'Partner ID is required' });
    }

    if (!name) {
      return res.status(400).json({ success: false, error: 'Listing name is required' });
    }

    const numericPrice = parseFloat(price || pricing || '0');

    // If category is explicitly a service (like CATERING, DJ, etc.) create PartnerService
    if (category && category !== 'VENUE') {
      const newService = await prisma.partnerService.create({
        data: {
          partnerId,
          name: String(name).trim(),
          description: description ? String(description).trim() : '',
          category: String(category).trim().toUpperCase(),
          subCategory: subCategory ? String(subCategory).trim() : null,
          pricing: numericPrice,
          pricingUnit: req.body.pricingUnit || 'PER_EVENT',
          capacity: capacity ? parseInt(capacity) : null,
          location: location || city || 'Patna',
          city: city || location || 'Patna',
          images: Array.isArray(images) && images.length > 0 ? images : ['/og-image.jpg'],
          features: Array.isArray(features) ? features : [],
          status: 'APPROVED',
          isActive: true
        },
        include: { partner: true }
      });
      return res.status(201).json({ success: true, data: formatListing(newService, 'SERVICE') });
    }

    // Default to Venue
    const newVenue = await prisma.venue.create({
      data: {
        partnerId,
        name: String(name).trim(),
        description: description ? String(description).trim() : '',
        city: city || location || 'Patna',
        price: numericPrice,
        images: Array.isArray(images) && images.length > 0 ? images : ['/og-image.jpg'],
        status: 'Active'
      },
      include: { partner: true }
    });

    res.status(201).json({ success: true, data: formatListing(newVenue, 'VENUE') });
  } catch (error: any) {
    console.error('Create listing error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getVenues = async (req: Request, res: Response) => {
  try {
    const { city, partnerId, category, search, q } = req.query;
    const searchQuery = String(search || q || '').trim();

    // 1. Partner filter: If requesting for a specific partner
    if (partnerId) {
      const [venues, services] = await Promise.all([
        prisma.venue.findMany({
          where: { partnerId: String(partnerId) },
          include: { partner: { select: { id: true, hlpId: true, name: true, businessName: true, phone: true, isVerified: true, status: true } } },
          orderBy: { createdAt: 'desc' }
        }),
        prisma.partnerService.findMany({
          where: { partnerId: String(partnerId) },
          include: { partner: { select: { id: true, hlpId: true, name: true, businessName: true, phone: true, isVerified: true, status: true } } },
          orderBy: { createdAt: 'desc' }
        })
      ]);

      const formattedVenues = venues.map(v => formatListing(v, 'VENUE'));
      const formattedServices = services.map(s => formatListing(s, 'SERVICE'));
      const all = [...formattedVenues, ...formattedServices];
      return res.status(200).json({ success: true, data: all, listings: all });
    }

    // 2. Public query with filters
    const venueFilter: any = { status: 'Active' };
    const serviceFilter: any = { isActive: true, status: 'APPROVED' };

    if (city && city !== 'All') {
      venueFilter.city = { contains: String(city), mode: 'insensitive' };
      serviceFilter.city = { contains: String(city), mode: 'insensitive' };
    }

    if (searchQuery) {
      venueFilter.OR = [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { description: { contains: searchQuery, mode: 'insensitive' } },
        { city: { contains: searchQuery, mode: 'insensitive' } }
      ];
      serviceFilter.OR = [
        { name: { contains: searchQuery, mode: 'insensitive' } },
        { description: { contains: searchQuery, mode: 'insensitive' } },
        { city: { contains: searchQuery, mode: 'insensitive' } }
      ];
    }

    const [venues, services] = await Promise.all([
      (!category || category === 'VENUE' || category === 'ALL') ? prisma.venue.findMany({
        where: venueFilter,
        include: { partner: { select: { id: true, hlpId: true, name: true, businessName: true, phone: true, isVerified: true, status: true } } },
        orderBy: { createdAt: 'desc' }
      }) : Promise.resolve([]),
      (!category || category !== 'VENUE') ? prisma.partnerService.findMany({
        where: {
          ...serviceFilter,
          ...(category && category !== 'ALL' ? { category: String(category).toUpperCase() } : {})
        },
        include: { partner: { select: { id: true, hlpId: true, name: true, businessName: true, phone: true, isVerified: true, status: true } } },
        orderBy: { createdAt: 'desc' }
      }) : Promise.resolve([])
    ]);

    const formattedVenues = venues.map(v => formatListing(v, 'VENUE'));
    const formattedServices = services.map(s => formatListing(s, 'SERVICE'));
    const all = [...formattedVenues, ...formattedServices];

    res.status(200).json({ success: true, data: all, listings: all });
  } catch (error: any) {
    console.error('getVenues error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};

export const getVenueById = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    // Try finding in Venue table first
    const venue = await prisma.venue.findFirst({
      where: {
        OR: [
          { id },
          { name: { equals: id.replace(/-/g, ' '), mode: 'insensitive' } }
        ]
      },
      include: {
        partner: {
          select: { id: true, hlpId: true, name: true, businessName: true, phone: true, isVerified: true, status: true }
        }
      }
    });

    if (venue) {
      const formatted = formatListing(venue, 'VENUE');
      return res.status(200).json({ success: true, data: formatted, listing: formatted });
    }

    // Try finding in PartnerService table
    const service = await prisma.partnerService.findFirst({
      where: {
        OR: [
          { id },
          { name: { equals: id.replace(/-/g, ' '), mode: 'insensitive' } }
        ]
      },
      include: {
        partner: {
          select: { id: true, hlpId: true, name: true, businessName: true, phone: true, isVerified: true, status: true }
        }
      }
    });

    if (service) {
      const formatted = formatListing(service, 'SERVICE');
      return res.status(200).json({ success: true, data: formatted, listing: formatted });
    }

    return res.status(404).json({ success: false, error: 'Listing not found.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const updateVenue = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);
    const data: any = { ...req.body };
    delete data.id;
    delete data.createdAt;
    delete data.updatedAt;
    delete data.partner;

    // Check if it's a venue
    const venue = await prisma.venue.findUnique({ where: { id } });
    if (venue) {
      if (req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN' && req.user!.id !== venue.partnerId) {
        return res.status(403).json({ success: false, error: 'Unauthorized to update this venue' });
      }

      if (data.price !== undefined) data.price = parseFloat(data.price) || 0;
      const updated = await prisma.venue.update({
        where: { id },
        data,
        include: { partner: true }
      });
      return res.status(200).json({ success: true, data: formatListing(updated, 'VENUE') });
    }

    // Check if it's a partner service
    const service = await prisma.partnerService.findUnique({ where: { id } });
    if (service) {
      if (req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN' && req.user!.id !== service.partnerId) {
        return res.status(403).json({ success: false, error: 'Unauthorized to update this service' });
      }

      if (data.pricing !== undefined) data.pricing = parseFloat(data.pricing) || 0;
      if (data.price !== undefined) data.pricing = parseFloat(data.price) || 0;
      delete data.price;

      const updated = await prisma.partnerService.update({
        where: { id },
        data,
        include: { partner: true }
      });
      return res.status(200).json({ success: true, data: formatListing(updated, 'SERVICE') });
    }

    return res.status(404).json({ success: false, error: 'Listing not found.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const deleteVenue = async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id);

    const venue = await prisma.venue.findUnique({ where: { id } });
    if (venue) {
      if (req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN' && req.user!.id !== venue.partnerId) {
        return res.status(403).json({ success: false, error: 'Unauthorized to delete this venue' });
      }

      // Cleanup associated bookings
      const bookings = await prisma.booking.findMany({ where: { venueId: id }, select: { id: true } });
      const bookingIds = bookings.map(b => b.id);
      if (bookingIds.length > 0) {
        await prisma.bookingEvent.deleteMany({ where: { bookingId: { in: bookingIds } } }).catch(() => {});
        await prisma.payment.deleteMany({ where: { bookingId: { in: bookingIds } } }).catch(() => {});
        await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } }).catch(() => {});
      }

      await prisma.venue.delete({ where: { id } });
      return res.status(200).json({ success: true, message: 'Venue deleted successfully.' });
    }

    const service = await prisma.partnerService.findUnique({ where: { id } });
    if (service) {
      if (req.user!.role !== 'ADMIN' && req.user!.role !== 'SUPER_ADMIN' && req.user!.id !== service.partnerId) {
        return res.status(403).json({ success: false, error: 'Unauthorized to delete this service' });
      }

      await prisma.partnerService.delete({ where: { id } });
      return res.status(200).json({ success: true, message: 'Service deleted successfully.' });
    }

    return res.status(404).json({ success: false, error: 'Listing not found.' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};

export const searchListings = async (req: Request, res: Response) => {
  try {
    const query = String(req.query.q || req.query.query || '').trim();
    const city = String(req.query.city || '').trim();
    const category = String(req.query.category || '').trim();

    const venueFilter: any = { status: 'Active' };
    const serviceFilter: any = { isActive: true, status: 'APPROVED' };

    if (city && city !== 'All') {
      venueFilter.city = { contains: city, mode: 'insensitive' };
      serviceFilter.city = { contains: city, mode: 'insensitive' };
    }

    if (query) {
      venueFilter.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { city: { contains: query, mode: 'insensitive' } }
      ];
      serviceFilter.OR = [
        { name: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { city: { contains: query, mode: 'insensitive' } }
      ];
    }

    const [venues, services] = await Promise.all([
      (!category || category === 'VENUE' || category === 'ALL') ? prisma.venue.findMany({
        where: venueFilter,
        include: { partner: { select: { id: true, name: true, businessName: true, isVerified: true } } },
        take: 50
      }) : Promise.resolve([]),
      (!category || category !== 'VENUE') ? prisma.partnerService.findMany({
        where: {
          ...serviceFilter,
          ...(category && category !== 'ALL' ? { category: category.toUpperCase() } : {})
        },
        include: { partner: { select: { id: true, name: true, businessName: true, isVerified: true } } },
        take: 50
      }) : Promise.resolve([])
    ]);

    const results = [
      ...venues.map(v => formatListing(v, 'VENUE')),
      ...services.map(s => formatListing(s, 'SERVICE'))
    ];

    const cities = Array.from(new Set(results.map(r => r.city).filter(Boolean)));
    const categories = Array.from(new Set(results.map(r => r.category).filter(Boolean)));

    res.status(200).json({
      success: true,
      data: {
        results,
        facets: { cities, categories },
        total: results.length
      },
      results
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
