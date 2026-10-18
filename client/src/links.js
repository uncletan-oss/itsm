import { DEMO } from './api.js';

const BASE = import.meta.env.BASE_URL; // mis. "/" atau "/itsm/"

/** URL ke frontend portal (login). path diawali "/" mis. "/m/requests/new". ws = kode workspace untuk prefill login. */
export function portalHref(path = '/', ws) {
  const sep = path.includes('?') ? '&' : '?';
  const p = ws ? `${path}${sep}ws=${encodeURIComponent(ws)}` : path;
  return DEMO ? `${BASE}portal/#${p}` : `${BASE}portal${p === '/' ? '/' : p}`;
}

/** URL ke halaman di situs publik. */
export const publicHref = (path = '/') => (DEMO ? `${BASE}#${path}` : `${BASE}${path.replace(/^\//, '')}`);
