import { useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { IMGS } from '../lib/app.js';
import { saveMyTickets } from './TicketView.jsx';

export default function Success() {
  const { state } = useLocation();
  useEffect(() => {
    if (state?.issued) {
      saveMyTickets(state.issued, {
        passName: state.pass?.name || 'Garba Pass',
        holderName: state.buyer?.name || '',
        contact: state.buyer?.contact || '',
        orderId: state.order?.id || '',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!state?.issued) return <div className="p-10 text-center">No tickets. <Link className="underline" to="/">Go home</Link></div>;
  const ticketState = (t) => ({
    ticket: {
      ticketId: t.ticketId,
      qrDataUrl: t.qrDataUrl,
      passName: state.pass?.name || 'Garba Pass',
      holderName: state.buyer?.name || '',
      contact: state.buyer?.contact || '',
      orderId: state.order?.id || '',
    },
  });
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <img src={IMGS.success} className="rounded-2xl h-44 w-full object-cover" alt="success" />
      <h1 className="section-title mt-4">🎉 Passes ready! {state.issued.length}x {state.pass?.name}</h1>
      <p className="text-white/60 text-sm">Order {state.order?.id} · open each ticket and Save as PDF so it's on your phone at the gate.</p>
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        {state.issued.map((t) => (
          <div key={t.ticketId} className="card p-4 text-center">
            <img src={t.qrDataUrl} className="w-56 h-56 mx-auto rounded-xl bg-white p-2" alt={t.ticketId} />
            <p className="font-mono mt-2">{t.ticketId}</p>
            <p className="text-sm text-white/60">{state.pass?.name} · {state.buyer?.name}</p>
            <Link to={`/t/${t.ticketId}`} state={ticketState(t)} className="btn mt-3 inline-block text-sm">🎫 Open ticket + Save PDF</Link>
          </div>
        ))}
      </div>
    </div>
  );
}
