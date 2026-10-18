import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { MODULES } from '../config/modules.js';
import { STATUS_LABELS } from '../config/labels.js';
import { Badge, FormatValue, fmtDateTime } from './format.jsx';
import ResourceForm, { FormFields, toPayload } from './ResourceForm.jsx';

const transitionLabel = (from, to) => {
  if (to === 'in_progress' && ['resolved', 'pending'].includes(from)) return from === 'resolved' ? 'Buka kembali' : 'Lanjutkan';
  if (to === 'draft' && from !== 'draft') return 'Kembalikan ke Draft';
  return `→ ${STATUS_LABELS[to] || to}`;
};

export default function ResourceDetail() {
  const { resource, id } = useParams();
  const mod = MODULES[resource];
  const navigate = useNavigate();
  const { user, hasRole, isStaff } = useAuth();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [transition, setTransition] = useState(null);

  const load = useCallback(() => {
    api(`/${resource}/${id}`).then(setDoc).catch((e) => setError(e.message));
  }, [resource, id]);
  useEffect(load, [load]);

  if (error && !doc) return <div className="alert">{error}</div>;
  if (!doc) return <div className="muted">Memuat…</div>;

  const canWrite = hasRole(mod.write);
  const mine = [doc.requester?._id, doc.createdBy].includes(user._id);
  let transitions = doc.allowedTransitions || [];
  if (!canWrite) transitions = mine ? transitions.filter((t) => ['cancelled', 'closed', 'in_progress'].includes(t)) : [];
  if (resource === 'requests' && String(doc.approver?._id) === String(user._id)) {
    transitions = [...new Set([...transitions, ...(doc.allowedTransitions || []).filter((t) => ['approved', 'rejected'].includes(t))])];
  }
  if (resource === 'changes') transitions = transitions.filter((t) => !(doc.status === 'cab_review' && ['approved', 'rejected'].includes(t)));

  const act = async (fn) => {
    setError('');
    try {
      await fn();
      setTransition(null);
      load();
    } catch (e) {
      setError(e.message);
    }
  };
  const remove = () =>
    window.confirm('Hapus data ini secara permanen?') &&
    act(async () => {
      await api(`/${resource}/${id}`, { method: 'DELETE' });
      navigate(`/m/${resource}`);
    });

  const title = doc[mod.titleField] || doc.title || doc.name;
  const visibleFields = mod.fields.filter((f) => isStaff || !f.staff);

  return (
    <div>
      <div className="page-head">
        <div>
          <Link to={`/m/${resource}`} className="muted">← {mod.plural}</Link>
          <h1>{doc.number && <span className="muted">{doc.number} · </span>}{title}</h1>
          <div className="row">
            {doc.status && <FormatValue name="status" value={doc.status} />}
            {doc.priority && typeof doc.priority === 'number' && <FormatValue name="priority" value={doc.priority} />}
            {doc.slaStatus && doc.slaStatus !== 'none' && <FormatValue name="slaStatus" value={doc.slaStatus} />}
            {doc.majorIncident && <Badge tone="red">MAJOR</Badge>}
            {doc.securityIncident && <Badge tone="orange">SECURITY</Badge>}
            {doc.regulatoryReportable && !doc.regulatorReportedAt && <Badge tone="red">Wajib lapor regulator</Badge>}
          </div>
        </div>
        <div className="row wrap end">
          {transitions.map((t) => (
            <button key={t} className={`btn ${['cancelled', 'rejected'].includes(t) ? 'btn-danger' : ''}`} onClick={() => setTransition(t)}>
              {transitionLabel(doc.status, t)}
            </button>
          ))}
          {canWrite && !editing && <button className="btn btn-primary" onClick={() => setEditing(true)}>Edit</button>}
          {hasRole('admin') && !mod.write.includes('*') && !['incidents', 'requests', 'changes', 'problems'].includes(resource) && (
            <button className="btn btn-danger" onClick={remove}>Hapus</button>
          )}
        </div>
      </div>
      {error && <div className="alert">{error}</div>}

      {transition && <TransitionPanel mod={mod} doc={doc} to={transition} onCancel={() => setTransition(null)} onSubmit={(body) => act(() => api(`/${resource}/${id}/transition`, { method: 'POST', body: { to: transition, ...body } }))} isStaff={isStaff} />}

      {resource === 'changes' && <CabPanel doc={doc} canApprove={hasRole('cab_member', 'change_manager')} act={act} />}

      {editing ? (
        <ResourceForm existing={doc} onSaved={() => { setEditing(false); load(); }} onCancel={() => setEditing(false)} />
      ) : (
        <div className="detail-layout">
          <div className="card">
            <dl className="detail-grid">
              {visibleFields.map((f) => (
                <div key={f.key} className={f.full || f.type === 'textarea' ? 'full' : ''}>
                  <dt>{f.label}</dt>
                  <dd className={f.type === 'textarea' ? 'pre' : ''}><FormatValue name={f.key} value={doc[f.key]} field={f} /></dd>
                </div>
              ))}
            </dl>
            <div className="muted small">
              Dibuat {fmtDateTime(doc.createdAt)} · Diubah {fmtDateTime(doc.updatedAt)}
              {hasRole('auditor', 'risk_officer', 'security_officer') && <> · <Link to={`/audit?recordId=${doc._id}`}>Lihat audit trail</Link></>}
            </div>
          </div>
          <aside>
            {doc.sla?.resolutionDue && <SlaCard sla={doc.sla} status={doc.slaStatus} />}
            {!mod.noActivity && <Activity resource={resource} doc={doc} canWorknote={canWrite} reload={load} />}
          </aside>
        </div>
      )}
    </div>
  );
}

