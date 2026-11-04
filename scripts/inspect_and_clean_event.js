const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('--- Fetching all Upcoming Events ---');
  const events = await prisma.upcomingEvent.findMany();
  console.log(`Found ${events.length} events:`);
  events.forEach(e => {
    console.log(`ID: ${e.id} | Title: "${e.title}" | Location: "${e.location}" | Date: ${e.date}`);
  });

  const targetId = 'cmuvb059a0010izvkhi0ci7xv';
  const targetEvent = await prisma.upcomingEvent.findUnique({
    where: { id: targetId }
  });

  if (targetEvent) {
    console.log(`Found target event to remove: ${targetEvent.title} (${targetEvent.id})`);
    
    // Check if there are bookings attached
    const bookingEvents = await prisma.bookingEvent.findMany({
      where: { eventId: targetId }
    });
    console.log(`Found ${bookingEvents.length} bookingEvent references.`);

    if (bookingEvents.length > 0) {
      await prisma.bookingEvent.deleteMany({
        where: { eventId: targetId }
      });
      console.log('Deleted bookingEvent references.');
    }

    await prisma.upcomingEvent.delete({
      where: { id: targetId }
    });
    console.log(`Successfully deleted event ${targetId} from database.`);
  } else {
    console.log(`Event with ID ${targetId} was not found directly by ID.`);
    // Check by location or title
    const matchingEvents = await prisma.upcomingEvent.findMany({
      where: {
        OR: [
          { location: { contains: 'Get Crazy', mode: 'insensitive' } },
          { title: { contains: 'The Dandiya Night', mode: 'insensitive' } },
          { description: { contains: 'Get Crazy', mode: 'insensitive' } }
        ]
      }
    });

    console.log(`Found ${matchingEvents.length} events matching 'Get Crazy' or 'The Dandiya Night':`);
    for (const me of matchingEvents) {
      console.log(`Deleting matching event: ${me.title} (ID: ${me.id})`);
      await prisma.bookingEvent.deleteMany({ where: { eventId: me.id } });
      await prisma.upcomingEvent.delete({ where: { id: me.id } });
      console.log(`Deleted ${me.id}`);
    }
  }

  console.log('\n--- All Bookings in Database ---');
  const bookings = await prisma.booking.findMany({
    include: {
      user: { select: { name: true, phone: true, email: true } },
      events: { include: { event: true } },
      partner: { select: { businessName: true, name: true } },
      payments: true
    },
    orderBy: { createdAt: 'desc' },
    take: 20
  });

  console.log(`Total recent bookings: ${bookings.length}`);
  bookings.forEach(b => {
    console.log(`Booking ID: ${b.id} | Ticket: ${b.ticketId} | User: ${b.user?.name} (${b.user?.phone}) | Amount: ₹${b.totalAmount} | Status: ${b.status} | Payment: ${b.paymentStatus}`);
  });
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
