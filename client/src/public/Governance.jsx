import { useEffect, useState } from 'react';
import { frameworks, industries } from '../../../shared/frameworks.mjs';
import { Badge } from '../components/format.jsx';

const TYPE = { regulation: ['Regulasi', 'red'], standard: ['Standar', 'indigo'], best_practice: ['Best practice', 'teal'] };

export default function Governance({ info }) {
  const [industry, setIndustry] = useState('general');
  const [open, setOpen] = useState(null);
  useEffect(() => { if (info?.industry) setIndustry(info.industry); }, [info?.industry]);
  const ind = industries.find((i) => i.id === industry);
  const ours = info?.industry === industry && info?.enabledFrameworks?.length ? info.enabledFrameworks : ind.frameworks;
  const list = frameworks.filter((f) => ours.includes(f.id));

  return (
    <div className="pub-wrap pub-section">
      <h1>Tata Kelola & Kepatuhan</h1>
      <p className="muted pub-lead">
        Platform ini memetakan praktik pengelolaan TI ke framework internasional dan regulasi Indonesia. Paket yang berlaku
        menyesuaikan industri — pilih industri untuk melihat cakupannya.
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
            <button className="btn small" onClick={() => setOpen(open === f.id ? null : f.id)}>{open === f.id ? 'Sembunyikan' : 'Lihat ringkasan kontrol'}</button>
            {open === f.id && (
              <ul className="pub-controls">
                {f.controls.map((c) => <li key={c.code}><code>{c.code}</code> {c.title}</li>)}
              </ul>
            )}
          </div>
        ))}
      </div>
      <p className="muted small">
        Kontrol di atas adalah ringkasan tingkat domain untuk self-assessment internal, bukan salinan naskah resmi regulasi.
        {info?.industry === industry && ' ★ = industri organisasi ini.'}
      </p>
    </div>
  );
}
