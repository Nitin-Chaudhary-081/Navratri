// Ed25519 QR signing — offline-capable (public key on scanners, private key server-only).
// Payload: v1.<ticketId>.<eventId>.<expUnix>.<nonceB64> . <sigB64url>
import crypto from 'node:crypto';

const b64u = {
  enc: (buf) => Buffer.from(buf).toString('base64url'),
  dec: (s) => Buffer.from(s, 'base64url'),
};

export function generateKeypair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  };
}

export function signPayload({ ticketId, eventId, expUnix, nonce }, privateKeyPem) {
  const body = `v1.${ticketId}.${eventId}.${expUnix}.${nonce}`;
  const sig = crypto.sign(null, Buffer.from(body), crypto.createPrivateKey(privateKeyPem));
  return `${body}.${b64u.enc(sig)}`;
}

export function verifyQrString(qrString, publicKeyPem) {
  try {
    const parts = String(qrString || '').trim().split('.');
    if (parts.length !== 6 || parts[0] !== 'v1') return { ok: false, reason: 'malformed' };
    const [, ticketId, eventId, expStr, nonce, sigB64] = parts;
    const body = `v1.${ticketId}.${eventId}.${expStr}.${nonce}`;
    const ok = crypto.verify(null, Buffer.from(body), crypto.createPublicKey(publicKeyPem), b64u.dec(sigB64));
    if (!ok) return { ok: false, reason: 'bad-signature' };
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() / 1000 > exp) return { ok: false, reason: 'expired', ticketId, eventId };
    return { ok: true, ticketId, eventId, exp, nonce };
  } catch {
    return { ok: false, reason: 'malformed' };
  }
}

export function newSecrets() {
  const serial = crypto.randomUUID(); // hidden secret, server-side only
  const nonce = b64u.enc(crypto.randomBytes(9));
  const serialHash = crypto.createHash('sha256').update(serial).digest('hex');
  return { serial, serialHash, nonce };
}

// CLI: node src/lib/qr.js --keygen
if (process.argv.includes('--keygen')) {
  const kp = generateKeypair();
  console.log('ED25519_PUBLIC_KEY=' + JSON.stringify(kp.publicKey));
  console.log('ED25519_PRIVATE_KEY=' + JSON.stringify(kp.privateKey));
}
