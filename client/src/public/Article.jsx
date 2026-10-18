import { useEffect, useState } from 'react';
import { Link, useOutletContext, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { portalHref } from '../links.js';
import { fmtDate } from '../components/format.jsx';

export default function Article() {
  const { slug } = useOutletContext();
  const { id } = useParams();
  const [a, setA] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/public/t/${slug}/knowledge/${id}`).then(setA).catch((e) => setError(e.message)); }, [id]);

  return (
    <div className="pub-wrap pub-section pub-article">
      <Link to={`/w/${slug}/bantuan`} className="muted">← Pusat Bantuan</Link>
      {error && <div className="alert">{error}</div>}
      {!a && !error && <p className="muted">Memuat…</p>}
      {a && (
        <>
          <h1>{a.title}</h1>
          <p className="muted small">{[a.number, a.category, a.publishedAt && `Terbit ${fmtDate(a.publishedAt)}`].filter(Boolean).join(' · ')}</p>
          <div className="card pre pub-article-body">{a.content}</div>
          <div className="card pub-still">
            <b>Masih butuh bantuan?</b>
            <a className="btn btn-primary" href={portalHref('/m/incidents/new', slug)}>Laporkan ke tim TI</a>
          </div>
        </>
      )}
    </div>
  );
}
