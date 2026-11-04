const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearTestData() {
  console.log('--- STARTING DATABASE CLEANUP: BOOKINGS, SERVICES, PARTNERS, WALLETS ---');

  // 1. Clear All Booking Events, Payments, Refunds
  console.log('Clearing booking events, payments, refunds...');
  const delBookingEvents = await prisma.bookingEvent.deleteMany({});
  const delPaymentEvents = await prisma.paymentEvent.deleteMany({});
  const delRefunds = await prisma.refund.deleteMany({});
  const delPayments = await prisma.payment.deleteMany({});
  console.log(`Deleted: ${delBookingEvents.count} booking events, ${delPaymentEvents.count} payment events, ${delRefunds.count} refunds, ${delPayments.count} payments.`);

  // 2. Clear Bookings (Standard, Event bookings, Section bookings)
  console.log('Clearing bookings...');
  const delBookings = await prisma.booking.deleteMany({});
  const delEventBookings = await prisma.eventBooking.deleteMany({});
  const delSectionBookings = await prisma.customSectionBooking.deleteMany({});
  const delBills = await prisma.bill.deleteMany({});
  const delPayouts = await prisma.payout.deleteMany({});
  const delLedger = await prisma.financialLedger.deleteMany({});
  console.log(`Deleted: ${delBookings.count} bookings, ${delEventBookings.count} event bookings, ${delSectionBookings.count} section bookings, ${delBills.count} bills, ${delPayouts.count} payouts, ${delLedger.count} ledger records.`);

  // 3. Clear Services and Venues
  console.log('Clearing partner services and venues...');
  const delServices = await prisma.partnerService.deleteMany({});
  const delVenues = await prisma.venue.deleteMany({});
  console.log(`Deleted: ${delServices.count} partner services, ${delVenues.count} venues.`);

  // 4. Clear Partner Subscriptions, OTPs, Notifications, and Partners
  console.log('Clearing partner subscriptions and partners...');
  const delSubEvents = await prisma.subscriptionEvent.deleteMany({});
  const delPartnerSubs = await prisma.partnerSubscription.deleteMany({});
  const delPartnerNotifs = await prisma.partnerNotification.deleteMany({});
  const delPartnerOtps = await prisma.partnerOtp.deleteMany({});
  const delPartners = await prisma.partner.deleteMany({});
  console.log(`Deleted: ${delSubEvents.count} sub events, ${delPartnerSubs.count} subscriptions, ${delPartnerNotifs.count} partner notifications, ${delPartnerOtps.count} partner OTPs, ${delPartners.count} partners.`);

  // 5. Reset All User Wallets to 0 (Keep User Accounts intact)
  console.log('Resetting all user wallet balances to 0 (preserving user accounts)...');
  const userWalletReset = await prisma.user.updateMany({
    data: { walletBalance: 0 },
  });
  console.log(`Reset wallet balances to 0 for ${userWalletReset.count} users.`);

  // 6. Verify User Accounts are intact
  const userCount = await prisma.user.count();
  console.log(`Total user accounts preserved: ${userCount}`);

  console.log('--- DATABASE CLEANUP COMPLETED SUCCESSFULLY ---');
}

clearTestData()
  .catch((e) => {
    console.error('Cleanup Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
