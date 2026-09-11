# Navratri Garba 2026 — Ticketing + Gate Verification

Solo build · 5k/day · 4 gates · Razorpay · SMS/WhatsApp · Offline scanners · Vercel + Supabase + Render

## Run locally (no DB needed — in-memory demo)
```bash
npm install
cp backend/.env.example backend/.env
npm run dev:backend   # :4000
# new shell:
npm run dev:frontend  # :5173
```
Buy → QR issued instantly (mock Razorpay). Scan at `/scan` (login: gate1/scan123).
Live mode (Razorpay keys set): buy → pay in UPI app → webhook issues QR on `payment.captured`.

## Race test
```bash
npm run test:race
# expects: PASS: exactly one granted
```

## Images (all 11 from Download, renamed)
`frontend/public/img/` — hero-durga-eyes, hero-solo-orange, story-durga-dancers (⚠️ watermark — replace), venue-aerial-stage, passes-garba-night, couple-dandiya-stage, crowd-ground, gallery-circle-night, gallery-men-closeup (credit Bhupendra Rana), gallery-pink-lights, success-couple-cartoon.

## Go live
1. Supabase → SQL editor → run `backend/src/db/schema.sql`
2. `backend: npm run keygen` → set ED25519_* + DATABASE_URL + RAZORPAY_* in Render env
3. Render: deploy `backend/` (start: `node src/index.js`); Vercel: deploy `frontend/` with `VITE_API_URL=https://<render>.onrender.com`
4. Razorpay dashboard → webhook `POST https://<render>/api/webhooks/razorpay` (verify sig), switch to live keys
5. WhatsApp/SMS: set MSG91/Twilio/WA_TOKEN in backend env — `sendPass()` already abstracted
6. Prices: edit `backend/src/routes/passes.js` PASS_TYPES + re-seed `pass_types` table
