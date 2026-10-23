import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import Icon from './Icon.jsx';

export function PageHeader({ icon, title, description, back, actions }) {
  return (
    <div className="page-head">
      <div>
        {back}
        <h1>{icon && <span className="title-icon"><Icon name={icon} /></span>}{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </div>
  );
}

export function Empty({ icon = 'inbox', title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-ic"><Icon name={icon} size="lg" /></span>
      <b>{title}</b>
      {children && <div>{children}</div>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export const SkeletonRows = ({ rows = 5, cols = 5 }) => (
  <tbody>
    {Array.from({ length: rows }, (_, i) => (
      <tr key={i}>{Array.from({ length: cols }, (__, j) => <td key={j}><div className="skeleton" style={{ width: `${50 + ((i + j) % 4) * 12}%` }} /></td>)}</tr>
    ))}
  </tbody>
);

export function Modal({ title, onClose, children, width }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" style={width ? { maxWidth: width } : undefined}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="icon-btn" onClick={onClose} aria-label="Tutup"><Icon name="x" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Popover sederhana: tutup saat klik di luar / Escape. */
export function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map(([k, label, count]) => (
        <button key={k} role="tab" aria-selected={value === k} className={`tab ${value === k ? 'active' : ''}`} onClick={() => onChange(k)}>
          {label}{count != null && <span className="count">{count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------- Toast ----------
const ToastCtx = createContext(() => {});
export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((message, type = 'success') => {
    const id = Math.random();
    setItems((s) => [...s, { id, message, type }]);
    setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), 3800);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}><Icon name={t.type === 'error' ? 'alert' : 'check'} />{t.message}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

export const initials = (name = '') => name.split(/\s+/).filter((w) => /^\p{L}/u.test(w)).slice(0, 2).map((s) => s[0]).join('').toUpperCase();

/** Tema terang/gelap, disimpan per browser. */
export function useTheme() {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem('itsm_theme') || 'light';
    } catch {
      return 'light';
    }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('itsm_theme', theme);
    } catch {
      /* abaikan */
    }
  }, [theme]);
  return [theme, () => setTheme(theme === 'dark' ? 'light' : 'dark')];
}
