import { DEMO } from './api.js';

const BASE = import.meta.env.BASE_URL; // mis. "/" atau "/itsm/"

/** URL ke halaman di frontend portal (login). path diawali "/" mis. "/m/requests/new". */
export const portalHref = (path = '/') => (DEMO ? `${BASE}portal/#${path}` : `${BASE}portal${path === '/' ? '/' : path}`);

/** URL ke halaman di situs publik. */
export const publicHref = (path = '/') => (DEMO ? `${BASE}#${path}` : `${BASE}${path.replace(/^\//, '')}`);
