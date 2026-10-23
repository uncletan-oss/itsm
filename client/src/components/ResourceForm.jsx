import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { FORM_SECTIONS, MODULES } from '../config/modules.js';
import Field, { invalidateOptions } from './Field.jsx';
import Icon from './Icon.jsx';
import { PageHeader, useToast } from './ui.jsx';

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
            {f.type === 'bool' ? (
              <><Field field={f} value={values[f.key]} onChange={(v) => onChange(f.key, v)} /><span>{f.label}</span></>
            ) : (
              <>
                <span>{f.label}{f.required && <b className="req"> *</b>}</span>
                <Field field={f} value={values[f.key]} onChange={(v) => onChange(f.key, v)} />
              </>
            )}
          </label>
        ))}
    </div>
  );
}

/** Kelompokkan field ke dalam bagian formulir yang bermakna. */
export function sectionsFor(resource, fields) {
  const defs = FORM_SECTIONS[resource];
  if (!defs) return [[null, fields]];
  const used = new Set(defs.flatMap(([, keys]) => keys));
  const out = defs.map(([title, keys]) => [title, keys.map((k) => fields.find((f) => f.key === k)).filter(Boolean)]);
  const rest = fields.filter((f) => !used.has(f.key));
  if (rest.length) out.push(['Detail lainnya', rest]);
  return out.filter(([, fs]) => fs.length);
}

export default function ResourceForm({ existing, onSaved, onCancel }) {
  const { resource } = useParams();
  const [params] = useSearchParams();
  const mod = MODULES[resource];
  const navigate = useNavigate();
  const toast = useToast();
  const { isStaff } = useAuth();
  const spawnFrom = params.get('_spawn'); // "sumber:id" dari aksi Buat terkait
  const [values, setValues] = useState(() => existing || Object.fromEntries([...params.entries()].filter(([k]) => !k.startsWith('_'))));
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (existing) setValues(existing); }, [existing]);
  useEffect(() => {
    if (existing || !spawnFrom) return;
    const [src, srcId] = spawnFrom.split(':');
    api(`/${src}/${srcId}/spawn/${resource}`).then((prefill) => setValues((v) => ({ ...prefill, ...v }))).catch((e) => setError(e.message));
  }, [spawnFrom, resource, existing]);

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body = toPayload(mod.fields, values);
      if (!existing) for (const k of Object.keys(body)) if (body[k] === null || (Array.isArray(body[k]) && !body[k].length)) delete body[k];
      // Penawaran tersegel: harga tidak dikirim balik (tidak dapat diubah sebelum pembukaan)
      if (existing?.sealed) for (const k of ['items', 'taxRate', 'vendor', 'rfq']) delete body[k];
      const saved = existing
        ? await api(`/${resource}/${existing._id}`, { method: 'PUT', body })
        : await api(`/${resource}`, { method: 'POST', body: spawnFrom ? { ...body, _spawnFrom: spawnFrom } : body });
      invalidateOptions(resource);
      toast(existing ? 'Perubahan disimpan' : `${mod.label} ${saved.number || ''} dibuat`);
      if (onSaved) onSaved(saved);
      else navigate(`/m/${resource}/${saved._id}`, { replace: true });
    } catch (err) {
      setError(err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const visible = mod.fields.filter((f) => f.type !== 'readonly' && (isStaff || !f.staff));
  return (
    <div>
      {!existing && <PageHeader icon={mod.icon} title={`${mod.label} baru`} description={mod.description}
        back={<a className="eyebrow" href="#back" onClick={(e) => { e.preventDefault(); navigate(-1); }}><Icon name="arrowLeft" size="sm" />Kembali</a>} />}
      <form className="card flush" onSubmit={submit}>
        {error && <div style={{ padding: '16px 20px 0' }}><div className="alert"><Icon name="alert" size="sm" />{error}</div></div>}
        {sectionsFor(resource, visible).map(([title, fs]) => (
          <section key={title || 'main'} className="form-section">
            {title && <h3>{title}</h3>}
            <FormFields fields={fs} values={values} isStaff={isStaff} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />
          </section>
        ))}
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => (onCancel ? onCancel() : navigate(-1))}>Batal</button>
          <button className="btn btn-primary" disabled={saving}><Icon name="check" size="sm" />{saving ? 'Menyimpan…' : 'Simpan'}</button>
        </div>
      </form>
    </div>
  );
}
