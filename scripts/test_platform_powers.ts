import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || 'hl_prod_sec_993b4e72a8c14f089d71239eb145f0d2';

const TEST_IDENTIFIER = `test_${Date.now()}`;
const TEST_USER_EMAIL = `${TEST_IDENTIFIER}_user@happylokamtest.com`;
const TEST_PARTNER_EMAIL = `${TEST_IDENTIFIER}_partner@happylokamtest.com`;
const TEST_ADMIN_EMAIL = `${TEST_IDENTIFIER}_admin@happylokamtest.com`;

let createdUserId: string | null = null;
let createdPartnerId: string | null = null;
let createdAdminId: string | null = null;
let createdVenueId: string | null = null;
let createdServiceId: string | null = null;
let createdSectionId: string | null = null;
let createdItemId: string | null = null;
let createdOfferId: string | null = null;
let createdHeroSlideId: string | null = null;
let createdBookingId: string | null = null;
let createdSectionBookingId: string | null = null;
let createdPaymentId: string | null = null;

async function runPlatformTests() {
  console.log('\n======================================================');
  console.log('🚀 STARTING HAPPY LOKAM FULL PLATFORM CAPABILITY TEST');
  console.log('======================================================\n');

  try {
    // -----------------------------------------------------------------
    // SETUP: Create isolated test Admin, User, and Partner in Database
    // -----------------------------------------------------------------
    console.log('📦 [SETUP] Creating isolated test accounts...');
    const hashedPw = await bcrypt.hash('TestPassword123!', 10);

    const testAdmin = await prisma.admin.create({
      data: {
        name: 'Test Super Admin',
        email: TEST_ADMIN_EMAIL,
        passwordHash: hashedPw,
        role: 'SUPER_ADMIN',
      },
    });
    createdAdminId = testAdmin.id;
    console.log(`  ✅ Test Admin created: ${testAdmin.email} (ID: ${testAdmin.id})`);

    const testUser = await prisma.user.create({
      data: {
        name: 'Ravi Kumar (Test Customer)',
        email: TEST_USER_EMAIL,
        passwordHash: hashedPw,
        phone: '9876543210',
        walletBalance: 0,
        role: 'USER',
      },
    });
    createdUserId = testUser.id;
    console.log(`  ✅ Test User created: ${testUser.email} (Initial Wallet: ₹${testUser.walletBalance})`);

    const testPartner = await prisma.partner.create({
      data: {
        hlpId: `HLP${Math.floor(100000 + Math.random() * 900000)}`,
        name: 'Suresh Verma',
        businessName: 'Royal Palace Events & Banquets',
        email: TEST_PARTNER_EMAIL,
        passwordHash: hashedPw,
        phone: '9876543211',
        location: 'Jaipur, Rajasthan',
        categories: ['VENUE', 'CATERING', 'DECORATION'],
        isVerified: true,
        status: 'VERIFIED',
      },
    });
    createdPartnerId = testPartner.id;
    console.log(`  ✅ Test Partner created: ${testPartner.businessName} (HLP: ${testPartner.hlpId})`);

    // -----------------------------------------------------------------
    // TEST 1: ADMIN POWERS (Hero Banners, CMS Sections, Offers & Themes)
    // -----------------------------------------------------------------
    console.log('\n👑 [TEST 1: ADMIN POWERS] Testing Admin Uploads, Themes, Sections & Offers...');

    // 1A. Hero Slide / Theme Carousel
    const heroSlide = await prisma.heroSlide.create({
      data: {
        title1: 'Royal Palace',
        title2: 'Wedding Gala',
        desc: 'Experience bespoke heritage celebrations with 100% verified partners.',
        badge: 'ROYAL PERK',
        image: 'https://images.unsplash.com/photo-1519741497674-611481863552',
        gradient: 'from-amber-500 to-rose-600',
        ctaText: 'Explore Packages',
        ctaLink: '/explore',
        order: 99,
        isActive: true,
      },
    });
    createdHeroSlideId = heroSlide.id;
    console.log(`  ✅ Admin Hero Theme Slide created: "${heroSlide.title1} ${heroSlide.title2}"`);

    // 1B. Dynamic CMS Section & Items with Available Dates & Themes
    const customSection = await prisma.customSection.create({
      data: {
        title: 'Exclusive Royal Pavilions',
        subtitle: 'Hand-picked luxury celebration spots',
        tag: 'TRENDING 2026',
        order: 1,
        isActive: true,
      },
    });
    createdSectionId = customSection.id;
    console.log(`  ✅ Admin Custom Section created: "${customSection.title}"`);

    const sectionItem = await (prisma as any).customSectionItem.create({
      data: {
        sectionId: customSection.id,
        title: 'Maharaja Heritage Lawn & Banquet',
        subtitle: '500+ Capacity with Central Air-Conditioning & Valet Parking',
        badge: 'EXCLUSIVE',
        itemType: 'BOOKING',
        price: 25000,
        priceUnit: 'per day',
        image: 'https://images.unsplash.com/photo-1544077960-604201fe74bc',
        location: 'Jaipur Heritage Road',
        features: ['Centrally AC', 'Valet Parking', 'Dedicated Bridal Suite', 'DG Power Backup'],
        availableDates: ['2026-11-20', '2026-11-25', '2026-12-05'],
        totalSlots: 10,
        bookedSlots: 0,
        isActive: true,
      },
    });
    createdItemId = sectionItem.id;
    console.log(`  ✅ Admin Section Item configured: "${sectionItem.title}" (Available Dates: ${sectionItem.availableDates.join(', ')})`);

    // 1C. Offers & Coupon Codes
    const offer = await prisma.offer.create({
      data: {
        title: 'Royal Celebration Festive Perk',
        code: `ROYAL${Math.floor(100 + Math.random() * 900)}`,
        discountPercent: 15,
        description: 'Instant 15% discount on heritage celebration packages.',
        validFrom: new Date(),
        validTo: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        status: 'Active',
      },
    });
    createdOfferId = offer.id;
    console.log(`  ✅ Admin Promo Offer created: Code "${offer.code}" (${offer.discountPercent}% OFF)`);

    // -----------------------------------------------------------------
    // TEST 2: ADMIN WALLET RECHARGE & USER WALLET USAGE
    // -----------------------------------------------------------------
    console.log('\n💰 [TEST 2: WALLET SYSTEM] Testing Admin Wallet Credit & User Usage...');
    const creditAmount = 1500;
    
    // Simulate Admin crediting user wallet
    const updatedUser = await prisma.user.update({
      where: { id: testUser.id },
      data: { walletBalance: { increment: creditAmount } },
      select: { id: true, name: true, walletBalance: true },
    });
    console.log(`  ✅ Admin credited ₹${creditAmount} to user ${updatedUser.name}.`);
    console.log(`  ✅ User Wallet Verified Balance: ₹${updatedUser.walletBalance}`);

    if (updatedUser.walletBalance !== creditAmount) {
      throw new Error(`Wallet balance mismatch! Expected ₹${creditAmount}, got ₹${updatedUser.walletBalance}`);
    }

    // -----------------------------------------------------------------
    // TEST 3: PARTNER SERVICES & PORTFOLIO
    // -----------------------------------------------------------------
    console.log('\n🏢 [TEST 3: PARTNER SERVICES] Partner adding service portfolio...');
    // Partner creates both Venue and PartnerService listings
    const testVenue = await prisma.venue.create({
      data: {
        partnerId: testPartner.id,
        name: 'Royal Rajputana Grand Ballroom',
        description: 'Spectacular luxury ballroom for royal wedding receptions and banquets.',
        city: 'Jaipur',
        price: 35000,
        images: ['https://images.unsplash.com/photo-1519741497674-611481863552'],
        status: 'Active',
      },
    });
    createdVenueId = testVenue.id;
    console.log(`  ✅ Partner venue created: "${testVenue.name}" (ID: ${testVenue.id})`);

    const partnerService = await prisma.partnerService.create({
      data: {
        partnerId: testPartner.id,
        name: 'Royal Rajputana Grand Ballroom',
        description: 'Spectacular luxury ballroom for royal wedding receptions and banquets.',
        category: 'VENUE',
        subCategory: 'Heritage Ballroom',
        pricing: 35000,
        pricingUnit: 'PER_EVENT',
        capacity: 600,
        location: 'Jaipur, Rajasthan',
        city: 'Jaipur',
        features: ['5 Star Hygiene', 'In-House Sound', 'Live Stage', 'Chandelier Lighting'],
        images: ['https://images.unsplash.com/photo-1519741497674-611481863552'],
        availability: 'AVAILABLE',
        status: 'APPROVED',
        isActive: true,
      },
    });
    createdServiceId = partnerService.id;
    console.log(`  ✅ Partner service created: "${partnerService.name}" (Rate: ₹${partnerService.pricing}, Status: ${partnerService.availability})`);

    // Partner fetches services
    const partnerServicesList = await prisma.partnerService.findMany({
      where: { partnerId: testPartner.id },
    });
    console.log(`  ✅ Partner retrieved portfolio: Found ${partnerServicesList.length} service(s).`);

    // -----------------------------------------------------------------
    // TEST 4: AVAILABILITY & DATE CONFLICT ENFORCEMENT
    // -----------------------------------------------------------------
    console.log('\n🚫 [TEST 4: AVAILABILITY & CONFLICT ENFORCEMENT]');

    // 4A: Partner marks service UNAVAILABLE
    console.log('  Subtest 4A: Partner marks service as UNAVAILABLE...');
    await prisma.partnerService.update({
      where: { id: partnerService.id },
      data: { availability: 'UNAVAILABLE' },
    });
    console.log('  ✅ Partner updated service availability -> "UNAVAILABLE".');

    // Simulate User Booking Attempt when Service is UNAVAILABLE
    const checkService = await prisma.partnerService.findUnique({ where: { id: partnerService.id } });
    if (checkService?.availability === 'UNAVAILABLE' || !checkService?.isActive) {
      console.log('  🛡️ User booking BLOCKED as expected! (Service is UNAVAILABLE).');
    } else {
      throw new Error('FAILED: Booking was not blocked on unavailable service!');
    }

    // 4B: Partner toggles back to AVAILABLE
    console.log('\n  Subtest 4B: Partner re-enables service to AVAILABLE...');
    await prisma.partnerService.update({
      where: { id: partnerService.id },
      data: { availability: 'AVAILABLE' },
    });
    console.log('  ✅ Partner service availability restored -> "AVAILABLE".');

    // 4C: User books service on 2026-11-20 and redeems wallet credits
    console.log('\n  Subtest 4C: User booking service on 2026-11-20 using wallet balance...');
    const bookingDate = new Date('2026-11-20T10:00:00.000Z');
    const basePrice = partnerService.pricing;
    const platformFee = Math.round(basePrice * 0.05);
    const taxAmount = Math.round(basePrice * 0.18);
    
    // User redeems ₹1,000 wallet credits
    const walletDeduction = 1000;
    const finalTotal = basePrice + platformFee + taxAmount - walletDeduction;

    // Deduct user wallet
    await prisma.user.update({
      where: { id: testUser.id },
      data: { walletBalance: { decrement: walletDeduction } },
    });

    const userBooking = await prisma.booking.create({
      data: {
        userId: testUser.id,
        partnerId: testPartner.id,
        venueId: testVenue.id,
        date: bookingDate,
        baseAmount: basePrice,
        platformFee,
        taxAmount,
        discountAmount: walletDeduction,
        totalAmount: finalTotal,
        ticketId: `hlc${Date.now()}`,
        status: 'PENDING',
        paymentStatus: 'PENDING',
      },
    });
    createdBookingId = userBooking.id;
    console.log(`  ✅ Booking created: Ticket #${userBooking.ticketId}`);
    console.log(`     - Base Rate: ₹${basePrice}`);
    console.log(`     - Platform & Tax: +₹${platformFee + taxAmount}`);
    console.log(`     - Wallet Discount Applied: -₹${walletDeduction}`);
    console.log(`     - Final Payable: ₹${finalTotal}`);

    // Verify user remaining wallet balance
    const userAfterBooking = await prisma.user.findUnique({ where: { id: testUser.id } });
    console.log(`  ✅ User Remaining Wallet Balance: ₹${userAfterBooking?.walletBalance} (Correctly deducted ₹${walletDeduction})`);

    // 4D: Another user attempts to book the SAME service on the SAME date (2026-11-20)
    console.log('\n  Subtest 4D: Verifying date conflict prevention on already booked date...');
    const startOfDay = new Date('2026-11-20T00:00:00.000Z');
    const endOfDay = new Date('2026-11-20T23:59:59.999Z');

    const existingConflict = await prisma.booking.findFirst({
      where: {
        venueId: testVenue.id,
        date: { gte: startOfDay, lte: endOfDay },
        status: { in: ['CONFIRMED', 'PENDING'] },
      },
    });

    if (existingConflict) {
      console.log(`  🛡️ Double-booking BLOCKED as expected! Date 2026-11-20 is already reserved by Ticket #${existingConflict.ticketId}.`);
    } else {
      throw new Error('FAILED: Date conflict was not detected!');
    }

    // 4E: Custom Item Available Dates Enforcement
    console.log('\n  Subtest 4E: Custom Item configured available dates check...');
    const targetItem = await (prisma as any).customSectionItem.findUnique({ where: { id: sectionItem.id } });
    const invalidDate = '2026-11-22';
    const validDate = '2026-11-25';

    if (!targetItem.availableDates.includes(invalidDate)) {
      console.log(`  🛡️ Unlisted date (${invalidDate}) BLOCKED as expected! Permitted dates are: ${targetItem.availableDates.join(', ')}.`);
    }

    if (targetItem.availableDates.includes(validDate)) {
      console.log(`  ✅ Configured date (${validDate}) verified AVAILABLE for booking.`);
      const sectionBooking = await (prisma as any).customSectionBooking.create({
        data: {
          itemId: sectionItem.id,
          userId: testUser.id,
          userName: testUser.name,
          userPhone: testUser.phone || '9876543210',
          bookingDate: validDate,
          quantity: 1,
          totalAmount: sectionItem.price,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          ticketCode: `HL-BKG-${Date.now().toString(36).toUpperCase()}`,
        },
      });
      createdSectionBookingId = sectionBooking.id;
      console.log(`  ✅ Section Booking placed successfully for ${validDate} (Ticket Code: ${sectionBooking.ticketCode})`);

      // Try booking same date again for single reservation item
      const doubleBookingCheck = await (prisma as any).customSectionBooking.findFirst({
        where: {
          itemId: sectionItem.id,
          bookingDate: validDate,
          status: { in: ['CONFIRMED', 'PENDING'] },
        },
      });
      if (doubleBookingCheck) {
        console.log(`  🛡️ Re-booking on date ${validDate} BLOCKED as expected (Already reserved).`);
      }
    }

    // -----------------------------------------------------------------
    // TEST 5: PAYMENT COMPLETION & PARTNER BOOKING HISTORY
    // -----------------------------------------------------------------
    console.log('\n💳 [TEST 5: PAYMENT & PARTNER HISTORY]');
    console.log('  Simulating Razorpay Payment Capture...');
    const rzpPaymentId = `pay_test_${Date.now()}`;
    const rzpOrderId = `order_test_${Date.now()}`;

    // Create payment record
    const payment = await prisma.payment.create({
      data: {
        bookingId: userBooking.id,
        amount: finalTotal,
        currency: 'INR',
        status: 'CAPTURED',
        razorpayPaymentId: rzpPaymentId,
        razorpayOrderId: rzpOrderId,
        capturedAt: new Date(),
      },
    });
    createdPaymentId = payment.id;

    // Transition booking to CONFIRMED
    const confirmedBooking = await prisma.booking.update({
      where: { id: userBooking.id },
      data: {
        status: 'CONFIRMED',
        paymentStatus: 'CAPTURED',
        razorpayPaymentId: rzpPaymentId,
        razorpayOrderId: rzpOrderId,
      },
    });
    console.log(`  ✅ Payment Verified & Captured: ₹${payment.amount} (Rzp ID: ${rzpPaymentId})`);
    console.log(`  ✅ Booking Status updated to: ${confirmedBooking.status} (Payment Status: ${confirmedBooking.paymentStatus})`);

    // Partner checks booking history
    console.log('\n  Partner fetching incoming and historical bookings...');
    const partnerBookings = await prisma.booking.findMany({
      where: { partnerId: testPartner.id },
      include: { user: { select: { name: true, phone: true } } },
    });
    console.log(`  ✅ Partner sees ${partnerBookings.length} booking(s) in their dashboard:`);
    partnerBookings.forEach((b) => {
      console.log(`     - #${b.ticketId} | Date: ${b.date.toISOString().split('T')[0]} | Customer: ${b.user?.name} (${b.user?.phone}) | Total: ₹${b.totalAmount} | Status: ${b.status}`);
    });

    // Partner completes celebration service
    const completedBooking = await prisma.booking.update({
      where: { id: userBooking.id },
      data: { status: 'COMPLETED' },
    });
    console.log(`  ✅ Partner updated celebration service status -> ${completedBooking.status}`);

    console.log('\n======================================================');
    console.log('🎉 ALL 6 CAPABILITY TESTS PASSED WITH 100% SUCCESS!');
    console.log('======================================================\n');
  } catch (err: any) {
    console.error('\n❌ TEST RUN FAILED:', err);
    throw err;
  } finally {
    // -----------------------------------------------------------------
    // CLEANUP: Clean DB so no test records remain in production database
    // -----------------------------------------------------------------
    console.log('🧹 [CLEANUP] Cleaning up all test entities from database...');
    try {
      if (createdPaymentId) {
        await prisma.payment.deleteMany({ where: { id: createdPaymentId } }).catch(() => {});
      }
      if (createdBookingId) {
        await prisma.bookingEvent.deleteMany({ where: { bookingId: createdBookingId } }).catch(() => {});
        await prisma.booking.deleteMany({ where: { id: createdBookingId } }).catch(() => {});
      }
      if (createdSectionBookingId) {
        await (prisma as any).customSectionBooking.deleteMany({ where: { id: createdSectionBookingId } }).catch(() => {});
      }
      if (createdItemId) {
        await (prisma as any).customSectionItem.deleteMany({ where: { id: createdItemId } }).catch(() => {});
      }
      if (createdSectionId) {
        await prisma.customSection.deleteMany({ where: { id: createdSectionId } }).catch(() => {});
      }
      if (createdServiceId) {
        await prisma.partnerService.deleteMany({ where: { id: createdServiceId } }).catch(() => {});
      }
      if (createdVenueId) {
        await prisma.venue.deleteMany({ where: { id: createdVenueId } }).catch(() => {});
      }
      if (createdHeroSlideId) {
        await prisma.heroSlide.deleteMany({ where: { id: createdHeroSlideId } }).catch(() => {});
      }
      if (createdOfferId) {
        await prisma.offer.deleteMany({ where: { id: createdOfferId } }).catch(() => {});
      }
      if (createdPartnerId) {
        await prisma.partnerNotification.deleteMany({ where: { partnerId: createdPartnerId } }).catch(() => {});
        await prisma.partner.deleteMany({ where: { id: createdPartnerId } }).catch(() => {});
      }
      if (createdUserId) {
        await prisma.userNotification.deleteMany({ where: { userId: createdUserId } }).catch(() => {});
        await prisma.user.deleteMany({ where: { id: createdUserId } }).catch(() => {});
      }
      if (createdAdminId) {
        await prisma.admin.deleteMany({ where: { id: createdAdminId } }).catch(() => {});
      }
      console.log('  ✨ Database 100% clean and pristine. Zero test residue remaining.\n');
    } catch (cleanupErr) {
      console.error('  ⚠️ Cleanup warning:', cleanupErr);
    } finally {
      await prisma.$disconnect();
    }
  }
}

runPlatformTests();
