import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

async function createBackup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, '..', 'backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const backupFile = path.join(backupDir, `happylokam_db_backup_${timestamp}.json`);
  console.log('Initiating complete database backup to:', backupFile);

  const backupData: Record<string, any> = {
    timestamp: new Date().toISOString(),
    version: '1.0',
    data: {}
  };

  try {
    console.log('Backing up Users...');
    backupData.data.users = await prisma.user.findMany();

    console.log('Backing up Admins...');
    backupData.data.admins = await prisma.admin.findMany();

    console.log('Backing up Managers...');
    backupData.data.managers = await prisma.manager.findMany();

    console.log('Backing up Partners...');
    backupData.data.partners = await prisma.partner.findMany();

    console.log('Backing up Partner Services...');
    backupData.data.partnerServices = await prisma.partnerService.findMany();

    console.log('Backing up Subscription Plans...');
    backupData.data.subscriptionPlans = await prisma.subscriptionPlan.findMany();

    console.log('Backing up Partner Subscriptions...');
    backupData.data.partnerSubscriptions = await prisma.partnerSubscription.findMany();

    console.log('Backing up Bookings...');
    backupData.data.bookings = await prisma.booking.findMany();

    console.log('Backing up Payments...');
    backupData.data.payments = await prisma.payment.findMany();

    console.log('Backing up Payouts...');
    backupData.data.payouts = await prisma.payout.findMany();

    console.log('Backing up Venues...');
    backupData.data.venues = await prisma.venue.findMany();

    console.log('Backing up LokSafari Packages...');
    backupData.data.lokSafariPackages = await prisma.lokSafariPackage.findMany();

    console.log('Backing up Upcoming Events...');
    backupData.data.upcomingEvents = await prisma.upcomingEvent.findMany();

    console.log('Backing up Event Bookings...');
    backupData.data.eventBookings = await prisma.eventBooking.findMany();

    console.log('Backing up Offers...');
    backupData.data.offers = await prisma.offer.findMany();

    console.log('Backing up Blog Posts...');
    backupData.data.blogPosts = await prisma.blogPost.findMany();

    console.log('Backing up Notifications...');
    backupData.data.notifications = await prisma.notification.findMany();

    console.log('Backing up Hero Slides...');
    backupData.data.heroSlides = await prisma.heroSlide.findMany();

    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2), 'utf8');
    const stats = fs.statSync(backupFile);
    console.log(`✅ COMPLETE BACKUP CREATED: ${backupFile} (${(stats.size / 1024).toFixed(2)} KB)`);

    const latestFile = path.join(backupDir, 'latest_backup.json');
    fs.writeFileSync(latestFile, JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`✅ Latest backup updated: ${latestFile}`);
  } catch (err) {
    console.error('Backup error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

createBackup();
