// Double-scan race test: two scans of the same QR at the same ms — exactly one must win.
// Now authenticates as a gate operator first (scanner is operator-only).
const BASE = process.env.BASE || 'http://localhost:4000';

const login = await (await fetch(`${BASE}/api/ops/login`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ user: process.env.OP_USER || 'gate1', pass: process.env.OP_PASS || 'scan123' }),
})).json();
if (!login.token) { console.error('operator login failed:', JSON.stringify(login)); process.exit(1); }
const auth = { authorization: 'Bearer ' + login.token };
console.log(`operator ${login.name} @ ${login.gateId}`);

const pass = await (await fetch(`${BASE}/api/passes/checkout`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ passId: 'single', qty: 1, name: 'Race Test', contact: 'test@x.com', channel: 'email' }),
})).json();
const qr = pass.issued[0].qrString;
console.log('ticket', pass.issued[0].ticketId);

const scan = () => fetch(`${BASE}/api/scans/validate`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...auth },
  body: JSON.stringify({ qr }),
}).then((r) => r.json());

// unauthenticated call must be rejected
const anon = await fetch(`${BASE}/api/scans/validate`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ qr, gateKey: 'dev-gate-1' }),
}).then((r) => r.json());
console.log('anon (must be login-required):', JSON.stringify(anon));

const [a, b] = await Promise.all([scan(), scan()]);
console.log('scan A:', JSON.stringify(a));
console.log('scan B:', JSON.stringify(b));
const granted = [a, b].filter((r) => r.result === 'granted').length;
const ok = granted === 1 && anon.reason === 'login-required';
console.log(ok ? 'PASS: exactly one granted, anon rejected' : `FAIL: granted=${granted} anon=${JSON.stringify(anon)}`);
process.exit(ok ? 0 : 1);
