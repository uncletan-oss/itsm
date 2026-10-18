import { useEffect, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { frameworks, industries } from '../../../shared/frameworks.mjs';
import { Badge } from '../components/format.jsx';

const TYPE = { regulation: ['Regulasi', 'red'], standard: ['Standar', 'indigo'], best_practice: ['Best practice', 'teal'] };

/** Katalog framework & regulasi per industri. Dalam konteks tenant, industri & framework milik tenant ditandai. */
export default function Governance({ tenantScoped }) {
  const ctx = useOutletContext() || {};
  const info = tenantScoped ? ctx.info : null;
  const [params] = useSearchParams();
  const [industry, setIndustry] = useState(params.get('industri') || 'banking');
  const [open, setOpen] = useState(null);
  useEffect(() => { if (info?.industry) setIndustry(info.industry); }, [info?.industry]);
  const ind = industries.find((i) => i.id === industry) || industries[0];
  const ours = info?.industry === industry && info?.enabledFrameworks?.length ? info.enabledFrameworks : ind.frameworks;
  const list = frameworks.filter((f) => ours.includes(f.id));

  return (
    <div>
      <span className="pub-eyebrow">Tata kelola & kepatuhan</span>
      <h1>{info ? `Framework yang diterapkan ${info.name}` : 'Regulasi & framework per industri'}</h1>
      <p className="muted pub-lead">
        Praktik pengelolaan TI dipetakan ke framework internasional dan regulasi Indonesia. Paket yang berlaku menyesuaikan industri — pilih industri untuk melihat cakupannya.
      </p>
      <div className="pub-industries">
        {industries.map((i) => (
          <button key={i.id} className={`chip-btn ${i.id === industry ? 'active' : ''}`} onClick={() => setIndustry(i.id)}>
            {i.name}{i.id === info?.industry && ' ★'}
          </button>
        ))}
      </div>
      {ind.note && <p className="note small">{ind.note}</p>}
      <div className="pub-grid-3">
        {list.map((f) => (
          <div key={f.id} className="card pub-fw">
            <div className="row between">
              <Badge tone={TYPE[f.type][1]}>{TYPE[f.type][0]}</Badge>
              <span className="muted small">{f.controls.length} kontrol</span>
            </div>
            <b>{f.name}</b>
            <span className="muted small">{f.issuer}</span>
            {f.note && <span className="note small">{f.note}</span>}
            <button className="btn btn-sm" onClick={() => setOpen(open === f.id ? null : f.id)}>{open === f.id ? 'Sembunyikan' : 'Lihat ringkasan kontrol'}</button>
            {open === f.id && (
              <ul className="pub-controls">
                {f.controls.map((c) => <li key={c.code}><code>{c.code}</code> {c.title}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="muted small">Kontrol di atas adalah ringkasan tingkat domain untuk self-assessment internal, bukan salinan naskah resmi regulasi.{info?.industry === industry && ' ★ = industri organisasi ini.'}</p>
    </div>
  );
}
