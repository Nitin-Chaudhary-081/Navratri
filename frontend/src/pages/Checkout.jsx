import { useParams, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { API, IMGS } from '../lib/app.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function normalizePhone(raw) {
  let d = String(raw || '').replace(/[\s-]/g, '');
  if (d.startsWith('+91')) d = d.slice(3);
  else if (d.startsWith('91') && d.length === 12) d = d.slice(2);
  else if (d.startsWith('0') && d.length === 11) d = d.slice(1);
  return d;
}
// Same rules as the server: the ticket is DELIVERED on the chosen channel,
// so an email channel needs a real email, SMS/WhatsApp a real Indian mobile.
function validateContact(channel, contact) {
  const v = String(contact || '').trim();
  if (channel === 'email') {
    if (!EMAIL_RE.test(v)) return 'Enter a valid email address (e.g. name@example.com).';
    return '';
  }
  if (!/^[6-9]\d{9}$/.test(normalizePhone(v))) {
    return 'Enter a valid 10-digit Indian mobile number (e.g. 9876543210).';
  }
  return '';
}

export default function Checkout() {
  const { passId } = useParams();
  const nav = useNavigate();
  const [form, setForm] = useState({ name: '', contact: '', channel: 'email', qty: 1 });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [waiting, setWaiting] = useState(false);

  // After Razorpay reports success, the pass is issued by our server webhook
  // (payment.captured) — poll until it lands, then show the QRs.
  const waitForPass = async (orderId, checkoutState) => {
    setWaiting(true);
    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2000));
      const s = await fetch(API('/api/passes/order/' + orderId)).then((r) => r.json()).catch(() => null);
      if (s?.status === 'fulfilled' && s.issued) {
        nav('/success', { state: { ...checkoutState, issued: s.issued } });
        return;
      }
      if (s?.status === 'failed') {
        alert('Payment failed — no pass was issued. Please try again.');
        setWaiting(false);
        return;
      }
    }
    setWaiting(false);
    alert('Payment received! Your pass is being prepared and will arrive on ' + form.channel + ' shortly. You can also check back here.');
  };

  const pay = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.name.trim().length < 2) errs.name = 'Enter your full name.';
    const contactErr = validateContact(form.channel, form.contact);
    if (contactErr) errs.contact = contactErr;
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    try {
      const r = await fetch(API('/api/passes/checkout'), {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ passId, ...form, name: form.name.trim(), qty: Number(form.qty) }),
      }).then((r) => r.json());
      if (r.error) {
        const f = r.error.fieldErrors || {};
        setErrors({
          contact: f.contact?.[0],
          name: f.name?.[0],
          form: !f.contact && !f.name ? 'Could not start payment. Please check details and retry.' : '',
        });
        setLoading(false);
        return;
      }
      const withBuyer = { ...r, buyer: { name: form.name.trim(), contact: form.contact.trim(), channel: form.channel } };
      // Real Razorpay order → hosted checkout, UPI apps first, cards/netbanking backup.
      // On mobile Razorpay shows GPay/PhonePe/Paytm intent buttons (auto-open the app
      // with the fixed amount); on desktop it shows a UPI QR + card/netbanking tabs.
      if (!r.order?.mock && window.Razorpay) {
        const rz = new window.Razorpay({
          key: r.razorpayKeyId,
          order_id: r.order.id,
          amount: r.order.amount,
          currency: 'INR',
          name: 'Raas Rang Navratri Mahotsav',
          description: `${r.pass?.name} × ${form.qty} · Palanpur`,
          prefill: { name: form.name, contact: form.contact, email: form.contact.includes('@') ? form.contact : undefined },
          notes: { passId, qty: String(form.qty) },
          theme: { color: '#7A0C1A' },
          // UPI-first, cards + netbanking as backup. Wallets/EMI hidden to keep it simple.
          config: {
            display: {
              blocks: {
                upi: { name: 'UPI (GPay / PhonePe / Paytm)', instruments: [{ method: 'upi' }] },
                card: { name: 'Card', instruments: [{ method: 'card' }] },
                netbanking: { name: 'Netbanking', instruments: [{ method: 'netbanking' }] },
              },
              sequence: ['block.upi', 'block.card', 'block.netbanking'],
              preferences: { show_default_blocks: false },
            },
          },
          handler: () => waitForPass(r.pendingOrderId || r.order?.id, withBuyer),
          modal: { ondismiss: () => alert('Payment cancelled — no money was charged. Your pass is not booked yet.') },
        });
        rz.on('payment.failed', () => alert('Payment failed — please try again or use another UPI app/card.'));
        rz.open();
      } else {
        nav('/success', { state: withBuyer });
      }
    } catch (err) { setErrors({ form: 'Checkout failed: ' + err.message }); }
    finally { setLoading(false); }
  };

  const isEmail = form.channel === 'email';

  return (
    <div className="max-w-xl mx-auto px-4 py-10">
      <img src={IMGS.couple} className="rounded-2xl h-40 w-full object-cover" alt="checkout" />
      <h1 className="section-title mt-4">Checkout · {passId}</h1>
      <form onSubmit={pay} className="card p-5 mt-4 space-y-3" noValidate>
        <div>
          <input
            className="w-full p-3 rounded-xl text-night" placeholder="Full name"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoComplete="name" required
          />
          {errors.name && <p className="text-red-400 text-sm mt-1">{errors.name}</p>}
        </div>
        <div className="flex gap-4 text-sm items-center">
          <span className="text-white/60">Ticket arrives by email 📧</span>
          <input type="number" min="1" max="10" value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} className="ml-auto w-20 p-2 rounded-xl text-night" title="qty" />
        </div>
        <div>
          <input
            className="w-full p-3 rounded-xl text-night"
            placeholder={isEmail ? 'Email address (ticket arrives here)' : '10-digit mobile number (ticket arrives here)'}
            value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}
            inputMode={isEmail ? 'email' : 'tel'} autoComplete={isEmail ? 'email' : 'tel'} required
          />
          {errors.contact && <p className="text-red-400 text-sm mt-1">{errors.contact}</p>}
          {!errors.contact && (
            <p className="text-xs text-white/40 mt-1">
              {isEmail ? 'Double-check spelling — your QR ticket is emailed to this address.' : 'Your QR ticket is sent to this number — it must be correct.'}
            </p>
          )}
        </div>
        {errors.form && <p className="text-red-400 text-sm">{errors.form}</p>}
        <button className="btn w-full" disabled={loading || waiting}>
          {waiting ? '⏳ Confirming payment…' : loading ? 'Processing…' : 'Pay — UPI / Card / Netbanking'}
        </button>
        <p className="text-xs text-white/50">Demo: mock order issues QR instantly. Live: UPI app opens with the fixed amount → pay → QR pass issued.</p>
      </form>
    </div>
  );
}
