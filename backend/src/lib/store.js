// Dual store: Postgres (Supabase/Neon) when DATABASE_URL is set, else in-memory Map.
// Both expose the same atomic validate() semantics: first valid scan wins.
import crypto from 'node:crypto';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const usePg = !!process.env.DATABASE_URL;
let pool = null;
if (usePg) {
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  pool.on('error', (err) => console.error('[db] pool error:', err.message));
}

// ---- in-memory fallback (demo / solo dev without DB) ----
const mem = {
  tickets: new Map(), // ticketId -> ticket
  scans: [],
  gates: new Map([
    ['gate-north', { id: 'gate-north', name: 'Gate 1 · North', keyHash: sha('dev-gate-1') }],
    ['gate-south', { id: 'gate-south', name: 'Gate 2 · South', keyHash: sha('dev-gate-2') }],
    ['gate-east', { id: 'gate-east', name: 'Gate 3 · East', keyHash: sha('dev-gate-3') }],
    ['gate-vip', { id: 'gate-vip', name: 'Gate 4 · VIP', keyHash: sha('dev-gate-4') }],
  ]),
  // Demo operators (username -> {id, name, username, passHash, gateId, active}).
  // Memory-only demo password for all four: scan123 — change in production (PG).
  operators: new Map(),
  // Pending Razorpay orders (orderId -> {passId, qty, name, contact, channel, status, issued?}).
  pending: new Map(),
  // Season/VIP day entries ("ticketId:YYYY-MM-DD" -> {usedAt, usedGate, opId}).
  days: new Map(),
  audit: [],
};

