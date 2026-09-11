import { Router } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { store } from '../lib/store.js';

export const opsRouter = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';

const loginSchema = z.object({
  user: z.string().min(2).max(40),
  pass: z.string().min(3).max(100),
});

// Gate-operator login — this is the ONLY way to use the scanner.
// Each operator is bound to one gate; the token carries both identities.
opsRouter.post('/login', async (req, res) => {
  const p = loginSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: 'bad request' });
  const op = await store.verifyOperator(p.data.user, p.data.pass);
  if (!op) return res.status(401).json({ error: 'bad credentials or revoked access' });
  const gateId = op.gate_id || op.gateId;
  const token = jwt.sign(
    { role: 'operator', opId: op.id, name: op.name, gateId },
    JWT_SECRET,
    { expiresIn: '12h' } // covers one event night + buffer
  );
  res.json({ token, name: op.name, gateId });
});

// Required on every scan call. Admins may also scan (e.g. supervisor device)
// but must pass their gate explicitly since admin tokens carry no gate.
export function needOperator(req, res, next) {
  try {
    const t = String(req.headers.authorization || '').replace('Bearer ', '');
    const claims = jwt.verify(t, JWT_SECRET);
    if (claims.role !== 'operator' && claims.role !== 'admin') {
      return res.status(403).json({ result: 'invalid', reason: 'forbidden' });
    }
    req.scanner = claims;
    next();
  } catch {
    res.status(401).json({ result: 'invalid', reason: 'login-required' });
  }
}
