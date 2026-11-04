const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.upcomingEvent.findMany();
  console.log('UpcomingEvents count in DB:', events.length);
  events.forEach(e => {
    console.log(`- [${e.id}] "${e.title}" | ${e.category} | ${e.location} | ₹${e.price} | active=${e.isActive}`);
  });
}

main().finally(() => prisma.$disconnect());