// Event calendar day (Asia/Kolkata): one season/VIP entry per day.
function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function sha(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
// Seed demo operators (memory mode). Production uses the PG operators table.
{
  const demoPass = bcrypt.hashSync(process.env.DEMO_OP_PASS || 'scan123', 8);
  const seed = [
    ['op-gate-1', 'Gate 1 Operator', 'gate1', 'gate-north'],
    ['op-gate-2', 'Gate 2 Operator', 'gate2', 'gate-south'],
    ['op-gate-3', 'Gate 3 Operator', 'gate3', 'gate-east'],
    ['op-gate-4', 'Gate 4 Operator', 'gate4', 'gate-vip'],
  ];
  for (const [id, name, username, gateId] of seed) {
    mem.operators.set(username, { id, name, username, passHash: demoPass, gateId, active: true });
  }
}
// simple per-ticket mutex to emulate row-level locking in memory
const locks = new Map();
async function withLock(key, fn) {
  while (locks.get(key)) await new Promise((r) => setTimeout(r, 5));
  locks.set(key, true);
  try { return await fn(); } finally { locks.delete(key); }
}

export const store = {
  mode: usePg ? 'postgres' : 'memory',
  pool,

  async createTicket({ ticketId, eventId, passType, serialHash, qrString, holder, uses = 1, maxUses = uses }) {
    if (usePg) {
      await pool.query(
        `INSERT INTO tickets(ticket_id, event_id, pass_type, serial_hash, qr_jti, qr_string, holder_name, holder_contact, status, uses_remaining, max_uses, version)
         VALUES($1,$2,$3,$4,$5,$6,$7,$8,'unused',$9,$10,1) ON CONFLICT DO NOTHING`,
        [ticketId, eventId, passType, serialHash, qrString.split('.').slice(-2).join('.'), qrString, holder?.name || null, holder?.contact || null, uses, maxUses]
      );
      return { ticketId };
    }
    mem.tickets.set(ticketId, {
      ticketId, eventId, passType, serialHash, qrString,
      status: 'unused', usesRemaining: uses, maxUses, reentryUses: 0,
      usedAt: null, usedGate: null, holder, version: 1,
    });
    return { ticketId };
  },

  async getTicket(ticketId) {
    if (usePg) {
      const { rows } = await pool.query(`SELECT * FROM tickets WHERE ticket_id=$1`, [ticketId]);
      return rows[0] || null;
    }
    return mem.tickets.get(ticketId) || null;
  },

  // Entry rules:
  // - Single-use passes (single/couple, max_uses=1): first scan wins, forever.
  //   A supervisor re-entry grant (reentry_uses) allows exactly one more scan.
  // - Multi-night passes (season/VIP, max_uses>1): ONE granted entry per
  //   calendar day (Asia/Kolkata). Same-day rescan is rejected WITHOUT
  //   consuming a night (reason 'daily-limit').
  // Returns {result: granted|duplicate|voided|invalid, ...}
  async validateScan({ ticketId, gateId, opId = null }) {
    if (usePg) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT * FROM tickets WHERE ticket_id=$1 FOR UPDATE`, [ticketId]);
        const t = rows[0];
        if (!t) { await client.query('ROLLBACK'); return { result: 'invalid' }; }
        if (t.status === 'voided') { await logScan(client, ticketId, gateId, 'voided', opId); await client.query('COMMIT'); return { result: 'voided' }; }
        const maxUses = t.max_uses ?? 1;

        if (maxUses > 1) {
          const day = todayStr();
          const d = await client.query(`SELECT * FROM ticket_days WHERE ticket_id=$1 AND day=$2`, [ticketId, day]);
          if (d.rows[0]) {
            await logScan(client, ticketId, gateId, 'duplicate', opId);
            await client.query('COMMIT');
            return { result: 'duplicate', reason: 'daily-limit', usedAt: d.rows[0].used_at, usedGate: d.rows[0].used_gate_id, passType: t.pass_type, remaining: t.uses_remaining };
          }
          if (t.status === 'used' || t.uses_remaining <= 0) {
            await logScan(client, ticketId, gateId, 'duplicate', opId);
            await client.query('COMMIT');
            return { result: 'duplicate', reason: 'exhausted', usedAt: t.used_at, usedGate: t.used_gate_id, passType: t.pass_type };
          }
          const remaining = t.uses_remaining - 1;
          await client.query(`INSERT INTO ticket_days(ticket_id, day, used_gate_id, op_id) VALUES($1,$2,$3,$4)`, [ticketId, day, gateId, opId]);
          await client.query(
            `UPDATE tickets SET uses_remaining=$2, status=CASE WHEN $2<=0 THEN 'used' ELSE status END,
             used_at=COALESCE(used_at, now()), used_gate_id=$3, version=version+1 WHERE ticket_id=$1`,
            [ticketId, remaining, gateId]
          );
          await logScan(client, ticketId, gateId, 'granted', opId);
          await client.query('COMMIT');
          return { result: 'granted', passType: t.pass_type, remaining };
        }

        if (t.status === 'used' || t.uses_remaining <= 0) {
          if ((t.reentry_uses || 0) > 0) {
            await client.query(`UPDATE tickets SET reentry_uses=reentry_uses-1, used_gate_id=$2, version=version+1 WHERE ticket_id=$1`, [ticketId, gateId]);
            await logScan(client, ticketId, gateId, 'granted', opId);
            await client.query('COMMIT');
            return { result: 'granted', reason: 'reentry', passType: t.pass_type, remaining: 0 };
          }
          await logScan(client, ticketId, gateId, 'duplicate', opId);
          await client.query('COMMIT');
          return { result: 'duplicate', reason: 'used', usedAt: t.used_at, usedGate: t.used_gate_id, passType: t.pass_type };
        }
        await client.query(
          `UPDATE tickets SET uses_remaining=uses_remaining-1, status='used',
           used_at=now(), used_gate_id=$2, version=version+1 WHERE ticket_id=$1`,
          [ticketId, gateId]
        );
        await logScan(client, ticketId, gateId, 'granted', opId);
        await client.query('COMMIT');
        return { result: 'granted', passType: t.pass_type, remaining: 0 };
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        throw e;
      } finally { client.release(); }
    }
    return withLock(ticketId, async () => {
      const t = mem.tickets.get(ticketId);
      if (!t) return { result: 'invalid' };
      if (t.status === 'voided') { mem.scans.push({ ticketId, gateId, opId, result: 'voided', at: new Date().toISOString() }); return { result: 'voided' }; }
      const maxUses = t.maxUses ?? 1;

      if (maxUses > 1) {
        const key = `${ticketId}:${todayStr()}`;
        const today = mem.days.get(key);
        if (today) {
          mem.scans.push({ ticketId, gateId, opId, result: 'duplicate', at: new Date().toISOString() });
          return { result: 'duplicate', reason: 'daily-limit', usedAt: today.usedAt, usedGate: today.usedGate, passType: t.passType, remaining: t.usesRemaining };
        }
        if (t.status === 'used' || t.usesRemaining <= 0) {
          mem.scans.push({ ticketId, gateId, opId, result: 'duplicate', at: new Date().toISOString() });
          return { result: 'duplicate', reason: 'exhausted', usedAt: t.usedAt, usedGate: t.usedGate, passType: t.passType };
        }
        t.usesRemaining -= 1;
        if (t.usesRemaining <= 0) t.status = 'used';
        t.usedAt = t.usedAt || new Date().toISOString();
        t.usedGate = gateId;
        t.version += 1;
        mem.days.set(key, { usedAt: new Date().toISOString(), usedGate: gateId, opId });
        mem.scans.push({ ticketId, gateId, opId, result: 'granted', at: new Date().toISOString() });
        return { result: 'granted', passType: t.passType, remaining: t.usesRemaining };
      }

      if (t.status === 'used' || t.usesRemaining <= 0) {
        if ((t.reentryUses || 0) > 0) {
          t.reentryUses -= 1;
          t.usedGate = gateId;
          t.version += 1;
          mem.scans.push({ ticketId, gateId, opId, result: 'granted', at: new Date().toISOString() });
          return { result: 'granted', reason: 'reentry', passType: t.passType, remaining: 0 };
        }
        mem.scans.push({ ticketId, gateId, opId, result: 'duplicate', at: new Date().toISOString() });
        return { result: 'duplicate', reason: 'used', usedAt: t.usedAt, usedGate: t.usedGate, passType: t.passType };
      }
      t.usesRemaining -= 1;
      t.status = 'used';
      t.usedAt = new Date().toISOString();
      t.usedGate = gateId;
      t.version += 1;
      mem.scans.push({ ticketId, gateId, opId, result: 'granted', at: new Date().toISOString() });
      return { result: 'granted', passType: t.passType, remaining: 0 };
    });
  },

  // Supervisor re-entry: single-use used pass -> one extra scan;
  // multi-night pass -> clears TODAY's entry (allows re-scan today).
  // Every grant is audit-logged with the mandatory reason.
  async grantReentry(ticketId, { actor, reason }) {
    if (usePg) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT * FROM tickets WHERE ticket_id=$1 FOR UPDATE`, [ticketId]);
        const t = rows[0];
        if (!t) { await client.query('ROLLBACK'); return null; }
        const maxUses = t.max_uses ?? 1;
        let scope;
        if (maxUses > 1) {
          await client.query(`DELETE FROM ticket_days WHERE ticket_id=$1 AND day=$2`, [ticketId, todayStr()]);
          scope = 'today';
        } else {
          if (t.status !== 'used') { await client.query('ROLLBACK'); return { noop: true }; }
          await client.query(`UPDATE tickets SET reentry_uses=reentry_uses+1, version=version+1 WHERE ticket_id=$1`, [ticketId]);
          scope = 'once';
        }
        await client.query(`INSERT INTO audit_log(actor, action, target_ticket, reason) VALUES($1,'reentry',$2,$3)`, [actor, ticketId, reason]);
        await client.query('COMMIT');
        return { reentered: true, scope };
      } catch (e) {
        try { await client.query('ROLLBACK'); } catch {}
        throw e;
      } finally { client.release(); }
    }
    return withLock(ticketId, async () => {
      const t = mem.tickets.get(ticketId);
      if (!t) return null;
      const maxUses = t.maxUses ?? 1;
      let scope;
      if (maxUses > 1) {
        mem.days.delete(`${ticketId}:${todayStr()}`);
        scope = 'today';
      } else {
        if (t.status !== 'used') return { noop: true };
        t.reentryUses = (t.reentryUses || 0) + 1;
        scope = 'once';
      }
      mem.audit.push({ actor, action: 'reentry', target: ticketId, reason, at: new Date().toISOString() });
      return { reentered: true, scope };
    });
  },

  // Full dashboard payload: headline cards, per-gate flow, today's hourly
  // entries (Asia/Kolkata), recent scans, sales by pass (for revenue math).
  async stats() {
    if (usePg) {
      const s = await pool.query(`SELECT status, COUNT(*)::int c FROM tickets GROUP BY status`);
      const g = await pool.query(
        `SELECT COALESCE(gt.name, s.gate_id) AS gate, s.gate_id AS gate_id, s.result, COUNT(*)::int c
         FROM scans s LEFT JOIN gates gt ON gt.id = s.gate_id GROUP BY 1, 2, 3 ORDER BY 1`
      );
      const byPass = await pool.query(
        `SELECT pass_type, COUNT(*)::int c FROM tickets WHERE status != 'voided' GROUP BY 1`
      );
      const hourly = await pool.query(
        `SELECT EXTRACT(HOUR FROM timezone('Asia/Kolkata', scanned_at))::int AS h, COUNT(*)::int c
         FROM scans WHERE result = 'granted'
         AND (timezone('Asia/Kolkata', scanned_at))::date = (timezone('Asia/Kolkata', now()))::date
         GROUP BY 1 ORDER BY 1`
      );
      const today = await pool.query(
        `SELECT COUNT(*)::int c FROM scans WHERE result = 'granted'
         AND (timezone('Asia/Kolkata', scanned_at))::date = (timezone('Asia/Kolkata', now()))::date`
      );
      const recent = await pool.query(
        `SELECT s.ticket_id, COALESCE(gt.name, s.gate_id) AS gate, s.result, s.scanned_at,
                COALESCE(o.name, s.op_id) AS operator
         FROM scans s LEFT JOIN gates gt ON gt.id = s.gate_id
         LEFT JOIN operators o ON o.id = s.op_id
         ORDER BY s.id DESC LIMIT 15`
      );
      const ops = await pool.query(`SELECT COUNT(*)::int c FROM operators WHERE active = true`);
      const total = await pool.query(`SELECT COUNT(*)::int c FROM tickets`);
      return {
        byStatus: s.rows, scans: g.rows, perGate: g.rows, byPass: byPass.rows,
        hourly: hourly.rows, todayGranted: today.rows[0]?.c || 0,
        recent: recent.rows, activeOperators: ops.rows[0]?.c || 0,
        totalTickets: total.rows[0]?.c || 0,
      };
    }
    const byStatus = {};
    const byPassMap = {};
    for (const t of mem.tickets.values()) {
      byStatus[t.status] = (byStatus[t.status] || 0) + 1;
      if (t.status !== 'voided') byPassMap[t.passType] = (byPassMap[t.passType] || 0) + 1;
    }
    const gateName = (id) => mem.gates.get(id)?.name || id;
    const perGateMap = {};
    for (const sc of mem.scans) {
      const k = sc.gateId + '|' + sc.result;
      perGateMap[k] = (perGateMap[k] || 0) + 1;
    }
    const perGate = Object.entries(perGateMap).map(([k, c]) => {
      const [gate_id, result] = k.split('|');
      return { gate: gateName(gate_id), gate_id, result, c };
    });
    const todayK = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const hourlyMap = {};
    let todayGranted = 0;
    for (const sc of mem.scans) {
      if (sc.result !== 'granted') continue;
      const d = new Date(sc.at);
      if (d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) !== todayK) continue;
      todayGranted += 1;
      const h = Number(d.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));
      hourlyMap[h] = (hourlyMap[h] || 0) + 1;
    }
    const opName = (id) => {
      if (!id) return '—';
      for (const o of mem.operators.values()) if (o.id === id) return o.name;
      return String(id).startsWith('admin:') ? 'Organizer' : id;
    };
    return {
      byStatus,
      totalScans: mem.scans.length,
      gates: [...mem.gates.values()].map((g) => ({ id: g.id, name: g.name })),
      perGate,
      byPass: Object.entries(byPassMap).map(([pass_type, c]) => ({ pass_type, c })),
      hourly: Object.entries(hourlyMap).map(([h, c]) => ({ h: Number(h), c })).sort((a, b) => a.h - b.h),
      todayGranted,
      recent: mem.scans.slice(-15).reverse().map((sc) => ({
        ticket_id: sc.ticketId, gate: gateName(sc.gateId), result: sc.result,
        scanned_at: sc.at, operator: opName(sc.opId),
      })),
      activeOperators: [...mem.operators.values()].filter((o) => o.active).length,
      totalTickets: mem.tickets.size,
    };
  },

  async findGateByKey(rawKey) {    const h = sha(rawKey || '');
    if (usePg) {
      try {
        const { rows } = await pool.query(`SELECT id, name FROM gates WHERE key_hash=$1 AND active=true`, [h]);
        if (rows[0]) return rows[0];
      } catch { /* fall through to memory */ }
    }
    for (const g of mem.gates.values()) if (g.keyHash === h) return g;
    return null;
  },

  // ---- gate operators (per-person scanner logins) ----
  async findOperatorByUsername(username) {
    if (usePg) {
      const { rows } = await pool.query(`SELECT * FROM operators WHERE username=$1`, [username]);
      return rows[0] || null;
    }
    return mem.operators.get(username) || null;
  },

  async findOperatorById(id) {
    if (usePg) {
      const { rows } = await pool.query(`SELECT * FROM operators WHERE id=$1`, [id]);
      return rows[0] || null;
    }
    for (const op of mem.operators.values()) if (op.id === id) return op;
    return null;
  },

  async verifyOperator(username, password) {
    const op = await this.findOperatorByUsername(username);
    if (!op || op.active === false) return null;
    const hash = op.pass_hash || op.passHash;
    if (!hash || !bcrypt.compareSync(String(password || ''), hash)) return null;
    return op;
  },

  async listOperators() {
    if (usePg) {
      const { rows } = await pool.query(
        `SELECT o.id, o.name, o.username, o.gate_id, o.active, o.created_at, g.name AS gate_name
         FROM operators o LEFT JOIN gates g ON g.id=o.gate_id ORDER BY o.created_at`
      );
      return rows;
    }
    return [...mem.operators.values()].map(({ passHash, ...rest }) => rest);
  },

  async createOperator({ name, username, password, gateId }) {
    const passHash = bcrypt.hashSync(password, 10);
    const id = 'op-' + crypto.randomBytes(4).toString('hex');
    if (usePg) {
      await pool.query(
        `INSERT INTO operators(id, name, username, pass_hash, gate_id) VALUES($1,$2,$3,$4,$5)`,
        [id, name, username, passHash, gateId]
      );
      return { id, username };
    }
    mem.operators.set(username, { id, name, username, passHash, gateId, active: true });
    return { id, username };
  },

  async setOperatorActive(id, active) {
    if (usePg) {
      await pool.query(`UPDATE operators SET active=$2 WHERE id=$1`, [id, active]);
      return true;
    }
    for (const op of mem.operators.values()) if (op.id === id) { op.active = active; return true; }
    return false;
  },

  // ---- pending Razorpay orders (fulfilled only after payment.captured) ----
  async savePendingOrder(orderId, data) {
    const row = { ...data, status: 'pending', createdAt: new Date().toISOString() };
    if (usePg) {
      await pool.query(
        `INSERT INTO pending_orders(order_id, pass_id, qty, holder_name, holder_contact, channel, status)
         VALUES($1,$2,$3,$4,$5,$6,'pending')
         ON CONFLICT (order_id) DO NOTHING`,
        [orderId, data.passId, data.qty, data.name, data.contact, data.channel]
      );
      return row;
    }
    mem.pending.set(orderId, row);
    return row;
  },

  async getPendingOrder(orderId) {
    if (usePg) {
      const { rows } = await pool.query(`SELECT * FROM pending_orders WHERE order_id=$1`, [orderId]);
      const r = rows[0];
      if (!r) return null;
      return { passId: r.pass_id, qty: r.qty, name: r.holder_name, contact: r.holder_contact, channel: r.channel, status: r.status, issued: r.issued };
    }
    return mem.pending.get(orderId) || null;
  },

  // Atomically claim a pending order for fulfillment (webhook retries safe:
  // only the first claim wins, others see status != pending).
  async claimPendingOrder(orderId, issued) {
    if (usePg) {
      const { rows } = await pool.query(
        `UPDATE pending_orders SET status='fulfilled', issued=$2
         WHERE order_id=$1 AND status='pending' RETURNING order_id`,
        [orderId, JSON.stringify(issued || [])]
      );
      return rows.length > 0;
    }
    const p = mem.pending.get(orderId);
    if (!p || p.status !== 'pending') return false;
    p.status = 'fulfilled';
    p.issued = issued;
    return true;
  },

  async failPendingOrder(orderId) {
    if (usePg) {
      await pool.query(`UPDATE pending_orders SET status='failed' WHERE order_id=$1 AND status='pending'`, [orderId]);
      return true;
    }
    const p = mem.pending.get(orderId);
    if (p && p.status === 'pending') p.status = 'failed';
    return true;
  },
};

async function logScan(client, ticketId, gateId, result, opId) {
  await client.query(`INSERT INTO scans(ticket_id, gate_id, result, op_id) VALUES($1,$2,$3,$4)`, [ticketId, gateId, result, opId]);
}
