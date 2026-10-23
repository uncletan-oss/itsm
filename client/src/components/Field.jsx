import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { MODULES } from '../config/modules.js';
import { refLabel } from './format.jsx';

const cache = {};
function useOptions(path) {
  const [items, setItems] = useState(cache[path] || []);
  useEffect(() => {
    if (cache[path]) return;
    let live = true;
    api(path, { query: { limit: 200 } })
      .then((r) => {
        cache[path] = r.items;
        if (live) setItems(r.items);
      })
      .catch(() => {});
    return () => { live = false; };
  }, [path]);
  return items;
}
export const invalidateOptions = (resource) => { delete cache[`/${resource}`]; };

const idOf = (v) => (v && typeof v === 'object' ? v._id : v || '');
const toLocalInput = (v, withTime) => {
  if (!v) return '';
  const d = new Date(v);
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return withTime ? `${date}T${pad(d.getHours())}:${pad(d.getMinutes())}` : date;
};

function RefSelect({ path, value, onChange, multiple, labelField }) {
  const items = useOptions(path);
  const label = (it) => (labelField && !it.number ? it[labelField] : refLabel(it));
  if (multiple) {
    const selected = (value || []).map(idOf);
    return (
      <select multiple value={selected} onChange={(e) => onChange([...e.target.selectedOptions].map((o) => o.value))} size={Math.min(6, items.length || 2)}>
        {items.map((it) => <option key={it._id} value={it._id}>{label(it)}</option>)}
      </select>
    );
  }
  return (
    <select value={idOf(value)} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">— pilih —</option>
      {items.map((it) => <option key={it._id} value={it._id}>{label(it)}</option>)}
    </select>
  );
}

/** Editor baris (mis. rincian PO, baris jurnal) — sub-field: text | number | select. */
function LinesEditor({ field, value, onChange }) {
  const rows = Array.isArray(value) ? value : [];
  const cols = field.lines.filter((l) => !l.hidden);
  const set = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const sum = (k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
  const numeric = field.lines.filter((l) => l.type === 'number' && /debit|credit/.test(l.key));
  return (
    <div className="lines">
      <table>
        <thead><tr>{cols.map((l) => <th key={l.key}>{l.label}</th>)}<th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {cols.map((l) => (
                <td key={l.key}>
                  {l.type === 'select' ? (
                    <select value={r[l.key] ?? ''} onChange={(e) => set(i, l.key, e.target.value)}>
                      <option value="">—</option>
                      {l.options.map(([k, lab]) => <option key={k} value={k}>{k} · {lab}</option>)}
                    </select>
                  ) : (
                    <input type={l.type === 'number' ? 'number' : 'text'} step="any" value={r[l.key] ?? ''} onChange={(e) => set(i, l.key, l.type === 'number' ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)} />
                  )}
                </td>
              ))}
              <td><button type="button" className="btn btn-ghost btn-sm" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Hapus baris">×</button></td>
            </tr>
          ))}
          {numeric.length > 0 && rows.length > 0 && (
            <tr className="lines-total">
              {cols.map((l) => <td key={l.key}>{numeric.includes(l) ? sum(l.key).toLocaleString('id-ID') : ''}</td>)}<td />
            </tr>
          )}
        </tbody>
      </table>
      <button type="button" className="btn btn-sm" onClick={() => onChange([...rows, {}])}>+ Tambah baris</button>
    </div>
  );
}

export default function Field({ field, value, onChange }) {
  const { type } = field;
  if (type === 'lines') return <LinesEditor field={field} value={value} onChange={onChange} />;
  if (type === 'textarea') return <textarea rows={field.rows || 4} value={value || ''} onChange={(e) => onChange(e.target.value)} />;
  if (type === 'number') return <input type="number" step="any" value={value ?? ''} onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />;
  if (type === 'date') return <input type="date" value={toLocalInput(value)} onChange={(e) => onChange(e.target.value || null)} />;
  if (type === 'datetime')
    return <input type="datetime-local" value={toLocalInput(value, true)} onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)} />;
  if (type === 'bool') return <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
  if (type === 'select')
    return (
      <select value={value ?? ''} onChange={(e) => onChange(field.number && e.target.value !== '' ? Number(e.target.value) : e.target.value)}>
        {!field.options.some(([k]) => k === '') && <option value="">— pilih —</option>}
        {field.options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
    );
  if (type === 'tags')
    return <input type="text" placeholder="pisahkan dengan koma" value={(value || []).join(', ')} onChange={(e) => onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean))} />;
  if (type === 'user') return <RefSelect path="/users" value={value} onChange={onChange} labelField="name" />;
  if (type === 'ref' || type === 'refs')
    return <RefSelect path={`/${field.resource}`} value={value} onChange={onChange} multiple={type === 'refs'} labelField={field.labelField || MODULES[field.resource]?.titleField} />;
  return <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} />;
}
