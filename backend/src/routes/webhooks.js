import { Router } from 'express';
import { verifyWebhookSignature } from '../lib/razorpay.js';
import { store } from '../lib/store.js';
import { issueTickets } from '../lib/issue.js';
import { PASS_TYPES } from './passes.js';

export const webhooksRouter = Router();

// Razorpay webhook — mount with express.raw() (see index.js) so the
// signature can be verified against the exact request bytes.
// Dashboard: Settings → Webhooks → https://<render-host>/api/webhooks/razorpay
// Subscribe: payment.captured, payment.failed, order.paid
webhooksRouter.post(
  '/razorpay',
  async (req, res) => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return res.status(500).json({ error: 'webhook secret not configured' });
    const sig = req.headers['x-razorpay-signature'];
    const ok = verifyWebhookSignature(req.body, sig, secret);
    if (!ok) return res.status(400).json({ error: 'bad signature' });

    let event;
    try {
      event = JSON.parse(req.body.toString());
    } catch {
      return res.status(400).json({ error: 'bad payload' });
    }

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const orderId = event.payload?.payment?.entity?.order_id || event.payload?.order?.entity?.id;
      if (orderId) await fulfillOrder(orderId);
    } else if (event.event === 'payment.failed') {
      const orderId = event.payload?.payment?.entity?.order_id;
      if (orderId) await store.failPendingOrder(orderId);
    } else {
      console.log('[webhook] razorpay event (ignored):', event.event);
    }
    res.json({ ok: true });
  }
);

// Issue tickets for a paid order. Idempotent: claimPendingOrder only lets the
// first webhook delivery through, so Razorpay retries can never double-issue.
// The inFlight guard additionally serializes concurrent deliveries in memory mode.
const inFlight = new Set();
async function fulfillOrder(orderId) {
  if (inFlight.has(orderId)) return;
  inFlight.add(orderId);
  try {
    const pending = await store.getPendingOrder(orderId);
    if (!pending || pending.status !== 'pending') {
      console.log('[webhook] order not pending, skipping:', orderId);
      return;
    }
    const pass = PASS_TYPES.find((p) => p.id === pending.passId);
    if (!pass) { console.error('[webhook] unknown pass for order:', orderId); return; }
    const issued = await issueTickets({ pass, qty: pending.qty, name: pending.name, contact: pending.contact, channel: pending.channel });
    const claimed = await store.claimPendingOrder(orderId, issued);
    console.log('[webhook] order fulfilled:', orderId, 'claimed:', claimed, 'tickets:', issued.length);
  } finally {
    inFlight.delete(orderId);
  }
}
