import { useEffect, useState } from 'react';
import { useParams, useLocation, Link } from 'react-router-dom';
import { API, IMGS } from '../lib/app.js';

// Real event ticket: event details + holder + QR, printable / save-as-PDF.
// Data comes from the purchase flow (navigation state) or this device's
// saved tickets (localStorage), so refresh and revisit keep working.
export function saveMyTickets(issued, meta) {
  try {
    const prev = JSON.parse(localStorage.getItem('myTickets') || '{}');
    for (const t of issued) {
      prev[t.ticketId] = {
        ticketId: t.ticketId,
        qrDataUrl: t.qrDataUrl,
        passName: meta.passName,
        holderName: meta.holderName,
        contact: meta.contact,
        orderId: meta.orderId,
      };
    }
    localStorage.setItem('myTickets', JSON.stringify(prev));
  } catch {}
}

export function loadMyTicket(ticketId) {
  try {
    return JSON.parse(localStorage.getItem('myTickets') || '{}')[ticketId] || null;
  } catch { return null; }
}

export default function TicketView() {
  const { id } = useParams();
  const { state } = useLocation();
  const [serverTicket, setServerTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const local = state?.ticket || loadMyTicket(id);

  // WhatsApp/email links open on ANY device — fetch the ticket from the server
  // when this device has no saved copy.
  useEffect(() => {
    if (local) { setLoading(false); return; }
    fetch(API('/api/passes/ticket/' + encodeURIComponent(id)))
      .then((r) => r.json())
      .then((d) => { if (d.ticket) setServerTicket({ ...d.ticket, contact: '', orderId: '' }); })
      .catch(() => {})
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const ticket = local || serverTicket;

  if (loading) return <div className="p-10 text-center">Loading ticket…</div>;

  if (!ticket) {
    return (
      <div className="p-10 text-center">
        <p>Ticket not found on this device. Open it from your purchase confirmation or SMS/WhatsApp link.</p>
        <Link className="underline" to="/">Go home</Link>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-10">
      {/* ---- the ticket (this exact block is what prints / saves as PDF) ---- */}
      <div className="ticket-print rounded-3xl overflow-hidden bg-white text-night shadow-2xl">
        <div className="toran" />
        <img src={IMGS.heroBg} className="w-full h-36 object-cover" alt="Navratri" />
        <div className="p-5">
          <p className="text-xs tracking-widest font-bold text-maroon">NAVRATRI GARBA 2026 · OFFICIAL ENTRY PASS</p>
          <h1 className="text-2xl font-extrabold">{ticket.passName}</h1>
          <div className="grid grid-cols-2 gap-2 text-sm mt-3">
            <div><p className="text-night/50 text-xs">Holder</p><p className="font-bold">{ticket.holderName}</p></div>
            <div><p className="text-night/50 text-xs">Ticket ID</p><p className="font-mono font-bold">{ticket.ticketId}</p></div>
            <div><p className="text-night/50 text-xs">Venue</p><p className="font-bold">Main Ground</p></div>
            <div><p className="text-night/50 text-xs">Time</p><p className="font-bold">7 PM onwards · 9 Nights</p></div>
          </div>
          <img src={ticket.qrDataUrl} className="w-60 h-60 mx-auto mt-4 border-4 border-night/10 rounded-2xl" alt={`QR for ${ticket.ticketId}`} />
          <p className="font-mono text-center font-bold mt-1">{ticket.ticketId}</p>
          <p className="text-center text-xs text-night/60 mt-2">
            Show at gate · brightness full · single scan, no re-entry (emergency: supervisor desk).
            Season/VIP: one entry per night. Couple: enter together.
            Order {ticket.orderId}
          </p>
        </div>
        <div className="toran" />
      </div>

      {/* ---- screen-only actions (hidden in print/PDF) ---- */}
      <div className="no-print flex gap-2 mt-4">
        <button className="btn flex-1" onClick={() => window.print()}>⬇️ Save as PDF / Print</button>
        <Link className="btn-ghost" to="/">Home</Link>
      </div>
      <p className="no-print text-white/50 text-xs text-center mt-2">
        On phone: tap above → Share / Save as PDF. Keep this ticket on the device you'll carry to the gate.
      </p>
    </div>
  );
}
