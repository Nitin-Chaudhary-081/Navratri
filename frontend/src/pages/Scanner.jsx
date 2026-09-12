import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { API, queueScan, flushQueue } from '../lib/app.js';

// Gate scanner — STAFF ONLY, not linked anywhere on the public site.
// Reach it via the admin panel ("Open gate scanner") or the direct /scan URL.
// Operators log in below; organizers already logged in to /admin pass straight through.
//
// Scan behavior: the camera STOPS on the first successful read (no auto-refire),
// and every check goes straight to the server — a used pass shows red instantly,
// no grace delay. Guard taps "scan next" to resume.
const DEBOUNCE_MS = 2000; // ignore repeat decodes faster than this
export default function Scanner() {
  const [session, setSession] = useState(() => {
    try {
      const op = JSON.parse(localStorage.getItem('opSession') || 'null');
      if (op) return op;
      // Organizer handing the phone to a gate? Admin token works too (picks gate below).
      const at = localStorage.getItem('adminToken');
      if (at) return { token: at, role: 'admin', name: 'Organizer' };
      return null;
    } catch { return null; }
  });
  const [creds, setCreds] = useState({ user: '', pass: '' });
  const [loginErr, setLoginErr] = useState('');
  const [manual, setManual] = useState('');
  const [res, setRes] = useState(null);
  const [adminGate, setAdminGate] = useState('gate-north');
  const [online, setOnline] = useState(navigator.onLine);
  const qrRef = useRef(null);
  const lastDecodeAt = useRef(0); // debounce: camera fires many times/sec
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    if (session) flushQueue(session.token, session.role === 'admin' ? adminGate : undefined);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const login = async (e) => {
    e.preventDefault();
    setLoginErr('');
    const r = await fetch(API('/api/ops/login'), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(creds),
    }).then((r) => r.json()).catch(() => null);
    if (!r?.token) { setLoginErr(r?.error || 'Login failed — check connection'); return; }
    const s = { ...r, role: 'operator' };
    localStorage.setItem('opSession', JSON.stringify(s));
    setSession(s);
  };

  const logout = async () => {
    try { await qrRef.current?.stop(); } catch {}
    localStorage.removeItem('opSession');
    setSession(null); setRes(null);
  };

  const authHeaders = () => ({ 'content-type': 'application/json', authorization: 'Bearer ' + session.token });

  // Single entry point for camera decodes AND manual/USB input.
  const onDecode = async (qr) => {
    const now = Date.now();
    if (now - lastDecodeAt.current < DEBOUNCE_MS) return; // camera multi-fire guard
    lastDecodeAt.current = now;
    const key = String(qr || '').trim();
    if (!key) return;
    await stopCam(); // freeze on first read — guard taps "scan next" to resume
    await validate(key);
  };

  const validate = async (qr) => {
    setRes({ result: '…' });
    const body = session.role === 'admin' ? { qr, gateId: adminGate } : { qr };
    try {
      const r = await fetch(API('/api/scans/validate'), {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(body),
      }).then((r) => r.json());
      if (r.reason === 'access-revoked' || r.reason === 'login-required') { logout(); return; }
      setRes(r);
    } catch {
      queueScan({ qr }); // offline: queue, gate comes from token at sync time
      setRes({ result: 'queued-offline' });
    }
  };

  const startCam = async () => {
    setRes(null);
    setScanning(true);
    const h = new Html5Qrcode('reader');
    qrRef.current = h;
    try {
      await h.start({ facingMode: 'environment' }, { fps: 10, qrbox: 250 }, onDecode, () => {});
    } catch {
      setScanning(false);
    }
  };
  const stopCam = async () => { setScanning(false); try { await qrRef.current?.stop(); } catch {} };
  const nextPerson = async () => { setRes(null); setManual(''); await startCam(); };

  if (!session) {
    return (
      <div className="max-w-sm mx-auto px-4 py-12">
        <h1 className="section-title">🔒 Gate staff only</h1>
        <p className="text-white/60 text-sm mt-2">This scanner is restricted to authorized gate operators. Attendees: your pass is under “My Ticket”.</p>
        <form onSubmit={login} className="card p-5 mt-4 space-y-3">
          <input className="w-full p-3 rounded-xl text-night" placeholder="Operator username (e.g. gate1)" value={creds.user} onChange={(e) => setCreds({ ...creds, user: e.target.value })} required />
          <input type="password" className="w-full p-3 rounded-xl text-night" placeholder="Password" value={creds.pass} onChange={(e) => setCreds({ ...creds, pass: e.target.value })} required />
          {loginErr && <p className="text-red-400 text-sm">{loginErr}</p>}
          <button className="btn w-full">Login as gate staff</button>
          <p className="text-xs text-white/40">Demo: gate1 / gate2 / gate3 / gate4 · password scan123</p>
        </form>
      </div>
    );
  }

  const bg = res?.result === 'granted' ? 'bg-green-600' : res?.result === 'duplicate' || res?.result === 'voided' || res?.result === 'invalid' ? 'bg-red-600' : 'bg-white/5';

  return (
    <div className="max-w-xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="section-title">Gate Scanner {!online && <span className="text-haldi text-lg">(OFFLINE → queuing)</span>}</h1>
        <button className="btn-ghost text-sm" onClick={logout}>Logout</button>
      </div>
      <p className="text-sm text-white/60 mt-1">👤 {session.name}{session.gateId ? ` · ${session.gateId}` : ' · picks gate below'}</p>
      {session.role === 'admin' && (
        <select value={adminGate} onChange={(e) => setAdminGate(e.target.value)} className="w-full mt-3 p-3 rounded-xl text-night">
          <option value="gate-north">Gate 1 · North</option>
          <option value="gate-south">Gate 2 · South</option>
          <option value="gate-east">Gate 3 · East</option>
          <option value="gate-vip">Gate 4 · VIP</option>
        </select>
      )}
      <div className="flex gap-2 mt-3 flex-wrap">
        <button className="btn" onClick={startCam}>📷 Start camera</button>
        <button className="btn-ghost" onClick={stopCam}>Stop</button>
        <button className="btn-ghost" onClick={async () => alert(JSON.stringify(await flushQueue(session.token, session.role === 'admin' ? adminGate : undefined)))}>⇅ Sync queue</button>
      </div>
      <div id="reader" className="mt-4 rounded-2xl overflow-hidden" />
      <form className="flex gap-2 mt-4" onSubmit={(e) => { e.preventDefault(); onDecode(manual); }}>
        <input value={manual} onChange={(e) => setManual(e.target.value)} className="flex-1 p-3 rounded-xl text-night" placeholder="Paste QR string or USB-scanner types here + Enter" />
        <button className="btn">Check</button>
      </form>
      {res && res.result !== '…' && (
        <button className="btn w-full mt-4 text-lg" onClick={nextPerson}>➡️ Scan next person</button>
      )}
      {res && (
        <div className={`${bg} rounded-3xl p-10 mt-6 text-center text-2xl font-extrabold`}>
          {res.result === 'granted' && <>✅ ENTRY GRANTED<br /><span className="text-base font-normal">{res.passType} · left: {res.remaining ?? '—'}{res.reason === 'reentry' ? ' · supervisor re-entry' : ''}</span></>}
          {res.result === 'duplicate' && res.reason === 'daily-limit' && <>⛔ ALREADY ENTERED TODAY<br /><span className="text-base font-normal">first today: {res.usedAt ? new Date(res.usedAt).toLocaleTimeString('en-IN') : ''} @ {res.usedGate} · nights left: {res.remaining ?? '—'} · come back tomorrow</span></>}
          {res.result === 'duplicate' && res.reason !== 'daily-limit' && <>⛔ ALREADY USED<br /><span className="text-base font-normal">first: {res.usedAt ? new Date(res.usedAt).toLocaleString('en-IN') : ''} @ {res.usedGate}{res.reason === 'exhausted' ? ' · all nights over' : ''} · supervisor can grant re-entry</span></>}
          {res.result === 'invalid' && <>❌ INVALID PASS ({res.reason || 'bad QR'})</>}
          {res.result === 'voided' && <>🚫 VOIDED — see supervisor</>}
          {res.result === 'queued-offline' && <>📶 OFFLINE — queued, will sync</>}
          {res.result === '…' && <>⏳ checking…</>}
        </div>
      )}
    </div>
  );
}
