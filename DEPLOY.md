# DEPLOY.md — Production setup for Navratri Garba 2026 (solo, free tier)

Target: frontend on **Vercel**, backend on **Render**, DB on **Supabase**, payments **Razorpay**, delivery **SMS/WhatsApp**.

## 0. What you need (accounts + secrets checklist)

| # | Item | Where | Cost |
|---|------|-------|------|
| 1 | Supabase account + project | supabase.com | free (500 MB, pauses if idle 7d — unpause before event) |
| 2 | Render account | render.com | free (sleeps after 15 min idle — keep-alive below) |
| 3 | Vercel account | vercel.com | free |
| 4 | Razorpay account (KYC for live; test mode instant) | razorpay.com | free test mode, ~2% + GST per live txn |
| 5 | Resend (email fallback) | resend.com | free 100 mails/day |
| 6 | MSG91 or Twilio (SMS) + WhatsApp Cloud API (Meta dev account) | — | pay-as-you-go; SMS ~₹0.15–0.30/msg |
| 7 | GitHub account (connects all three hosts) | github.com | free |

Push this repo to GitHub first — Render/Vercel both deploy from git.

## 1. Database (Supabase) — 10 min
1. New project → region **Mumbai (ap-south-1)** → save DB password.
2. SQL Editor → paste + run `backend/src/db/schema.sql`.
3. Rotate gate keys (don't ship `dev-gate-*`):
   ```bash
   node -e "for(const k of ['GATE1-xxxx','GATE2-xxxx','GATE3-xxxx','GATE4-xxxx']) console.log(k, require('crypto').createHash('sha256').update(k).digest('hex'))"
   ```
   Then in SQL: `update gates set key_hash='<hex>' where id='gate-north';` (×4). Save the 4 plaintext keys — each gate phone gets one.
4. Create real operator logins: after backend is live, log in to `/admin` → Gate operators → revoke the four demo accounts (`gate1..gate4` / `scan123`) and add one login per person (e.g. `aarti-north`). Scanner access = login only; revoked operators are rejected even with a valid token.
4. Project → Connect → copy **URI** connection string → that's `DATABASE_URL`.

## 2. Signing keys — 2 min
```bash
yarn workspace backend keygen
```
Paste the two PEMs into Render env (newlines as `\n`). Keep a copy offline — losing the private key invalidates every issued QR.

## 3. Backend (Render) — 10 min
New → Blueprint → this repo (`render.yaml` is ready) **or** manual Web Service:
rootDir `backend`, build `yarn install --frozen-lockfile`, start `node src/index.js`, plan **Free**, health check `/api/health`.
Fill env from `backend/.env.production.example`. **Never set `ALLOW_ANY_GATE`.**
Verify: `https://<you>.onrender.com/api/health` → `{"ok":true,"mode":"postgres"}`. Mode must say **postgres**, not memory.

## 4. Frontend (Vercel) — 5 min
Import repo → root directory `frontend` → env `VITE_API_URL=https://<you>.onrender.com` → Deploy. (`vercel.json` already handles SPA routes + PWA.)
Then set backend `FRONTEND_URL=https://<your-app>.vercel.app` and redeploy backend (locks CORS).

## 5. Razorpay — test today, live later
1. Test keys (`rzp_test_*`) → Render env → buy a ₹299 pass → scan it at `/scan` → rescan → expect `duplicate`.
2. Dashboard → Webhooks → `https://<render>/api/webhooks/razorpay`, secret → Render `RAZORPAY_WEBHOOK_SECRET`, events `payment.captured, payment.failed`.
3. **Live money is safe by design:** tickets are issued ONLY by the webhook on `payment.captured` (idempotent — retries can't double-issue). Unpaid/cancelled orders never produce QRs. After the Razorpay popup reports success, the site polls `GET /api/passes/order/:id` until the pass lands (~seconds), then shows the QRs.
4. Complete KYC → swap to live keys.

## 6. Ticket delivery (thank-you + ticket on WhatsApp/email)
Without keys, delivery only logs to the Render console — buyers still get QRs on the success screen, so don't block launch on this.
1. **Email:** Gmail App Password for testing (`GMAIL_USER` + `GMAIL_APP_PASS` — Google Account → 2-Step → App passwords), or Resend for production (`RESEND_API_KEY` + verified `RESEND_FROM`, free 100/day). Buyers get a festive HTML thank-you + QR PNG attached + ticket link.
2. **WhatsApp:** Meta developer account → WhatsApp Cloud API number → create template `navratri_pass` with 4 body variables in order (buyer name, pass name, ticket id, ticket link), get it approved → set `WA_TOKEN` + `WA_PHONE_ID` (+ `WA_TEMPLATE` if named differently).
3. **IMPORTANT:** set backend `FRONTEND_URL` to your Vercel URL — ticket links are built from it. Test by buying with your own number/email.
4. After adding `qr_string` to `schema.sql`: existing Supabase DBs just re-run the file (the `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` is safe).

## 7. Pre-event dry run (do this, solo, 1 evening)
- [ ] `node backend/tests/double-scan.js` against prod URL (`BASE=...`) → PASS
- [ ] 4 phones open `/scan`, one gate key each, airplane-mode one phone → scan → reconnect → ⇅ Sync → admin shows conflict-free log
- [ ] Admin `/admin` login works, lookup + CSV path works
- [ ] Export paper backup: `select ticket_id, holder_name from tickets where status='unused'` → print per gate
- [ ] Unpause Supabase, hit Render URL once (wake from sleep) 1 hr before gates open; free Render cold-starts ~30–60 s
- [ ] Replace watermarked `story-durga-dancers.jpeg` + credit `gallery-men-closeup.jpeg` before public launch

## Free-tier limits that can bite on event day
- **Render free sleeps** after 15 min idle → first scan of the day waits ~1 min. Mitigate: free cron ping every 10 min on event days, or $7/mo Starter.
- **Supabase free pauses** after 7 days idle + 500 MB cap → 5k/day × 4 days ≈ 50k rows ≈ well under cap; unpause day-before.
- **Vercel free** 100 GB bandwidth — 11 local images ≈ 0.5 MB/visit → fine to ~100k visits.
- Peak math: 5k people / 4 gates / 3-hr window ≈ **7 scans/min/gate** — trivial for one Render instance + Supabase.