function TransitionPanel({ mod, doc, to, onSubmit, onCancel, isStaff }) {
  const keys = mod.transitionFields?.[to] || [];
  const fields = mod.fields.filter((f) => keys.includes(f.key));
  const [values, setValues] = useState(() => Object.fromEntries(keys.map((k) => [k, doc[k]])));
  const [note, setNote] = useState('');
  return (
    <div className="card highlight">
      <h3>Ubah status: {STATUS_LABELS[doc.status]} → {STATUS_LABELS[to]}</h3>
      {fields.length > 0 && <FormFields fields={fields} values={values} isStaff={isStaff} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />}
      <label className="full">
        <span>Catatan</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="row end">
        <button className="btn" onClick={onCancel}>Batal</button>
        <button className="btn btn-primary" onClick={() => onSubmit({ ...toPayload(fields, values), note })}>Konfirmasi</button>
      </div>
    </div>
  );
}

function CabPanel({ doc, canApprove, act }) {
  const [comment, setComment] = useState('');
  if (doc.status !== 'cab_review' && !doc.approvals?.length) return null;
  const approved = (doc.approvals || []).filter((a) => a.decision === 'approved').length;
  const decide = (decision) => act(() => api(`/changes/${doc._id}/approve`, { method: 'POST', body: { decision, comment } }));
  return (
    <div className="card">
      <h3>Change Advisory Board — persetujuan {approved}/{doc.requiredApprovals || 1}</h3>
      <ul className="plain">
        {(doc.approvals || []).map((a) => (
          <li key={a._id}>
            <Badge tone={a.decision === 'approved' ? 'green' : 'red'}>{a.decision}</Badge> {a.approverName} — {fmtDateTime(a.at)} {a.comment && `· “${a.comment}”`}
          </li>
        ))}
      </ul>
      {doc.status === 'cab_review' && canApprove && (
        <div className="row">
          <input placeholder="Komentar CAB" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="btn btn-primary" onClick={() => decide('approved')}>Approve</button>
          <button className="btn btn-danger" onClick={() => decide('rejected')}>Reject</button>
        </div>
      )}
      <p className="muted small">Segregation of duties: pemohon & implementer tidak dapat memberi persetujuan. Change risiko tinggi memerlukan 2 persetujuan.</p>
    </div>
  );
}

function SlaCard({ sla, status }) {
  return (
    <div className="card">
      <h3>SLA <FormatValue name="slaStatus" value={status} /></h3>
      <dl className="kv">
        <dt>Target respons</dt><dd>{fmtDateTime(sla.responseDue)} {sla.responseBreached && <Badge tone="red">breach</Badge>}</dd>
        <dt>Direspons</dt><dd>{fmtDateTime(sla.respondedAt) || '—'}</dd>
        <dt>Target resolusi</dt><dd>{fmtDateTime(sla.resolutionDue)} {sla.resolutionBreached && <Badge tone="red">breach</Badge>}</dd>
        <dt>Diselesaikan</dt><dd>{fmtDateTime(sla.resolvedAt) || '—'}</dd>
        <dt>Total pause</dt><dd>{sla.pausedMinutes || 0} menit</dd>
      </dl>
    </div>
  );
}

function Activity({ resource, doc, canWorknote, reload }) {
  const [message, setMessage] = useState('');
  const [worknote, setWorknote] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    await api(`/${resource}/${doc._id}/comments`, { method: 'POST', body: { message, type: worknote ? 'worknote' : 'comment' } });
    setMessage('');
    reload();
  };
  return (
    <div className="card">
      <h3>Aktivitas</h3>
      <form onSubmit={send} className="stack">
        <textarea rows={2} placeholder="Tulis komentar…" value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="row between">
          {canWorknote ? (
            <label className="inline small"><input type="checkbox" checked={worknote} onChange={(e) => setWorknote(e.target.checked)} /> Work note (internal)</label>
          ) : <span />}
          <button className="btn btn-primary">Kirim</button>
        </div>
      </form>
      <ul className="timeline">
        {[...(doc.activities || [])].reverse().filter((a) => canWorknote || a.type !== 'worknote').map((a) => (
          <li key={a._id} className={`tl-${a.type}`}>
            <div className="small muted">{a.byName || a.by?.name || 'Sistem'} · {fmtDateTime(a.at)} {a.type === 'worknote' && <Badge tone="amber">work note</Badge>}</div>
            {a.type === 'transition' && <div><b>{STATUS_LABELS[a.from] || a.from}</b> → <b>{STATUS_LABELS[a.to] || a.to}</b></div>}
            {a.message && <div className="pre">{a.message}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
