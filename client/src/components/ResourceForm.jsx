import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { MODULES } from '../config/modules.js';
import Field, { invalidateOptions } from './Field.jsx';

const idOf = (v) => (v && typeof v === 'object' ? v._id : v);

/** Ubah nilai form (yang mungkin berisi objek ter-populate) menjadi payload API. */
export function toPayload(fields, values) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'readonly' || !(f.key in values)) continue;
    const v = values[f.key];
    if (f.type === 'refs') out[f.key] = (v || []).map(idOf);
    else if (f.type === 'ref' || f.type === 'user') out[f.key] = idOf(v) || null;
    else out[f.key] = v === undefined ? null : v;
  }
  return out;
}

export function FormFields({ fields, values, onChange, isStaff }) {
  return (
    <div className="form-grid">
      {fields
        .filter((f) => f.type !== 'readonly' && (isStaff || !f.staff))
        .map((f) => (
          <label key={f.key} className={`${f.full || f.type === 'textarea' ? 'full' : ''} ${f.type === 'bool' ? 'inline' : ''}`}>
            <span>{f.label}{f.required && <b className="req"> *</b>}</span>
            <Field field={f} value={values[f.key]} onChange={(v) => onChange(f.key, v)} />
          </label>
        ))}
    </div>
  );
}

export default function ResourceForm({ existing, onSaved, onCancel }) {
  const { resource } = useParams();
  const [params] = useSearchParams();
  const mod = MODULES[resource];
  const navigate = useNavigate();
  const { isStaff } = useAuth();
  const [values, setValues] = useState(() => existing || Object.fromEntries(params.entries()));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (existing) setValues(existing); }, [existing]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = toPayload(mod.fields, values);
      if (!existing) for (const k of Object.keys(body)) if (body[k] === null || (Array.isArray(body[k]) && !body[k].length)) delete body[k];
      const saved = existing
        ? await api(`/${resource}/${existing._id}`, { method: 'PUT', body })
        : await api(`/${resource}`, { method: 'POST', body });
      invalidateOptions(resource);
      if (onSaved) onSaved(saved);
      else navigate(`/m/${resource}/${saved._id}`, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      {!existing && <h1>{mod.icon} {mod.label} baru</h1>}
      {error && <div className="alert">{error}</div>}
      <FormFields fields={mod.fields} values={values} isStaff={isStaff} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
      <div className="row end">
        <button type="button" className="btn" onClick={() => (onCancel ? onCancel() : navigate(-1))}>Batal</button>
        <button className="btn btn-primary" disabled={saving}>{saving ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </form>
  );
}
