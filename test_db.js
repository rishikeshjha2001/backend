const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function main() {
  try {
    await prisma.$connect();
    console.log('PostgreSQL is ONLINE!');
    const users = await prisma.user.count();
    const bookings = await prisma.booking.count();
    const payments = await prisma.payment.count();
    console.log(`Users: ${users}, Bookings: ${bookings}, Payments: ${payments}`);
  } catch (e) {
    console.error('Database connection failed:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();

