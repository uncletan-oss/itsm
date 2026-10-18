import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import Icon from '../components/Icon.jsx';
import { PageHeader } from '../components/ui.jsx';

export default function Portal() {
  const { can } = useAuth();
  const [services, setServices] = useState([]);
  const [kb, setKb] = useState([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    api('/services', { query: { requestable: 'true', status: 'live', limit: 100, sort: 'requestCategory name' } }).then((r) => setServices(r.items)).catch(() => {});
  }, []);
  useEffect(() => {
    const t = setTimeout(() => api('/knowledge', { query: { status: 'published', q, limit: 6 } }).then((r) => setKb(r.items)).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);
  const groups = services.reduce((acc, s) => ({ ...acc, [s.requestCategory || 'Lainnya']: [...(acc[s.requestCategory || 'Lainnya'] || []), s] }), {});

  return (
    <div>
      <PageHeader icon="help" title="Portal Layanan" description="Laporkan gangguan, ajukan permintaan dari katalog, atau temukan solusi mandiri." />
      <div className="grid-2" style={{ marginBottom: 20 }}>
        {can('incidents', 'create') && (
          <Link to="/m/incidents/new" className="card action-card">
            <span className="kpi-ic" style={{ width: 48, height: 48, background: 'var(--red-bg)', color: 'var(--red)' }}><Icon name="alert" size="lg" /></span>
            <div><h3 style={{ margin: 0 }}>Laporkan gangguan</h3><p className="muted small" style={{ margin: '4px 0 0' }}>Layanan tidak berjalan normal? Tim TI akan menangani sesuai SLA.</p></div>
            <Icon name="chevronRight" className="muted" />
          </Link>
        )}
        <div className="card">
          <h3>Cari solusi mandiri</h3>
          <label className="search" style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid var(--border-strong)', borderRadius: 8, padding: '0 10px', color: 'var(--muted)' }}>
            <Icon name="search" size="sm" /><input style={{ border: 0, boxShadow: 'none' }} type="search" placeholder="mis. reset password, VPN" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          {kb.map((a) => <Link key={a._id} to={`/m/knowledge/${a._id}`} className="list-row"><Icon name="book" size="sm" /><span className="list-title">{a.title}</span></Link>)}
          {!kb.length && <p className="muted small">Tidak ada artikel.</p>}
        </div>
      </div>
      <h2>Katalog layanan</h2>
      {Object.entries(groups).map(([cat, list]) => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <div className="nav-title" style={{ color: 'var(--muted)', padding: '0 0 8px' }}>{cat}</div>
          <div className="catalog">
            {list.map((s) => (
              <Link key={s._id} className="card catalog-item" to={`/m/requests/new?service=${s._id}&title=${encodeURIComponent(s.name)}`}>
                <span className="kpi-ic"><Icon name="request" /></span>
                <b>{s.name}</b>
                <span className="muted small">{s.description || 'Ajukan permintaan'}</span>
                {s.requiresApproval && <span className="badge badge-gold" style={{ alignSelf: 'flex-start' }}>Perlu persetujuan</span>}
              </Link>
            ))}
          </div>
        </div>
      ))}
      {!services.length && <p className="muted">Belum ada layanan yang dapat diminta. Tandai layanan sebagai “Dapat diminta via portal” di Service Catalog.</p>}
    </div>
  );
}
