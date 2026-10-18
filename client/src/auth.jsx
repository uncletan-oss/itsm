import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from './api.js';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api('/auth/me')
      .then(setUser)
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { token, user: u } = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(token);
    setUser(u);
  };
  const logout = () => {
    setToken(null);
    setUser(null);
  };
  const hasRole = (...roles) => !!user && (user.roles.includes('admin') || roles.flat().some((r) => user.roles.includes(r)));
  const isStaff = !!user && user.roles.some((r) => r !== 'requester');

  return <AuthCtx.Provider value={{ user, loading, login, logout, hasRole, isStaff }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
