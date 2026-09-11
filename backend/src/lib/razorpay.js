// Razorpay: real order when keys exist, mock order otherwise (full-stack demo still works).
import crypto from 'node:crypto';

export async function createRazorpayOrder({ amountPaise, receipt, notes = {} }) {
  if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    const Razorpay = (await import('razorpay')).default;
    const rz = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
    // Fixed amount in paise — buyer can never edit it. Notes tag the order for
    // webhook reconciliation (which pass/product the money was for).
    return rz.orders.create({ amount: amountPaise, currency: 'INR', receipt, notes });
  }
  return { id: 'order_mock_' + crypto.randomBytes(6).toString('hex'), amount: amountPaise, currency: 'INR', receipt, notes, mock: true };
}

export function verifyWebhookSignature(rawBody, signature, secret) {
  const h = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(h);
  const b = Buffer.from(String(signature || ''));
  if (a.length !== b.length) return false; // timingSafeEqual throws on length mismatch
  return crypto.timingSafeEqual(a, b);
}
