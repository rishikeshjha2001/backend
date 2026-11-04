import { EventEmitter } from 'events';
import { Queue } from 'bullmq';

// ==========================================
// REDIS / BULLMQ SETUP
// ==========================================
const redisOptions = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379')
};

export const notificationQueue = new Queue('notifications', { connection: redisOptions });
export const emailQueue = new Queue('emails', { connection: redisOptions });

// ==========================================
// DOMAIN EVENTS
// ==========================================
class DomainEventEmitter extends EventEmitter {}
export const domainEvents = new DomainEventEmitter();

// Listeners
domainEvents.on('BookingCreated', async (payload: { bookingId: string; userId: string }) => {
  console.log(`[DomainEvent] BookingCreated: ${payload.bookingId}`);
  
  // Enqueue Push Notification
  await notificationQueue.add('booking-created-push', {
    userId: payload.userId,
    title: 'Booking Confirmed!',
    message: `Your booking ${payload.bookingId} is confirmed. Tap to view details.`,
    data: { bookingId: payload.bookingId }
  });
});

domainEvents.on('PaymentCaptured', async (payload: { paymentId: string; amount: number }) => {
  console.log(`[DomainEvent] PaymentCaptured: ${payload.paymentId}`);
  // E.g. Send Email Receipt
});

domainEvents.on('PartnerVerified', async (payload: { partnerId: string }) => {
  console.log(`[DomainEvent] PartnerVerified: ${payload.partnerId}`);
  await notificationQueue.add('partner-verified-push', {
    partnerId: payload.partnerId,
    title: 'Account Verified',
    message: 'Your HappyLokam partner account is now verified! You can subscribe to start accepting bookings.'
  });
});
