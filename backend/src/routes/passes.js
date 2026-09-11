import { Router } from 'express';
import { z } from 'zod';
import QRCode from 'qrcode';
import { store } from '../lib/store.js';
import { sendPass } from '../lib/notify.js';
import { createRazorpayOrder } from '../lib/razorpay.js';
import { issueTickets } from '../lib/issue.js';

export const passesRouter = Router();

// EDIT PRICES HERE — user will change later (single source of truth for demo)
export const PASS_TYPES = [
  { id: 'single', name: 'Single-Day Garba', priceInr: 299, uses: 1, desc: 'One night entry · single scan, no re-entry (emergency: see supervisor)' },
  { id: 'season', name: 'Season Pass · 9 Nights', priceInr: 1499, uses: 9, desc: 'All 9 nights · one entry per night' },
  { id: 'couple', name: 'Couple Dandiya', priceInr: 499, uses: 1, desc: '2 people · must enter together · single scan' },
  { id: 'vip', name: 'VIP Front-Row', priceInr: 2999, uses: 9, desc: 'All 9 nights · one entry per night · priority lane + lounge' },
];

passesRouter.get('/', (_req, res) => res.json({ passes: PASS_TYPES }));

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const IN_MOBILE_RE = /^[6-9]\d{9}$/; // 10-digit Indian mobile

// Normalize user-typed phones: "98765 43210", "+91-9876543210", "09876543210" → "9876543210"
export function normalizePhone(raw) {
  let d = String(raw || '').replace(/[\s-]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.startsWith('91') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  return d;
}

const checkoutSchema = z.object({
  passId: z.string(),
  qty: z.number().int().min(1).max(10).default(1),
  name: z.string().trim().min(2).max(80),
  contact: z.string().trim().min(5).max(60),
  channel: z.enum(['email', 'whatsapp']).default('whatsapp'),
}).superRefine((val, ctx) => {
  // Channel-aware check: the pass is DELIVERED on this channel, so it must be real.
  if (val.channel === 'email') {
    if (!EMAIL_RE.test(val.contact)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contact'], message: 'Enter a valid email address (e.g. name@example.com).' });
    }
  } else {
    const digits = normalizePhone(val.contact);
    if (!IN_MOBILE_RE.test(digits)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['contact'], message: 'Enter a valid 10-digit Indian mobile number (e.g. 9876543210).' });
    } else {
      val.contact = digits; // store normalized
    }
  }
});

passesRouter.post('/checkout', async (req, res) => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { passId, qty, name, contact, channel } = parsed.data;
  const pass = PASS_TYPES.find((p) => p.id === passId);
  if (!pass) return res.status(404).json({ error: 'unknown pass' });

  const order = await createRazorpayOrder({
    amountPaise: pass.priceInr * qty * 100,
    receipt: `nvr_${Date.now()}`,
    notes: { passId: pass.id, qty: String(qty), contact },
  });

  // Mock mode (no Razorpay keys): instant issue for local demo.
  if (order.mock) {
    const issued = await issueTickets({ pass, qty, name, contact, channel });
    return res.json({ order, pass, issued, razorpayKeyId: 'rzp_test_mock' });
  }

  // Live mode: NEVER issue here. Buyer pays in Razorpay checkout; tickets are
  // created by the webhook on payment.captured (see routes/webhooks.js).
  await store.savePendingOrder(order.id, { passId: pass.id, qty, name, contact, channel });
  res.json({ order, pass, pendingOrderId: order.id, razorpayKeyId: process.env.RAZORPAY_KEY_ID });
});

// Public ticket view for WhatsApp/email links: works on ANY device (no login,
// no localStorage). Exposes ONLY display data — never serials or secrets.
// Ticket IDs are random; global /api/ rate limiting blunts guessing.
passesRouter.get('/ticket/:id', async (req, res) => {
  const t = await store.getTicket(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  const passType = t.pass_type || t.passType;
  const pass = PASS_TYPES.find((x) => x.id === passType);
  const qrString = t.qr_string || t.qrString;
  if (!qrString) return res.status(404).json({ error: 'qr unavailable — contact support' });
  const qrDataUrl = await QRCode.toDataURL(qrString, { width: 512, margin: 1 });
  res.json({
    ticket: {
      ticketId: t.ticket_id || t.ticketId,
      passName: pass?.name || passType,
      holderName: t.holder_name || t.holder?.name || '',
      qrDataUrl,
    },
  });
});

// Polled by the frontend after the Razorpay success handler fires, until the
// webhook fulfills the order (usually < 5s).
passesRouter.get('/order/:id', async (req, res) => {
  const p = await store.getPendingOrder(req.params.id);
  if (!p) return res.status(404).json({ error: 'unknown order' });
  const pass = PASS_TYPES.find((x) => x.id === p.passId);
  res.json({ status: p.status, pass, issued: p.issued || null });
});
