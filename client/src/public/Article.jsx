import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { portalHref } from '../links.js';
import { fmtDate } from '../components/format.jsx';

export default function Article() {
  const { id } = useParams();
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/public/knowledge/${id}`).then(setA).catch((e) => setError(e.message)); }, [id]);

  return (
    <div className="pub-wrap pub-section pub-article">
      <Link to="/bantuan" className="muted">← Pusat Bantuan</Link>
      {error && <div className="alert">{error}</div>}
      {!a && !error && <p className="muted">Memuat…</p>}
      {a && (
        <>
          <h1>{a.title}</h1>
          <p className="muted small">{[a.number, a.category, a.publishedAt && `Terbit ${fmtDate(a.publishedAt)}`].filter(Boolean).join(' · ')}</p>
          <div className="card pre pub-article-body">{a.content}</div>
          <div className="card pub-still">
            <b>Masih butuh bantuan?</b>
            <a className="btn btn-primary" href={portalHref('/m/incidents/new')}>Laporkan ke tim TI</a>
          </div>
        </>
      )}
    </div>
  );
}
