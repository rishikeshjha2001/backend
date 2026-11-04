import Razorpay from 'razorpay';
import crypto from 'crypto';

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';

export const razorpayClient = new Razorpay({
  key_id: RAZORPAY_KEY_ID || 'rzp_test_happylokam',
  key_secret: RAZORPAY_KEY_SECRET || 'rzp_secret_dummy',
});

/**
 * Validates the Razorpay Webhook signature safely using constant-time comparison
 */
export const verifyRazorpaySignature = (
  body: string,
  signature: string,
  secret: string = RAZORPAY_WEBHOOK_SECRET
): boolean => {
  if (!signature || !secret) return false;

  try {
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const signatureBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch (err) {
    return false;
  }
};

/**
 * Validates standard Razorpay payment signature after checkout completion
 */
export const verifyPaymentSignature = (
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string = RAZORPAY_KEY_SECRET
): boolean => {
  if (!orderId || !paymentId || !signature) return false;

  // Enforce valid secret; reject bypass unless running in automated test suite with ALLOW_MOCK_PAYMENT
  if (!secret || secret === 'rzp_secret_dummy') {
    if (process.env.NODE_ENV === 'test' && process.env.ALLOW_MOCK_PAYMENT === 'true') {
      return signature.startsWith('sig_') || signature.length >= 10;
    }
    return false;
  }

  try {
    const body = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(body)
      .digest('hex');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const signatureBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch (err) {
    return false;
  }
};
