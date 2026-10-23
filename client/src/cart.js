import { useCallback, useEffect, useState } from 'react';

/**
 * Keranjang belanja e-katalog per workspace (disimpan di browser pengguna).
 * Harga di keranjang hanya untuk tampilan — server mengunci harga ke katalog terbit saat PR diajukan.
 */
const EVENT = 'itsm-cart';
const keyFor = (ws) => `itsm_cart_${ws || 'default'}`;

function read(ws) {
  try {
    const v = JSON.parse(localStorage.getItem(keyFor(ws)) || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write(ws, items) {
  try {
    localStorage.setItem(keyFor(ws), JSON.stringify(items));
  } catch {
    /* penyimpanan browser tidak tersedia */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: ws }));
}

export const cartLine = (c) => ({
  catalogItem: c._id, sku: c.sku || c.number, name: c.name, unit: c.unit, unitPrice: c.unitPrice, minOrderQty: c.minOrderQty || 1,
  vendor: c.vendor?._id || c.vendor, vendorName: c.vendor?.name || '', category: c.category,
});

export function useCart(ws) {
  const [items, setItems] = useState(() => read(ws));
  useEffect(() => {
    setItems(read(ws));
    const sync = () => setItems(read(ws));
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, [ws]);
  const add = useCallback((line, qty) => {
    const cur = read(ws);
    const i = cur.findIndex((x) => x.catalogItem === line.catalogItem);
    if (i >= 0) cur[i] = { ...cur[i], qty: cur[i].qty + qty };
    else cur.push({ ...line, qty: Math.max(qty, line.minOrderQty || 1) });
    write(ws, cur);
  }, [ws]);
  const setQty = useCallback((id, qty) => write(ws, read(ws).map((x) => (x.catalogItem === id ? { ...x, qty: Math.max(1, qty) } : x))), [ws]);
  const remove = useCallback((id) => write(ws, read(ws).filter((x) => x.catalogItem !== id)), [ws]);
  const clear = useCallback(() => write(ws, []), [ws]);
  const count = items.reduce((s, x) => s + (x.qty || 0), 0);
  const subtotal = items.reduce((s, x) => s + (x.qty || 0) * (x.unitPrice || 0), 0);
  return { items, add, setQty, remove, clear, count, subtotal };
}
