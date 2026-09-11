import { generateKeypair } from './qr.js';
let cached = null;
export function getKeys() {
  if (cached) return cached;
  if (process.env.ED25519_PRIVATE_KEY && process.env.ED25519_PUBLIC_KEY) {
    cached = {
      privateKey: process.env.ED25519_PRIVATE_KEY.replace(/\\n/g, '\n'),
      publicKey: process.env.ED25519_PUBLIC_KEY.replace(/\\n/g, '\n'),
    };
    return cached;
  }
  const kp = generateKeypair();
  console.warn('[keys] using EPHEMERAL Ed25519 keypair (set ED25519_* in .env for stable QRs)');
  cached = kp;
  return cached;
}
