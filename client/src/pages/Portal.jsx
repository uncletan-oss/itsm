import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Portal() {
  const [services, setServices] = useState([]);
  const [kb, setKb] = useState([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    api('/services', { query: { requestable: 'true', status: 'live', limit: 100, sort: 'requestCategory name' } }).then((r) => setServices(r.items)).catch(() => {});
  }, []);
  useEffect(() => {
    const t = setTimeout(() => api('/knowledge', { query: { status: 'published', q, limit: 8 } }).then((r) => setKb(r.items)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const groups = services.reduce((acc, s) => ({ ...acc, [s.requestCategory || 'Lainnya']: [...(acc[s.requestCategory || 'Lainnya'] || []), s] }), {});

  return (
    <div>
      <h1>🛎️ Portal Layanan TI</h1>
      <div className="grid-2">
        <Link to="/m/incidents/new" className="card action-card">
          <div className="big">⚠️</div>
          <div><h3>Laporkan Gangguan</h3><p className="muted">Ada layanan yang tidak berjalan normal? Buat incident.</p></div>
        </Link>
        <div className="card">
          <h3>🔎 Cari solusi mandiri (Knowledge Base)</h3>
          <input type="search" placeholder="mis. reset password" value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="plain">
            {kb.map((a) => <li key={a._id}><Link to={`/m/knowledge/${a._id}`}>{a.title}</Link></li>)}
            {!kb.length && <li className="muted small">Tidak ada artikel</li>}
          </ul>
        </div>
      </div>
      <h2>Katalog Layanan</h2>
      {Object.entries(groups).map(([cat, list]) => (
        <div key={cat}>
          <h3 className="muted">{cat}</h3>
          <div className="catalog">
            {list.map((s) => (
              <Link key={s._id} className="card catalog-item" to={`/m/requests/new?service=${s._id}&title=${encodeURIComponent(s.name)}`}>
                <b>{s.name}</b>
                <span className="muted small">{s.description || 'Ajukan permintaan'}</span>
                {s.requiresApproval && <span className="badge badge-amber">Perlu persetujuan</span>}
              </Link>
            ))}
          </div>
        </div>
      ))}
      {!services.length && <p className="muted">Belum ada layanan yang dapat diminta. Tandai layanan sebagai “Dapat diminta via portal” di Service Catalog.</p>}
      <div className="row">
        <Link className="btn" to="/m/incidents">Incident saya</Link>
        <Link className="btn" to="/m/requests">Permintaan saya</Link>
      </div>
    </div>
  );
}
