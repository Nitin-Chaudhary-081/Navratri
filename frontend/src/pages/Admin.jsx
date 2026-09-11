import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { API } from '../lib/app.js';

export default function Admin() {
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [creds, setCreds] = useState({ user: 'admin', pass: 'navratri123' });
  const [stats, setStats] = useState(null);
  const [lookup, setLookup] = useState('');
  const [ticket, setTicket] = useState(null);
  const [ops, setOps] = useState([]);
  const [newOp, setNewOp] = useState({ name: '', username: '', password: '', gateId: 'gate-north' });

  const login = async () => {
    const r = await fetch(API('/api/admin/login'), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(creds) }).then((r) => r.json());
    if (r.token) { localStorage.setItem('adminToken', r.token); setToken(r.token); load(r.token); }
    else alert('login failed');
  };
  const load = async (t = token) => {
    const r = await fetch(API('/api/admin/stats'), { headers: { authorization: 'Bearer ' + t } }).then((r) => r.json());
    setStats(r);
    const o = await fetch(API('/api/admin/operators'), { headers: { authorization: 'Bearer ' + t } }).then((r) => r.json()).catch(() => null);
    if (o?.operators) setOps(o.operators);
  };
  const find = async () => {
    const r = await fetch(API('/api/admin/tickets/' + lookup), { headers: { authorization: 'Bearer ' + token } }).then((r) => r.json());
    setTicket(r.ticket || r);
  };

  // Live feel: refresh numbers every 15s while the dashboard is open.
  useEffect(() => {
    if (!token) return;
    load(token);
    const id = setInterval(() => load(token), 15000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) return (
    <div className="max-w-sm mx-auto p-8">
      <h1 className="section-title">Organizer login</h1>
      <input className="w-full mt-3 p-3 rounded-xl text-night" value={creds.user} onChange={(e) => setCreds({ ...creds, user: e.target.value })} />
      <input type="password" className="w-full mt-2 p-3 rounded-xl text-night" value={creds.pass} onChange={(e) => setCreds({ ...creds, pass: e.target.value })} />
      <button className="btn w-full mt-3" onClick={login}>Login</button>
    </div>
  );
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="section-title">Live dashboard</h1>
      <div className="flex gap-2 mt-2">
        <button className="btn-ghost" onClick={() => load()}>↻ Refresh</button>
        <Link className="btn" to="/scan">📷 Open gate scanner</Link>
      </div>
      <Dashboard stats={stats} />
      <h2 className="section-title mt-10">Find ticket</h2>
      <div className="flex gap-2 mt-4">
        <input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Ticket ID e.g. NVR-…" className="flex-1 p-3 rounded-xl text-night" />
        <button className="btn" onClick={find}>Lookup</button>
      </div>
      {ticket && !ticket.error && <TicketCard t={ticket} />}
      {ticket?.error && <p className="text-red-400 mt-3">Ticket not found.</p>}
      {ticket && !ticket.error && (
        <div className="card p-4 mt-3 flex flex-col md:flex-row gap-2 items-stretch">
          <input id="reentry-reason" placeholder="Re-entry reason (e.g. medical exit, gate 2)" className="flex-1 p-3 rounded-xl text-night text-sm" />
          <button className="btn text-sm" onClick={async () => {
            const reason = document.getElementById('reentry-reason').value;
            const r = await fetch(API('/api/admin/tickets/' + (ticket.ticket_id || lookup) + '/reentry'), {
              method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
              body: JSON.stringify({ reason }),
            }).then((r) => r.json());
            alert(r.error || (r.noop ? 'Ticket is still valid — no re-entry needed.' : `Re-entry granted (${r.scope === 'today' ? "today's entry cleared" : 'one extra scan'}). Logged.`));
            find();
          }}>↩️ Grant re-entry</button>
        </div>
      )}

      <h2 className="section-title mt-10">Gate operators <span className="text-sm font-normal text-white/50">(only these people can open /scan)</span></h2>
      <div className="grid gap-2 mt-3">
        {ops.map((o) => (
          <div key={o.id} className="card p-3 flex items-center gap-3 text-sm">
            <span className={o.active === false ? 'line-through text-white/40' : ''}>
              <b>{o.name}</b> <span className="font-mono text-haldi">@{o.username}</span> · {o.gate_name || o.gate_id}
            </span>
            <span className="ml-auto" />
            {o.active === false
              ? <button className="btn-ghost text-xs" onClick={async () => { await fetch(API(`/api/admin/operators/${o.id}/restore`), { method: 'POST', headers: { authorization: 'Bearer ' + token } }); load(); }}>Restore</button>
              : <button className="btn-ghost text-xs" onClick={async () => { if (confirm(`Revoke scanner access for ${o.name}?`)) { await fetch(API(`/api/admin/operators/${o.id}/revoke`), { method: 'POST', headers: { authorization: 'Bearer ' + token } }); load(); } }}>Revoke</button>}
          </div>
        ))}
      </div>
      <div className="card p-4 mt-3 grid md:grid-cols-5 gap-2">
        <input className="p-2 rounded-xl text-night text-sm" placeholder="Name (e.g. Aarti)" value={newOp.name} onChange={(e) => setNewOp({ ...newOp, name: e.target.value })} />
        <input className="p-2 rounded-xl text-night text-sm" placeholder="username (a-z0-9-)" value={newOp.username} onChange={(e) => setNewOp({ ...newOp, username: e.target.value })} />
        <input type="password" className="p-2 rounded-xl text-night text-sm" placeholder="password (min 6)" value={newOp.password} onChange={(e) => setNewOp({ ...newOp, password: e.target.value })} />
        <select className="p-2 rounded-xl text-night text-sm" value={newOp.gateId} onChange={(e) => setNewOp({ ...newOp, gateId: e.target.value })}>
          <option value="gate-north">Gate 1 · North</option>
          <option value="gate-south">Gate 2 · South</option>
          <option value="gate-east">Gate 3 · East</option>
          <option value="gate-vip">Gate 4 · VIP</option>
        </select>
        <button className="btn text-sm" onClick={async () => {
          const r = await fetch(API('/api/admin/operators'), { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify(newOp) }).then((r) => r.json());
          if (r.error) alert(JSON.stringify(r.error)); else { setNewOp({ name: '', username: '', password: '', gateId: 'gate-north' }); load(); }
        }}>+ Add operator</button>
      </div>
    </div>
  );
}

