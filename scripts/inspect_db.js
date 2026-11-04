const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const sections = await prisma.customSection.findMany({
    include: { items: true },
    orderBy: { order: 'asc' },
  });
  console.log('=== SECTIONS IN DB (' + sections.length + ') ===');
  for (const s of sections) {
    console.log(`[${s.id}] "${s.title}" (tag: ${s.tag}) -> items: ${s.items.length}`);
    for (const it of s.items) {
      console.log(`    - [${it.id}] ${it.title} | ${it.location} | ₹${it.price} | type: ${it.itemType}`);
    }
  }

  const categories = await prisma.customCategory.findMany({
    include: { items: true },
    orderBy: { order: 'asc' },
  });
  console.log('\n=== CATEGORIES IN DB (' + categories.length + ') ===');
  for (const c of categories) {
    console.log(`[${c.id}] "${c.name}" -> items: ${c.items.length}`);
    for (const it of c.items) {
      console.log(`    - [${it.id}] ${it.title}`);
    }
  }

  const bookings = await prisma.customSectionBooking.findMany({
    take: 10,
    orderBy: { createdAt: 'desc' },
  });
  console.log('\n=== SECTION BOOKINGS IN DB (' + bookings.length + ') ===');
  for (const b of bookings) {
    console.log(`[${b.id}] user: ${b.userName} (${b.userPhone}) | ₹${b.totalAmount} | code: ${b.ticketCode} | date: ${b.bookingDate}`);
  }

  await prisma.$disconnect();
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
