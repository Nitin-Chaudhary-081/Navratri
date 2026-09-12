export const API = (p) => (import.meta.env.VITE_API_URL || '') + p;
export const IMGS = {
  logo: '/img/logo-raasrang.jpeg',
  heroBg: '/img/hero-durga-eyes.jpeg',
  heroSolo: '/img/hero-solo-orange.jpeg',
  passes: '/img/passes-garba-night.jpeg',
  story: '/img/story-durga-dancers.jpeg',
  venue: '/img/venue-aerial-stage.jpeg',
  crowd: '/img/crowd-ground.jpeg',
  gal1: '/img/gallery-circle-night.jpeg',
  gal2: '/img/gallery-men-closeup.jpeg',
  gal3: '/img/gallery-pink-lights.jpeg',
  couple: '/img/couple-dandiya-stage.jpeg',
  success: '/img/success-couple-cartoon.jpeg',
};
// Offline queue (IndexedDB-lite via localStorage for solo simplicity + upgrade path to idb)
const QKEY = 'garba_offline_queue';
export const queueScan = (item) => {
  const q = JSON.parse(localStorage.getItem(QKEY) || '[]');
  q.push({ ...item, queuedAt: new Date().toISOString() });
  localStorage.setItem(QKEY, JSON.stringify(q));
};
export const flushQueue = async (token, gateId) => {
  const q = JSON.parse(localStorage.getItem(QKEY) || '[]');
  if (!q.length) return { synced: 0 };
  if (!token) return { synced: 0, error: 'login-required' };
  const r = await fetch(API('/api/scans/bulk-sync'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
    body: JSON.stringify({ items: q, gateId }),
  }).then((r) => r.json()).catch(() => null);
  if (r && !r.error) localStorage.setItem(QKEY, '[]');
  return r || { synced: 0 };
};
