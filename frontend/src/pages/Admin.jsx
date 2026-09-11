import { useState } from 'react';
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
      <pre className="card p-4 mt-4 text-xs overflow-auto">{JSON.stringify(stats, null, 2)}</pre>
      <div className="flex gap-2 mt-4">
        <input value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="Ticket ID e.g. NVR-…" className="flex-1 p-3 rounded-xl text-night" />
        <button className="btn" onClick={find}>Lookup</button>
      </div>
      {ticket && <pre className="card p-4 mt-3 text-xs overflow-auto">{JSON.stringify(ticket, null, 2)}</pre>}
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
