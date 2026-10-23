import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { hasRole, isSupplier, PLATFORM_ROLE } from '../../shared/roles.mjs';
import { canPage as canPageFn } from '../../shared/permissions.mjs';

const AuthCtx = createContext(null);
const WS_KEY = 'itsm_workspace';

export const lastWorkspace = () => {
  try {
    return localStorage.getItem(WS_KEY) || '';
  } catch {
    return '';
  }
};

/** Sesi = user + tenant (workspace) + matriks hak akses efektif dari server. */
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  const refresh = useCallback(async () => {
    const s = await api('/auth/me');
    setSession(s);
    return s;
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    refresh()
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, [refresh]);

  const loginWithToken = async (token, workspace) => {
    setToken(token);
    try {
      if (workspace !== undefined) localStorage.setItem(WS_KEY, workspace);
    } catch {
      /* abaikan */
    }
    return refresh();
  };
  const login = async (workspace, email, password) => {
    const { token } = await api('/auth/login', { method: 'POST', body: { workspace, email, password } });
    return loginWithToken(token, workspace);
  };
  const logout = () => {
    setToken(null);
    setSession(null);
  };

  const user = session?.user || null;
  const perms = session?.permissions || {};
  const value = {
    session, user, tenant: session?.tenant || null, permissions: perms, loading, login, loginWithToken, logout, refresh,
    hasRole: (...roles) => !!user && hasRole(user, roles.flat()),
    isPlatform: !!user && !session?.tenant && user.roles.includes(PLATFORM_ROLE),
    isStaff: !!user && !isSupplier(user) && user.roles.some((r) => r !== 'requester'),
    isSupplier: isSupplier(user),
    /** can('incidents', 'write') — mengikuti matriks efektif tenant (termasuk batas paket). */
    can: (resource, action = 'read') => !!user && !!perms[resource]?.enabled && hasRole(user, perms[resource][action]),
    enabled: (resource) => !!perms[resource]?.enabled,
    canPage: (page) => !!user && canPageFn(user, page),
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
