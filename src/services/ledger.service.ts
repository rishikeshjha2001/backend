import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const PLATFORM_FEE_PERCENTAGE = 10; // 10% platform fee

export const processBookingPayment = async (
  bookingId: string,
  razorpayPaymentId: string,
  amountInPaise: number
) => {
  return await prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { partner: true }
    });

    if (!booking) throw new Error('Booking not found');

    const totalAmountRs = amountInPaise / 100;

    // Create Payment Record
    const payment = await tx.payment.create({
      data: {
        bookingId,
        amount: totalAmountRs,
        status: 'CAPTURED',
        razorpayPaymentId,
        capturedAt: new Date()
      }
    });

    // Update Booking Status
    await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: 'CONFIRMED',
        paymentStatus: 'CAPTURED',
        razorpayPaymentId
      }
    });

    // Add Timeline Event
    await tx.bookingEvent.create({
      data: {
        bookingId,
        eventType: 'PAYMENT_CAPTURED',
        description: `Payment of ₹${totalAmountRs} captured successfully via Razorpay (${razorpayPaymentId})`
      }
    });

    // Ledger Math
    const platformFee = (totalAmountRs * PLATFORM_FEE_PERCENTAGE) / 100;
    const partnerPayable = totalAmountRs - platformFee;

    // 1. Credit overall platform revenue (Gross)
    await tx.financialLedger.create({
      data: {
        type: 'CREDIT',
        entityId: bookingId,
        entityType: 'BOOKING',
        amount: totalAmountRs,
        description: `Customer payment received for booking ${bookingId}`
      }
    });

    // 2. Create Partner Payout
    const payout = await tx.payout.create({
      data: {
        partnerId: booking.partnerId,
        amount: partnerPayable,
        status: 'PENDING'
      }
    });

    // 3. Ledger Liability for Payout
    await tx.financialLedger.create({
      data: {
        type: 'DEBIT',
        entityId: payout.id,
        entityType: 'PAYOUT',
        amount: partnerPayable,
        description: `Partner payout allocated for booking ${bookingId}`
      }
    });

    return { booking, payment, payout };
  });
};
