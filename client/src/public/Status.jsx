import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { portalHref } from '../links.js';
import { fmtDateTime } from '../components/format.jsx';
import { OVERALL_TEXT, STATUS, StatusPill, overall } from './shared.jsx';

export default function Status() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const load = () => api('/public/status').then(setData).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  if (error) return <div className="pub-wrap pub-section"><div className="alert">{error}</div></div>;
  if (!data) return <div className="pub-wrap pub-section muted">Memuat…</div>;
  const ov = overall(data.services);

  return (
    <div className="pub-wrap pub-section">
      <h1>Status Layanan</h1>
      <div className={`pub-overall pub-overall-${STATUS[ov][1]}`}>
        <span className="big">{STATUS[ov][2]}</span>
        <div>
          <b>{OVERALL_TEXT[ov]}</b>
          <div className="small">Diperbarui {fmtDateTime(data.updatedAt)} · otomatis setiap 60 detik</div>
        </div>
      </div>

      <div className="card pub-status-list">
        {data.services.map((s) => (
          <div key={s._id} className="pub-status-row">
            <div>
              <b>{s.name}</b>
              <div className="muted small">
                {[s.supportHours && `Dukungan ${s.supportHours}`, s.availabilityTarget && `Target ketersediaan ${s.availabilityTarget}%`].filter(Boolean).join(' · ')}
                {s.since && s.status !== 'operational' && ` · sejak ${fmtDateTime(s.since)}`}
              </div>
            </div>
            <StatusPill status={s.status} />
          </div>
        ))}
        {!data.services.length && <p className="muted">Belum ada layanan yang dipublikasikan.</p>}
      </div>

      <h2>Pemeliharaan terjadwal</h2>
      <div className="card">
        {data.maintenance.length ? (
          <table>
            <thead><tr><th>Layanan</th><th>Mulai</th><th>Selesai</th></tr></thead>
            <tbody>
              {data.maintenance.map((m, i) => (
                <tr key={i}><td>{m.service}</td><td>{fmtDateTime(m.plannedStart)}</td><td>{fmtDateTime(m.plannedEnd)}</td></tr>
              ))}
            </tbody>
          </table>
        ) : <p className="muted">Tidak ada pemeliharaan terjadwal.</p>}
      </div>
      <p className="muted small">Mengalami kendala yang belum tercantum? <a href={portalHref('/m/incidents/new')}>Laporkan gangguan melalui portal</a>.</p>
    </div>
  );
}
