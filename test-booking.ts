import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  try {
    // Find a user and an event to test with
    const user = await prisma.user.findFirst();
    const event = await prisma.upcomingEvent.findFirst();

    if (!user || !event) {
      console.log('No user or event found.');
      return;
    }

    console.log(`Testing booking for User ${user.id} and Event ${event.id}`);

    const [booking] = await prisma.$transaction([
      prisma.eventBooking.create({
        data: {
          userId: user.id,
          eventId: event.id,
          ticketsCount: 2,
          totalAmount: 100,
          paymentId: 'pay_test',
          referralCodeUsed: null,
          status: 'CONFIRMED',
        }
      }),
      prisma.upcomingEvent.update({
        where: { id: event.id },
        data: { ticketsSold: { increment: 2 } }
      })
    ]);

    console.log('Booking successful:', booking);
  } catch (error) {
    console.error('Booking failed with error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
