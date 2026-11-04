const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanDatabaseForProduction() {
  if (process.env.CONFIRM_PRODUCTION_DATA_RESET !== 'yes') {
    throw new Error(
      'Refusing to delete data. Review the target database and re-run with CONFIRM_PRODUCTION_DATA_RESET=yes.'
    );
  }
  console.log('\n======================================================');
  console.log('🧹 HAPPYLOKAM DATABASE PRODUCTION PURGE & PREPARATION');
  console.log('   Purging all test partners, services, venues,');
  console.log('   bookings, and payments while PRESERVING user directory.');
  console.log('======================================================\n');

  try {
    // 1. Initial Counts
    const preUserCount = await prisma.user.count();
    const preAdminCount = await prisma.admin.count();
    const prePartnerCount = await prisma.partner.count();
    const preServiceCount = await prisma.partnerService.count();
    const preVenueCount = await prisma.venue.count();
    const preBookingCount = await prisma.booking.count();
    const preSecBookingCount = await prisma.customSectionBooking.count();
    const preEventBookingCount = await prisma.eventBooking.count();
    const prePaymentCount = await prisma.payment.count();

    console.log('📊 Current Database State:');
    console.log(`   - Users (PRESERVED)           : ${preUserCount}`);
    console.log(`   - Admins (PRESERVED)          : ${preAdminCount}`);
    console.log(`   - Partners (To Purge)         : ${prePartnerCount}`);
    console.log(`   - Partner Services (To Purge) : ${preServiceCount}`);
    console.log(`   - Venues (To Purge)           : ${preVenueCount}`);
    console.log(`   - Bookings (To Purge)         : ${preBookingCount}`);
    console.log(`   - Section Bookings (To Purge) : ${preSecBookingCount}`);
    console.log(`   - Event Bookings (To Purge)   : ${preEventBookingCount}`);
    console.log(`   - Payments (To Purge)         : ${prePaymentCount}`);
    console.log('\nExecuting clean in safe foreign-key sequence...');

    // 2. Safe Cascade Deletions
    console.log('  1/16 Deleting Refunds...');
    const dRefunds = await prisma.refund.deleteMany({});
    console.log(`       Deleted ${dRefunds.count} record(s).`);

    // Remove test-era delivery history, not the user accounts themselves.
    const dUserNotifs = await prisma.userNotification.deleteMany({});
    const dPartnerNotifsEarly = await prisma.partnerNotification.deleteMany({});
    const dNotifications = await prisma.notification.deleteMany({});
    const dDeviceTokens = await prisma.deviceToken.deleteMany({});
    const dLedger = await prisma.financialLedger.deleteMany({});
    const dReconciliation = await prisma.reconciliationRecord.deleteMany({});
    console.log(`       Deleted ${dUserNotifs.count} user notifications, ${dPartnerNotifsEarly.count} partner notifications, ${dNotifications.count} notifications, ${dDeviceTokens.count} device tokens, ${dLedger.count} ledger entries, ${dReconciliation.count} reconciliation records.`);

    console.log('  2/16 Deleting Payment Events...');
    const dPayEvents = await prisma.paymentEvent.deleteMany({});
    console.log(`       Deleted ${dPayEvents.count} record(s).`);

    console.log('  3/16 Deleting Payments...');
    const dPayments = await prisma.payment.deleteMany({});
    console.log(`       Deleted ${dPayments.count} record(s).`);

    console.log('  4/16 Deleting Booking Events...');
    const dBkgEvents = await prisma.bookingEvent.deleteMany({});
    console.log(`       Deleted ${dBkgEvents.count} record(s).`);

    console.log('  5/16 Deleting Venue Bookings...');
    const dBookings = await prisma.booking.deleteMany({});
    console.log(`       Deleted ${dBookings.count} record(s).`);

    console.log('  6/16 Deleting Custom Section Bookings...');
    const dSecBookings = await prisma.customSectionBooking.deleteMany({});
    console.log(`       Deleted ${dSecBookings.count} record(s).`);

    console.log('  7/16 Deleting Event Bookings...');
    const dEvtBookings = await prisma.eventBooking.deleteMany({});
    console.log(`       Deleted ${dEvtBookings.count} record(s).`);

    console.log('  8/16 Deleting Partner Bills...');
    const dBills = await prisma.bill.deleteMany({});
    console.log(`       Deleted ${dBills.count} record(s).`);

    console.log('  9/16 Deleting Partner Payouts...');
    const dPayouts = await prisma.payout.deleteMany({});
    console.log(`       Deleted ${dPayouts.count} record(s).`);

    console.log(' 10/16 Deleting Partner Subscription Events...');
    const dSubEvents = await prisma.subscriptionEvent.deleteMany({});
    console.log(`       Deleted ${dSubEvents.count} record(s).`);

    console.log(' 11/16 Deleting Partner Subscriptions...');
    const dSubs = await prisma.partnerSubscription.deleteMany({});
    console.log(`       Deleted ${dSubs.count} record(s).`);

    console.log(' 12/16 Deleting Partner Notifications & Otps...');
    const dPartNotifs = await prisma.partnerNotification.deleteMany({});
    const dPartOtps = await prisma.partnerOtp.deleteMany({});
    console.log(`       Deleted ${dPartNotifs.count} notification(s), ${dPartOtps.count} OTP(s).`);

    console.log(' 13/16 Deleting Partner Device Tokens...');
    const dTokens = await prisma.deviceToken.deleteMany({ where: { partnerId: { not: null } } });
    console.log(`       Deleted ${dTokens.count} token(s).`);

    console.log(' 14/16 Deleting Venues...');
    const dVenues = await prisma.venue.deleteMany({});
    console.log(`       Deleted ${dVenues.count} venue(s).`);

    console.log(' 15/16 Deleting Partner Services...');
    const dServices = await prisma.partnerService.deleteMany({});
    console.log(`       Deleted ${dServices.count} service(s).`);

    console.log(' 16/16 Deleting Partners...');
    const dPartners = await prisma.partner.deleteMany({});
    console.log(`       Deleted ${dPartners.count} partner(s).`);

    // Reset bookedSlots counters on custom items to 0
    await prisma.customSectionItem.updateMany({
      data: { bookedSlots: 0 },
    });
    console.log('       Reset all catalog item bookedSlots counters to 0.');

    // User identities remain in place, but no test credit is carried into the
    // production launch. Wallet value must never survive a data reset unless it
    // has been explicitly reconciled by finance.
    const resetWallets = await prisma.user.updateMany({ data: { walletBalance: 0 } });
    console.log(`       Reset wallet balance to ₹0 for ${resetWallets.count} user account(s).`);

    // 3. Post Clean Verification
    const postUserCount = await prisma.user.count();
    const postAdminCount = await prisma.admin.count();
    const postPartnerCount = await prisma.partner.count();
    const postServiceCount = await prisma.partnerService.count();
    const postVenueCount = await prisma.venue.count();
    const postBookingCount = await prisma.booking.count();
    const postSecBookingCount = await prisma.customSectionBooking.count();
    const postPaymentCount = await prisma.payment.count();

    console.log('\n======================================================');
    console.log('✨ PURGE COMPLETED SUCCESSFULLY!');
    console.log('======================================================');
    console.log(`   ✅ Users (Directory Intact)   : ${postUserCount}`);
    console.log(`   ✅ Admins (Intact)             : ${postAdminCount}`);
    console.log(`   ✅ Partners                    : ${postPartnerCount} (CLEAN)`);
    console.log(`   ✅ Partner Services            : ${postServiceCount} (CLEAN)`);
    console.log(`   ✅ Venues                      : ${postVenueCount} (CLEAN)`);
    console.log(`   ✅ Bookings                    : ${postBookingCount} (CLEAN)`);
    console.log(`   ✅ Section Bookings            : ${postSecBookingCount} (CLEAN)`);
    console.log(`   ✅ Payments                    : ${postPaymentCount} (CLEAN)`);
    console.log('======================================================\n');
  } catch (error) {
    console.error('❌ Clean database error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanDatabaseForProduction();
