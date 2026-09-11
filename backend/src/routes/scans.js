import { Router } from 'express';
import { z } from 'zod';
import { verifyQrString } from '../lib/qr.js';
import { getKeys } from '../lib/keys.js';
import { store } from '../lib/store.js';
import { needOperator } from './ops.js';

export const scansRouter = Router();

// Fixed 4 gates for this event.
const KNOWN_GATES = ['gate-north', 'gate-south', 'gate-east', 'gate-vip'];

const schema = z.object({
  qr: z.string().min(10).max(2000),
  gateId: z.string().optional(), // admins only: pick the gate being operated
});

// All scan endpoints require an operator (or admin) login token.
// The gate is taken from the operator's token — scanners can no longer
// claim to be a different gate, and every scan is attributed to a person.
scansRouter.post('/validate', needOperator, async (req, res) => {
  const p = schema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ result: 'invalid', reason: 'bad-request' });

  let gateId, opId;
  if (req.scanner.role === 'admin') {
    if (!p.data.gateId || !KNOWN_GATES.includes(p.data.gateId)) {
      return res.status(400).json({ result: 'invalid', reason: 'admin-must-pick-gate' });
    }
    gateId = p.data.gateId;
    opId = 'admin:' + (req.scanner.user || 'admin');
  } else {
    const op = await store.findOperatorById(req.scanner.opId);
    if (!op || op.active === false) {
      return res.status(401).json({ result: 'invalid', reason: 'access-revoked' });
    }
    gateId = req.scanner.gateId;
    opId = req.scanner.opId;
  }

  const v = verifyQrString(p.data.qr, getKeys().publicKey);
  if (!v.ok) return res.json({ result: 'invalid', reason: v.reason });

  const out = await store.validateScan({ ticketId: v.ticketId, gateId, opId });
  res.json(out);
});

scansRouter.post('/bulk-sync', needOperator, async (req, res) => {
  // Offline queue flush: [{qr, queuedAt}]. Gate + operator come from the token.
  const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 500) : [];
  let gateId, opId;
  if (req.scanner.role === 'admin') {
    gateId = KNOWN_GATES.includes(req.body?.gateId) ? req.body.gateId : null;
    if (!gateId) return res.status(400).json({ error: 'admin-must-pick-gate' });
    opId = 'admin:' + (req.scanner.user || 'admin');
  } else {
    const op = await store.findOperatorById(req.scanner.opId);
    if (!op || op.active === false) {
      return res.status(401).json({ error: 'access-revoked' });
    }
    gateId = req.scanner.gateId;
    opId = req.scanner.opId;
  }
  const results = [];
  for (const it of items) {
    const v = verifyQrString(String(it.qr || ''), getKeys().publicKey);
    if (!v.ok) { results.push({ qr: '?', result: 'invalid' }); continue; }
    results.push({ ticketId: v.ticketId, ...(await store.validateScan({ ticketId: v.ticketId, gateId, opId })) });
  }
  res.json({ synced: results.length, results });
});

scansRouter.get('/pubkey', (_req, res) => res.json({ publicKey: getKeys().publicKey }));
