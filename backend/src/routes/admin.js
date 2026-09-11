import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { store } from '../lib/store.js';

export const adminRouter = Router();
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'navratri123';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';

adminRouter.post('/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    return res.json({ token: jwt.sign({ role: 'admin', user }, JWT_SECRET, { expiresIn: '12h' }) });
  }
  res.status(401).json({ error: 'bad credentials' });
});

function needAdmin(req, res, next) {
  try {
    const t = String(req.headers.authorization || '').replace('Bearer ', '');
    req.admin = jwt.verify(t, JWT_SECRET);
    if (req.admin?.role !== 'admin') return res.status(403).json({ error: 'forbidden' });
    next();
  } catch { res.status(401).json({ error: 'unauthorized' }); }
}

adminRouter.get('/stats', needAdmin, async (_req, res) => res.json(await store.stats()));
adminRouter.get('/tickets/:id', needAdmin, async (req, res) => {
  const t = await store.getTicket(req.params.id);
  if (!t) return res.status(404).json({ error: 'not found' });
  // Mask serial hash: only first 6 chars, and log access in prod audit_log
  const masked = { ...t };
  if (masked.serial_hash) masked.serial_hash = String(masked.serial_hash).slice(0, 6) + '…(masked)';
  res.json({ ticket: masked });
});

// ---- gate operators: who is allowed to open the scanner ----
adminRouter.get('/operators', needAdmin, async (_req, res) => {
  res.json({ operators: await store.listOperators() });
});

const opSchema = z.object({
  name: z.string().min(2).max(80),
  username: z.string().min(3).max(40).regex(/^[a-z0-9-]+$/),
  password: z.string().min(6).max(100),
  gateId: z.enum(['gate-north', 'gate-south', 'gate-east', 'gate-vip']),
});

adminRouter.post('/operators', needAdmin, async (req, res) => {
  const p = opSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.flatten() });
  if (await store.findOperatorByUsername(p.data.username)) {
    return res.status(409).json({ error: 'username taken' });
  }
  res.status(201).json(await store.createOperator(p.data));
});

adminRouter.post('/operators/:id/revoke', needAdmin, async (req, res) => {
  const ok = await store.setOperatorActive(req.params.id, false);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ revoked: true });
});

adminRouter.post('/operators/:id/restore', needAdmin, async (req, res) => {
  const ok = await store.setOperatorActive(req.params.id, true);
  if (!ok) return res.status(404).json({ error: 'not found' });
  res.json({ restored: true });
});

// Supervisor re-entry: single-use used pass -> exactly one extra scan;
// season/VIP pass -> clears today's entry so it can be scanned again today.
// Body: { reason } (mandatory, audit-logged with the admin's name).
adminRouter.post('/tickets/:id/reentry', needAdmin, async (req, res) => {
  const reason = String(req.body?.reason || '').trim();
  if (reason.length < 3) return res.status(400).json({ error: 'reason required (min 3 chars)' });
  const out = await store.grantReentry(req.params.id, { actor: req.admin.user || 'admin', reason });
  if (!out) return res.status(404).json({ error: 'not found' });
  res.json(out);
});