function Card({ label, value, sub }) {
  return (
    <div className="card p-4">
      <p className="text-xs text-white/50 uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-extrabold text-haldi mt-1">{value}</p>
      {sub && <p className="text-xs text-white/50 mt-1">{sub}</p>}
    </div>
  );
}

function Pill({ result }) {
  const color = result === 'granted' ? 'bg-green-600'
    : result === 'duplicate' ? 'bg-amber-600'
    : 'bg-red-600';
  return <span className={`${color} text-xs font-bold px-2 py-1 rounded-lg`}>{result}</span>;
}

function Dashboard({ stats }) {
  if (!stats) return <p className="text-white/50 mt-4">Loading…</p>;
  const count = (arr, key, val) => (arr || []).filter((r) => r[key] === val).reduce((s, r) => s + (r.c || 0), 0);
  const used = count(stats.byStatus, 'status', 'used');
  const voided = count(stats.byStatus, 'status', 'voided');
  const gates = {};
  for (const r of stats.perGate || []) {
    gates[r.gate] = gates[r.gate] || { granted: 0, other: 0 };
    if (r.result === 'granted') gates[r.gate].granted += r.c;
    else gates[r.gate].other += r.c;
  }
  const maxH = Math.max(1, ...(stats.hourly || []).map((r) => r.c));
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN');
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card label="Passes sold" value={stats.totalTickets ?? '—'} sub={`${used} fully used · ${voided} voided`} />
        <Card label="Entered today" value={stats.todayGranted ?? '—'} sub="granted scans, all gates" />
        <Card label="Revenue" value={inr(stats.revenue)} sub="excl. voided passes" />
        <Card label="Gate staff active" value={stats.activeOperators ?? '—'} sub="operator logins" />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="card p-4">
          <h3 className="font-bold mb-2">Sales by pass</h3>
          {(stats.byPass || []).map((r) => (
            <div key={r.pass_type} className="flex justify-between text-sm py-1 border-b border-white/5">
              <span>{r.name}</span>
              <span className="font-mono">{r.c} · {inr(r.revenue)}</span>
            </div>
          ))}
          {!(stats.byPass || []).length && <p className="text-sm text-white/40">No sales yet.</p>}
        </div>
        <div className="card p-4">
          <h3 className="font-bold mb-2">Entries by gate (all time)</h3>
          {Object.entries(gates).map(([g, v]) => (
            <div key={g} className="flex justify-between text-sm py-1 border-b border-white/5">
              <span>{g}</span>
              <span className="font-mono">✅ {v.granted} · ⛔ {v.other}</span>
            </div>
          ))}
          {!Object.keys(gates).length && <p className="text-sm text-white/40">No scans yet.</p>}
        </div>
      </div>

      <div className="card p-4">
        <h3 className="font-bold mb-2">Today's entries per hour</h3>
        {(stats.hourly || []).length ? (
          <div className="flex items-end gap-1 h-28">
            {(stats.hourly || []).map((r) => (
              <div key={r.h} className="flex-1 flex flex-col items-center justify-end h-full" title={`${r.h}:00 — ${r.c}`}>
                <span className="text-[10px] text-white/60">{r.c}</span>
                <div className="w-full bg-haldi/80 rounded-t" style={{ height: `${Math.max(4, (r.c / maxH) * 80)}px` }} />
                <span className="text-[10px] text-white/40">{r.h}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-white/40">No entries today yet.</p>}
      </div>

      <div className="card p-4">
        <h3 className="font-bold mb-2">Latest scans</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-white/40 text-xs">
              <th className="py-1">Time</th><th>Ticket</th><th>Gate</th><th>Staff</th><th>Result</th>
            </tr></thead>
            <tbody>
              {(stats.recent || []).map((s, i) => (
                <tr key={i} className="border-t border-white/5">
                  <td className="py-1 font-mono text-xs">{s.scanned_at ? new Date(s.scanned_at).toLocaleTimeString('en-IN') : '—'}</td>
                  <td className="font-mono">{s.ticket_id}</td>
                  <td>{s.gate}</td>
                  <td>{s.operator || '—'}</td>
                  <td><Pill result={s.result} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(stats.recent || []).length && <p className="text-sm text-white/40">No scans yet.</p>}
        </div>
      </div>
    </div>
  );
}

function TicketCard({ t }) {
  const id = t.ticket_id || t.ticketId;
  const status = t.status || (t.usesRemaining <= 0 ? 'used' : 'unused');
  const color = status === 'used' ? 'bg-red-600' : status === 'voided' ? 'bg-gray-600' : 'bg-green-600';
  const row = (k, v) => (
    <div className="flex justify-between text-sm py-1 border-b border-white/5">
      <span className="text-white/50">{k}</span><span className="font-mono text-right">{v ?? '—'}</span>
    </div>
  );
  return (
    <div className="card p-4 mt-3">
      <div className="flex items-center gap-2">
        <h3 className="font-bold font-mono text-lg">{id}</h3>
        <span className={`${color} text-xs font-bold px-2 py-1 rounded-lg`}>{status}</span>
      </div>
      <div className="mt-2">
        {row('Pass', t.pass_type || t.passType)}
        {row('Holder', t.holder_name || t.holder?.name)}
        {row('Contact', t.holder_contact || t.holder?.contact)}
        {row('Nights left', t.uses_remaining ?? t.usesRemaining)}
        {row('First entry', t.used_at || t.usedAt ? new Date(t.used_at || t.usedAt).toLocaleString('en-IN') : '—')}
        {row('First gate', t.used_gate_id || t.usedGate)}
      </div>
    </div>
  );
}
