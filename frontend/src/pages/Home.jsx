import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { API, IMGS } from '../lib/app.js';
import { scrollToId } from '../lib/scroll.js';

export default function Home() {
  const [passes, setPasses] = useState([]);
  useEffect(() => { fetch(API('/api/passes')).then((r) => r.json()).then((d) => setPasses(d.passes || [])).catch(() => setPasses([
    { id: 'single', name: 'Single-Day Garba', priceInr: 299, desc: 'One night entry · single scan, no re-entry' },
    { id: 'season', name: 'Season · 9 Nights', priceInr: 1499, desc: 'All nights · one entry per night' },
    { id: 'couple', name: 'Couple Dandiya', priceInr: 499, desc: '2 people · enter together · 1 scan' },
    { id: 'vip', name: 'VIP Front-Row', priceInr: 2999, desc: 'All nights · one per night · priority lane' },
  ])); }, []);

  return (
    <div>
      {/* HERO — uses hero-durga-eyes (bg) + hero-solo-orange (card) */}
      <section className="relative overflow-hidden">
        <img src={IMGS.heroBg} alt="Happy Navratri" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        <div className="absolute inset-0 bg-gradient-to-b from-night/60 via-maroon/60 to-night" />
        <div className="relative max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-8 items-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}>
            <p className="text-haldi tracking-widest text-sm">✨ 9 NIGHTS · 4 GATES · 5000 DANCERS/NIGHT</p>
            <h1 className="text-5xl font-extrabold leading-tight">Navratri Garba <span className="text-haldi">2026</span></h1>
            <p className="mt-3 text-white/80">Secure QR passes · single-scan entry · no screenshots, no sharing. Dandiya up, worries down.</p>
            <div className="mt-6 flex gap-3">
              <button onClick={() => scrollToId('passes')} className="btn">🎟️ Get Passes</button>
              <a href="#venue" className="btn-ghost">📍 Venue & Gates</a>
            </div>
            <p className="mt-3 text-xs text-white/60">Razorpay test mode · SMS/WhatsApp delivery · Offline-tolerant gates</p>
          </motion.div>
          <motion.img src={IMGS.heroSolo} alt="Garba dancer" className="rounded-3xl border-4 border-haldi/60 shadow-2xl animate-floaty object-cover h-96 w-full" initial={{ scale: 0.95 }} animate={{ scale: 1 }} />
        </div>
      </section>

      {/* PASSES — uses passes-garba-night */}
      <section id="passes" className="max-w-6xl mx-auto px-4 py-12 scroll-mt-24">
        <img src={IMGS.passes} className="rounded-2xl w-full h-44 object-cover border border-white/10" alt="Garba Night" />
        <h2 className="section-title mt-6">Choose your pass <span className="text-haldi">(prices editable)</span></h2>
        <div className="grid md:grid-cols-4 gap-4 mt-6">
          {passes.map((p) => (
            <motion.div key={p.id} whileHover={{ y: -6 }} className="card p-5">
              <h3 className="font-bold">{p.name}</h3>
              <p className="text-3xl font-extrabold text-haldi mt-2">₹{p.priceInr}</p>
              <p className="text-sm text-white/70 mt-1">{p.desc}</p>
              <Link to={`/checkout/${p.id}`} className="btn w-full mt-4 block text-center">Buy</Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* STORY — uses story-durga-dancers (watermarked: replace before prod) */}
      <section className="max-w-6xl mx-auto px-4 py-8 grid md:grid-cols-2 gap-6 items-center">
        <img src={IMGS.story} className="rounded-2xl border border-white/10" alt="Durga and dancers" />
        <div>
          <h2 className="section-title">9 nights of Shakti & rhythm</h2>
          <p className="text-white/70 mt-3">Traditional garba, live dhol, aarti at sundown, then open-floor dandiya till late. Every pass carries a hidden serial + signed QR — screenshot copies die on first scan.</p>
          <p className="text-xs text-white/40 mt-2">Note: illustration is watermarked stock — replace with licensed art before go-live.</p>
        </div>
      </section>

      {/* VENUE — uses venue-aerial-stage */}
      <section id="venue" className="max-w-6xl mx-auto px-4 py-8">
        <img src={IMGS.venue} className="rounded-2xl h-64 w-full object-cover" alt="Venue stage" />
        <h2 className="section-title mt-4">Main Ground · 4 gates</h2>
        <p className="text-white/70">North / South / East / VIP. Peak load ~8 scans/min/gate — each scan answers in &lt;1s, atomic anti-double-entry.</p>
      </section>

      {/* COUPLE UPSELL — uses couple-dandiya-stage */}
      <section className="max-w-6xl mx-auto px-4 py-8 grid md:grid-cols-2 gap-6 items-center">
        <img src={IMGS.couple} className="rounded-2xl h-72 w-full object-cover" alt="Dandiya couple" />
        <div>
          <h2 className="section-title">Bring your partner 🥢</h2>
          <p className="text-white/70">Couple Dandiya: 2 entries, 1 QR, same-time scan. Perfect for garba pairs.</p>
          <Link to="/checkout/couple" className="btn mt-4 inline-block">Get Couple Pass ₹499</Link>
        </div>
      </section>

      {/* GALLERY — uses gal1/2/3 */}
      <section className="max-w-6xl mx-auto px-4 py-8">
        <h2 className="section-title">Last year’s floor 🔥</h2>
        <div className="grid md:grid-cols-3 gap-4 mt-4">
          {[IMGS.gal1, IMGS.gal2, IMGS.gal3].map((s) => (
            <img key={s} src={s} loading="lazy" className="rounded-2xl h-64 w-full object-cover hover:scale-[1.02] transition" alt="Garba gallery" />
          ))}
        </div>
      </section>

      {/* CROWD CTA — uses crowd-ground */}
      <section className="relative mt-8">
        <img src={IMGS.crowd} className="w-full h-72 object-cover opacity-50" alt="Crowd" />
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-night/60">
          <h2 className="section-title text-center">5,000 dancing as one. Will you be in the circle?</h2>
          <button onClick={() => scrollToId('passes')} className="btn mt-4">Book now — from ₹299</button>
        </div>
      </section>
      <footer className="text-center text-xs text-white/40 py-8">Made for Navratri · Vercel + Supabase + Render · Razorpay test mode</footer>
    </div>
  );
}
