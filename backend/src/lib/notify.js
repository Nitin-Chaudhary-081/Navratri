// Ticket delivery: thank-you message + ticket on the buyer's own channel.
// Providers activate purely by env keys; without keys everything logs to
// console (demo mode) so nothing breaks. No new npm deps — plain fetch.
const FRONTEND = (process.env.FRONTEND_URL || 'http://localhost:5173').split(',')[0].trim();

export const ticketUrl = (ticketId) => `${FRONTEND}/t/${ticketId}`;

function thankYouText({ holderName, passName, ticketId }) {
  return (
    `🙏 Dhanyavaad ${holderName}! Your Navratri Garba 2026 pass is confirmed.\n\n` +
    `🎟️ ${passName}\n🎫 Ticket: ${ticketId}\n\n` +
    `👉 Open your ticket here (tap Save as PDF before coming):\n${ticketUrl(ticketId)}\n\n` +
    `📍 Main Ground · 7 PM onwards · phone brightness full at gate · one scan per pass.\nSee you in the circle! 🥁`
  );
}

function thankYouHtml({ holderName, passName, ticketId }) {
  const url = ticketUrl(ticketId);
  return (
    `<div style="font-family:sans-serif;max-width:520px;margin:auto;background:#1a0b12;color:#fff;border-radius:16px;overflow:hidden">` +
    `<div style="background:linear-gradient(90deg,#FFB300,#E91E63,#0B6E5F);height:8px"></div>` +
    `<div style="padding:24px"><p>🙏 Dhanyavaad <b>${escapeHtml(holderName)}</b>!</p>` +
    `<h2 style="color:#FFB300">Your Navratri Garba 2026 pass is confirmed 🎉</h2>` +
    `<p>🎟️ <b>${escapeHtml(passName)}</b><br/>🎫 Ticket: <b>${escapeHtml(ticketId)}</b></p>` +
    `<p><a href="${url}" style="display:inline-block;background:#FFB300;color:#000;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:bold">🎫 Open my ticket + Save PDF</a></p>` +
    `<p style="font-size:13px;color:#ccc">Your QR code is attached to this email too. 📍 Main Ground · 7 PM onwards · brightness full at gate · one scan per pass.</p>` +
    `</div><div style="background:linear-gradient(90deg,#FFB300,#E91E63,#0B6E5F);height:8px"></div></div>`
  );
}
function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

// Normalize Indian mobiles: "+91 98765-43210" -> "919876543210"
function intlPhone(to) {
  let d = String(to || '').replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d;
}

async function sendEmail({ to, subject, html, qrPng, ticketId }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || 'Navratri Garba 2026 <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
      attachments: qrPng ? [{ filename: `${ticketId}.png`, content: Buffer.from(qrPng).toString('base64') }] : [],
    }),
  });
  if (!r.ok) throw new Error('Resend failed: ' + (await r.text()).slice(0, 200));
  return { queued: true, channel: 'email', provider: 'resend' };
}

async function sendWhatsApp({ to, holderName, passName, ticketId }) {
  // Requires a Meta WhatsApp Cloud API number + an approved template with 4
  // body variables: 1) name 2) pass 3) ticket id 4) ticket link. See DEPLOY.md.
  const url = `${process.env.WA_API_VERSION || 'v22.0'}`;
  const r = await fetch(`https://graph.facebook.com/${url}/${process.env.WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.WA_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: intlPhone(to),
      type: 'template',
      template: {
        name: process.env.WA_TEMPLATE || 'navratri_pass',
        language: { code: process.env.WA_TEMPLATE_LANG || 'en' },
        components: [{
          type: 'body',
          parameters: [
            { type: 'text', text: holderName },
            { type: 'text', text: passName },
            { type: 'text', text: ticketId },
            { type: 'text', text: ticketUrl(ticketId) },
          ],
        }],
      },
    }),
  });
  if (!r.ok) throw new Error('WhatsApp failed: ' + (await r.text()).slice(0, 200));
  return { queued: true, channel: 'whatsapp', provider: 'whatsapp-cloud' };
}

async function sendGmail({ to, subject, html, qrPng, ticketId }) {
  // Gmail SMTP with an App Password (Google Account → 2-Step → App passwords).
  // Needs GMAIL_USER (the Gmail address) + GMAIL_APP_PASS (spaces optional).
  const nodemailer = (await import('nodemailer')).default;
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: process.env.GMAIL_USER,
      pass: String(process.env.GMAIL_APP_PASS || '').replace(/\s/g, ''),
    },
  });
  await transporter.sendMail({
    from: `"Navratri Garba 2026" <${process.env.GMAIL_USER}>`,
    to,
    subject,
    html,
    attachments: qrPng ? [{ filename: `${ticketId}.png`, content: Buffer.from(qrPng) }] : [],
  });
  return { queued: true, channel: 'email', provider: 'gmail' };
}

export async function sendPass({ to, channel = 'whatsapp', ticketId, passType, holderName, qrDataUrl, qrPng }) {
  const subject = `🎉 Your Navratri Garba 2026 ticket ${ticketId} is here!`;
  try {
    if (channel === 'email' && process.env.GMAIL_USER && process.env.GMAIL_APP_PASS) {
      return await sendGmail({ to, subject, html: thankYouHtml({ holderName, passName: passType, ticketId }), qrPng, ticketId });
    }
    if (channel === 'email' && process.env.RESEND_API_KEY) {
      return await sendEmail({ to, subject, html: thankYouHtml({ holderName, passName: passType, ticketId }), qrPng, ticketId });
    }
    if (channel === 'whatsapp' && process.env.WA_TOKEN && process.env.WA_PHONE_ID) {
      return await sendWhatsApp({ to, holderName, passName: passType, ticketId });
    }
    // Anything else (or missing keys) falls through to console log — issuance never fails.
  } catch (err) {
    console.error(`[notify:${channel}] provider error, falling back to log:`, err.message);
  }
  console.log(`[notify:${channel}] to=${to}\n` + thankYouText({ holderName, passName: passType, ticketId }) + (qrDataUrl ? '\n(qr attached)' : ''));
  return { queued: false, channel, logged: true };
}
