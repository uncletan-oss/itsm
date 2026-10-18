import { useEffect, useState } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { portalHref } from '../links.js';

export default function Help() {
  const { slug } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const [input, setInput] = useState(q);
  const [articles, setArticles] = useState(null);
  const [catalog, setCatalog] = useState([]);
  useEffect(() => { api(`/public/t/${slug}/catalog`).then((r) => setCatalog(r.items)).catch(() => {}); }, []);
  useEffect(() => {
    setInput(q);
    api(`/public/t/${slug}/knowledge`, { query: { q } }).then((r) => setArticles(r.items)).catch(() => setArticles([]));
  }, [q]);

  const groups = catalog.reduce((acc, s) => ({ ...acc, [s.requestCategory || 'Lainnya']: [...(acc[s.requestCategory || 'Lainnya'] || []), s] }), {});

  return (
    <div className="pub-wrap pub-section">
      <h1>Pusat Bantuan</h1>
      <form className="pub-search inline-search" onSubmit={(e) => { e.preventDefault(); setParams(input ? { q: input } : {}); }}>
        <input type="search" placeholder="Cari artikel…" value={input} onChange={(e) => setInput(e.target.value)} />
        <button className="btn btn-primary">Cari</button>
      </form>

      <div className="pub-help-grid">
        <section>
          <h2>{q ? `Hasil untuk “${q}”` : 'Knowledge base'}</h2>
          {articles === null && <p className="muted">Memuat…</p>}
          {articles?.map((a) => (
            <Link key={a._id} to={`/w/${slug}/bantuan/${a._id}`} className="card pub-article-row">
              <b>{a.title}</b>
              <span className="muted small">{[a.number, a.category].filter(Boolean).join(' · ')}</span>
            </Link>
          ))}
          {articles?.length === 0 && (
            <div className="card">
              <p>Tidak ada artikel yang cocok.</p>
              <a className="btn btn-primary" href={portalHref('/m/incidents/new', slug)}>Laporkan ke tim TI</a>
            </div>
          )}
        </section>
        <aside>
          <h2>Katalog layanan</h2>
          <p className="muted small">Pengajuan memerlukan login ke portal.</p>
          {Object.entries(groups).map(([cat, list]) => (
            <div key={cat} className="card">
              <h3>{cat}</h3>
              {list.map((s) => (
                <a key={s._id} className="pub-catalog-row" href={portalHref(`/m/requests/new?service=${s._id}&title=${encodeURIComponent(s.name)}`, slug)}>
                  <span>
                    <b>{s.name}</b>
                    {s.description && <span className="muted small"> — {s.description}</span>}
                  </span>
                  <span className="small">{s.requiresApproval ? '🔒 perlu persetujuan' : 'Ajukan →'}</span>
                </a>
              ))}
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
