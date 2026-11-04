import { Request, Response } from 'express';
import { verifyRazorpaySignature } from '../services/razorpay.service';
import { processBookingPayment } from '../services/ledger.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const handleRazorpayWebhook = async (req: Request, res: Response) => {
  try {
    const rawBuffer = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}));
    const rawBodyString = rawBuffer.toString('utf8');
    const signature = req.headers['x-razorpay-signature'] as string;

    // 1. Verify Signature with exact raw wire payload (LOGIC-007)
    const isValid = verifyRazorpaySignature(rawBodyString, signature);
    if (!isValid) {
      return res.status(400).json({ success: false, error: 'Invalid webhook signature' });
    }

    const rawBody = typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? req.body
      : JSON.parse(rawBodyString);

    const { event, payload } = rawBody;
    const paymentEntity = payload?.payment?.entity;
    const paymentId = paymentEntity?.id;
    const orderId = paymentEntity?.order_id;
    const notes = paymentEntity?.notes || {}; // Should contain { bookingId } or { partnerId }

    // 2. Idempotency Check (Don't process the same event twice)
    const existingEvent = await prisma.paymentEvent.findFirst({
      where: {
        payment: { razorpayPaymentId: paymentId },
        status: event
      }
    });

    if (existingEvent) {
      return res.status(200).json({ success: true, message: 'Event already processed' });
    }

    // 3. Process Based on Event Type
    switch (event) {
      case 'payment.captured':
        if (notes.bookingId) {
          await processBookingPayment(notes.bookingId, paymentId, paymentEntity.amount);
        } else if (notes.subscriptionForPartnerId) {
          // Process Partner Subscription Renewal
          await prisma.partnerSubscription.updateMany({
            where: { partnerId: notes.subscriptionForPartnerId, status: 'PENDING' },
            data: {
              status: 'ACTIVE',
              razorpayPaymentId: paymentId,
              startDate: new Date(),
              endDate: new Date(new Date().setMonth(new Date().getMonth() + 1))
            }
          });
        }
        break;
        
      case 'payment.failed':
        // Handle failed payment (restrict subscription, or cancel booking)
        if (notes.bookingId) {
          await prisma.booking.update({
            where: { id: notes.bookingId },
            data: { status: 'CANCELLED', paymentStatus: 'FAILED' }
          });
        } else if (notes.subscriptionForPartnerId) {
          await prisma.partnerSubscription.updateMany({
            where: { partnerId: notes.subscriptionForPartnerId, status: 'ACTIVE' },
            data: { status: 'FAILED' } // Grace period logic can be added here
          });
        }
        break;

      case 'refund.processed':
        // Update refund record
        const refundId = payload.refund?.entity?.id;
        if (refundId) {
          await prisma.refund.updateMany({
            where: { razorpayRefundId: refundId },
            data: { status: 'PROCESSED' }
          });
        }
        break;

      default:
        console.log(`Unhandled webhook event: ${event}`);
    }

    // Log the event for audit/idempotency
    if (paymentId) {
      const dbPayment = await prisma.payment.findUnique({ where: { razorpayPaymentId: paymentId } });
      if (dbPayment) {
        await prisma.paymentEvent.create({
          data: {
            paymentId: dbPayment.id,
            status: event,
            payload: rawBody
          }
        });
      }
    }

    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
};
