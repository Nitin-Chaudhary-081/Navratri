// Ticket issuance — single place used by instant (mock/test) checkout
// AND by the Razorpay webhook after payment.captured (live mode).
import crypto from 'node:crypto';
import QRCode from 'qrcode';
import { signPayload, newSecrets } from './qr.js';
import { getKeys } from './keys.js';
import { store } from './store.js';
import { sendPass } from './notify.js';

export async function issueTickets({ pass, qty, name, contact, channel }) {
  const eventId = process.env.EVENT_ID || 'navratri-2026';
  const expUnix = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 12;
  const issued = [];
  for (let i = 0; i < qty; i++) {
    const ticketId = 'NVR-' + crypto.randomBytes(3).toString('hex').toUpperCase();
    const { serialHash, nonce } = newSecrets();
    const qrString = signPayload({ ticketId, eventId, expUnix, nonce }, getKeys().privateKey);
    await store.createTicket({ ticketId, eventId, passType: pass.id, serialHash, qrString, holder: { name, contact }, uses: pass.uses, maxUses: pass.uses });
    const qrDataUrl = await QRCode.toDataURL(qrString, { width: 512, margin: 1 });
    const qrPng = await QRCode.toBuffer(qrString, { width: 512, margin: 1 });
    await sendPass({ to: contact, channel, ticketId, holderName: name, qrDataUrl, qrPng, passType: pass.name });
    issued.push({ ticketId, qrString, qrDataUrl });
  }
  return issued;
}
