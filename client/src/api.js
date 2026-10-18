const TOKEN_KEY = 'itsm_token';

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const DEMO = import.meta.env.VITE_DEMO === 'true';

// Mode demo (GitHub Pages): request dilayani backend tiruan di browser, tanpa server.
async function demoApi(path, { method = 'GET', body, query } = {}) {
  const { handle } = await import('./demo/server.js');
  try {
    return await handle(method, path, { body, query, token: getToken() });
  } catch (err) {
    if (err.status === 401 && path !== '/auth/login') setToken(null);
    const details = err.details && typeof err.details === 'object' ? Object.values(err.details).join('; ') : '';
    throw new ApiError(err.status || 500, [err.message, details].filter(Boolean).join(': '), err.details);
  }
}

export async function api(path, opts = {}) {
  return DEMO ? demoApi(path, opts) : httpApi(path, opts);
}

async function httpApi(path, { method = 'GET', body, query } = {}) {
  const qs = query ? '?' + new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v != null)) : '';
  const res = await fetch(`/api${path}${qs}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && path !== '/auth/login') {
    setToken(null);
    window.location.href = `${import.meta.env.BASE_URL}portal/`;
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = data.details && typeof data.details === 'object' ? Object.values(data.details).join('; ') : '';
    throw new ApiError(res.status, [data.error, details].filter(Boolean).join(': ') || res.statusText, data.details);
  }
  return data;
}
