import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { MODULES, STATUS_FLOW } from '../config/modules.js';
import { STATUS_LABELS, STATUS_TONE } from '../config/labels.js';
import { Badge, FormatValue, fmtDateTime } from './format.jsx';
import ResourceForm, { FormFields, sectionsFor, toPayload } from './ResourceForm.jsx';
import Icon from './Icon.jsx';
import { Empty, Modal, Tabs, initials, usePopover, useToast } from './ui.jsx';
import { AddToCart, QuotationCompare } from './ProcurementPanels.jsx';
import { WorkflowPanel } from './Workflow.jsx';
import { transitionInfo } from '../../../shared/workflow-guide.mjs';
import { APPROVALS, approvalError, approvalProgress } from '../../../shared/approvals.mjs';
import { SPAWN } from '../../../shared/effects.mjs';
import { MODULE_DEFS } from '../../../shared/modules.mjs';
import { ROLES } from '../../../shared/roles.mjs';

const NEGATIVE = ['cancelled', 'rejected', 'withdrawn', 'disqualified', 'failed', 'suspended'];
// Label aksi khusus per modul (mis. RFQ: "Buka penawaran" alih-alih nama status)
const ACTION_LABELS = {
  rfqs: { published: 'Umumkan & kirim undangan', evaluation: 'Buka penawaran & evaluasi', pending_approval: 'Usulkan pemenang', failed: 'Nyatakan gagal', draft: 'Tender ulang' },
  'catalog-items': { pending_approval: 'Ajukan penayangan', draft: 'Revisi harga / spesifikasi', suspended: 'Tangguhkan', retired: 'Tarik dari katalog' },
  requisitions: { pending_approval: 'Ajukan PR', completed: 'Tandai selesai' },
  quotations: { withdrawn: 'Tarik penawaran', disqualified: 'Diskualifikasi' },
};
// Kata kerja aksi default (tombol menyatakan tindakan, bukan nama status)
const ACTION_VERBS = {
  submitted: 'Ajukan', assigned: 'Tugaskan', in_progress: 'Mulai kerjakan', pending: 'Tunda (pending)', resolved: 'Tandai selesai', closed: 'Tutup',
  cancelled: 'Batalkan', approved: 'Setujui', rejected: 'Tolak', pending_approval: 'Ajukan persetujuan', fulfilling: 'Mulai penuhi', fulfilled: 'Tandai terpenuhi',
  investigating: 'Mulai investigasi', known_error: 'Tetapkan known error', assessment: 'Mulai assessment', cab_review: 'Ajukan ke CAB', scheduled: 'Jadwalkan',
  implementing: 'Mulai implementasi', review: 'Ajukan review', published: 'Terbitkan', retired: 'Pensiunkan', identified: 'Buka kembali', assessed: 'Tandai sudah dinilai',
  treating: 'Mulai penanganan', monitoring: 'Pindah ke monitoring', planning: 'Mulai perencanaan', executing: 'Mulai eksekusi', closing: 'Mulai penutupan', on_hold: 'Tunda',
  active: 'Aktifkan', completed: 'Tandai selesai', ordered: 'Pesan ke penyedia', received: 'Catat penerimaan', in_stock: 'Masukkan ke stok', deployed: 'Serahkan ke pengguna',
  in_repair: 'Kirim perbaikan', due_diligence: 'Mulai due diligence', legal_review: 'Ajukan review legal', renewal_review: 'Review perpanjangan', expired: 'Tandai berakhir',
  terminated: 'Akhiri', verified: 'Verifikasi', disputed: 'Ajukan sengketa', executed: 'Eksekusi', reconciled: 'Rekonsiliasi', posted: 'Posting', reversed: 'Buat jurnal balik',
  action_plan: 'Isi rencana tindak lanjut', in_remediation: 'Mulai remediasi', concluded: 'Simpulkan', commissioning: 'Mulai commissioning', operational: 'Operasikan',
  maintenance: 'Masuk maintenance', decommissioned: 'Nonaktifkan', checked_in: 'Check-in', checked_out: 'Check-out', in_execution: 'Mulai eksekusi', delivered: 'Tandai selesai',
  needs_update: 'Tandai perlu update', tested: 'Tandai teruji', in_build: 'Mulai pembangunan', under_review: 'Mulai review', deprecated: 'Tandai usang', planned: 'Rencanakan',
};
const transitionLabel = (from, to, resource) => {
  if (ACTION_LABELS[resource]?.[to]) return ACTION_LABELS[resource][to];
  if (to === 'in_progress' && ['resolved', 'pending'].includes(from)) return from === 'resolved' ? 'Buka kembali' : 'Lanjutkan';
  if (to === 'draft' && from !== 'draft') return 'Kembalikan ke draft';
  return ACTION_VERBS[to] || STATUS_LABELS[to] || to;
};

export default function ResourceDetail() {
  const { resource, id } = useParams();
  const mod = MODULES[resource];
  const navigate = useNavigate();
  const toast = useToast();
  const { user, can, hasRole, isStaff, canPage } = useAuth();
  const [doc, setDoc] = useState(null);
  const [related, setRelated] = useState([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [transition, setTransition] = useState(null);
  const [tab, setTab] = useState('detail');

  const load = useCallback(() => {
    api(`/${resource}/${id}`).then(setDoc).catch((e) => setError(e.message));
    api(`/${resource}/${id}/related`).then(setRelated).catch(() => setRelated([]));
  }, [resource, id]);
  useEffect(() => { setDoc(null); setTab('detail'); setEditing(false); load(); }, [load]);

  if (error && !doc) return <div className="card"><Empty icon="alert" title="Tidak dapat membuka data">{error}</Empty></div>;
  if (!doc) return <div className="card"><div className="skeleton" style={{ width: '40%', height: 22 }} /><br /><div className="skeleton" /><br /><div className="skeleton" style={{ width: '70%' }} /></div>;

  const canWrite = can(resource, 'write');
  const idOf = (v) => (v && typeof v === 'object' ? v._id : v);
  const mine = [doc.requester, doc.createdBy, doc.owner].map(idOf).includes(user._id);
  const spec = MODULE_DEFS[resource]?.workflow;
  const policy = APPROVALS[resource];
  let transitions = doc.allowedTransitions || [];
  // Semua langkah yang mungkin dari status ini (untuk panduan), di luar keputusan persetujuan & status otomatis
  const possible = transitions.filter((t) => !spec?.viaEffect?.includes(t) && !(policy && doc.status === policy.status && [policy.approved, policy.rejected].includes(t)));
  if (!canWrite) {
    // Non-penulis: pemohon/pemilik untuk langkah tertentu, atau peran khusus (mis. verifikator, treasury)
    transitions = transitions.filter((t) =>
      spec ? (mine && spec.canOwner?.includes(t)) || (spec.roles?.[t] && hasRole(...spec.roles[t])) : mine && ['cancelled', 'closed', 'in_progress'].includes(t));
  }
  // Status yang diisi otomatis oleh sistem (mis. PR "Dalam Pengadaan") tidak ditawarkan sebagai tombol
  transitions = transitions.filter((t) => !spec?.viaEffect?.includes(t));
  // Keputusan persetujuan diambil di panel persetujuan, bukan tombol transisi
  if (policy && doc.status === policy.status) transitions = transitions.filter((t) => ![policy.approved, policy.rejected].includes(t));
  const spawns = (SPAWN[resource] || []).filter((r) => can(r.target, 'create'));

  const act = async (fn, msg) => {
    setError('');
    try {
      await fn();
      setTransition(null);
      if (msg) toast(msg);
      load();
    } catch (e) {
      setError(e.message);
      toast(e.message, 'error');
    }
  };
  const remove = () =>
    window.confirm('Hapus data ini secara permanen?') &&
    act(async () => {
      await api(`/${resource}/${id}`, { method: 'DELETE' });
      navigate(`/m/${resource}`);
    }, 'Data dihapus');

  const title = doc[mod.titleField] || doc.title || doc.name;
  const visibleFields = mod.fields.filter((f) => isStaff || !f.staff);
  const activities = [...(doc.activities || [])].reverse().filter((a) => canWrite || a.type !== 'worknote');
  const relatedCount = related.reduce((s, g) => s + g.items.length, 0);
  const canRemove = can(resource, 'remove');

  return (
    <div>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <Link to={`/m/${resource}`} className="eyebrow"><Icon name="arrowLeft" size="sm" />{mod.plural}</Link>
          <h1>{doc.number && <span className="muted mono" style={{ fontSize: 16, marginRight: 8 }}>{doc.number}</span>}{title}</h1>
          <div className="row" style={{ marginTop: 10 }}>
            {doc.status && <FormatValue name="status" value={doc.status} />}
            {typeof doc.priority === 'number' && <FormatValue name="priority" value={doc.priority} />}
            {doc.slaStatus && doc.slaStatus !== 'none' && <FormatValue name="slaStatus" value={doc.slaStatus} />}
            {doc.majorIncident && <Badge tone="red">Major incident</Badge>}
            {doc.securityIncident && <Badge tone="orange">Insiden keamanan</Badge>}
            {doc.regulatoryReportable && !doc.regulatorReportedAt && <Badge tone="red">Wajib lapor regulator</Badge>}
          </div>
        </div>
        <div className="row end">
          {resource === 'catalog-items' && <AddToCart item={doc} />}
          {spawns.length > 0 && <SpawnMenu resource={resource} id={doc._id} spawns={spawns} />}
          {canWrite && !editing && <button className="btn" onClick={() => { setEditing(true); setTab('detail'); }}><Icon name="edit" size="sm" />Edit</button>}
          {canRemove && <button className="btn btn-danger btn-icon" onClick={remove} title="Hapus" aria-label="Hapus"><Icon name="trash" size="sm" /></button>}
        </div>
      </div>

      {doc.status && (STATUS_FLOW[resource] || possible.length > 0) && (
        <WorkflowPanel resource={resource} doc={doc} allowed={transitions} possible={possible} policy={policy}
          labelFor={(from, to) => transitionLabel(from, to, resource)} onAction={setTransition} />
      )}
      {error && <div className="alert"><Icon name="alert" size="sm" />{error}</div>}

      {transition && (
        <TransitionModal resource={resource} mod={mod} doc={doc} to={transition} isStaff={isStaff} onClose={() => setTransition(null)}
          onSubmit={(body) => act(() => api(`/${resource}/${id}/transition`, { method: 'POST', body: { to: transition, ...body } }), `Status diubah menjadi ${STATUS_LABELS[transition]}`)} />
      )}

      <div className="detail-layout">
        <div>
          {policy && <ApprovalPanel resource={resource} policy={policy} doc={doc} user={user} act={act} />}
          {resource === 'rfqs' && <QuotationCompare rfq={doc} version={doc.updatedAt} />}
          {doc.sealed && <div className="alert warn"><Icon name="lock" size="sm" />Penawaran tersegel — harga baru dapat dilihat setelah pembukaan penawaran pada {doc.rfq?.number || 'RFQ'}.</div>}
          <Tabs value={tab} onChange={setTab} tabs={[['detail', 'Detail'], !mod.noActivity && ['activity', 'Aktivitas', activities.length], ['related', 'Terkait', relatedCount]].filter(Boolean)} />
          {tab === 'detail' && (editing ? (
            <ResourceForm existing={doc} onSaved={() => { setEditing(false); load(); }} onCancel={() => setEditing(false)} />
          ) : (
            <div className="card flush">
              {sectionsFor(resource, visibleFields).map(([sec, fs]) => (
                <section key={sec || 'main'} className="form-section">
                  {sec && <h3>{sec}</h3>}
                  <dl className="detail-grid">
                    {fs.map((f) => (
                      <div key={f.key} className={f.full || f.type === 'textarea' ? 'full' : ''}>
                        <dt>{f.label}</dt>
                        <dd className={f.type === 'textarea' ? 'pre' : ''}><FormatValue name={f.key} value={doc[f.key]} field={f} /></dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          ))}
          {tab === 'activity' && <Activity resource={resource} activities={activities} doc={doc} canWorknote={canWrite} reload={load} />}
          {tab === 'related' && (
            <div className="card">
              {!related.length && <Empty icon="link" title="Belum ada record terkait">Record lain yang mereferensikan {doc.number || 'record ini'} akan tampil di sini.</Empty>}
              {related.map((g) => (
                <div key={g.resource} style={{ marginBottom: 14 }}>
                  <h3 className="row"><Icon name={MODULES[g.resource]?.icon} size="sm" />{MODULES[g.resource]?.plural || g.label}</h3>
                  {g.items.map((it) => (
                    <Link key={it._id} to={`/m/${g.resource}/${it._id}`} className="list-row">
                      <span className="mono small muted">{it.number}</span>
                      <span className="grow list-title">{it.title || it.name}</span>
                      {it.status && <FormatValue name="status" value={it.status} />}
                    </Link>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <aside>
          <div className="card">
            <h3>Ringkasan</h3>
            <dl className="kv">
              {doc.assignee !== undefined && <><dt>Assignee</dt><dd>{doc.assignee?.name || <span className="muted">Belum ditugaskan</span>}</dd></>}
              {doc.requester && <><dt>Pemohon</dt><dd>{doc.requester.name}</dd></>}
              {doc.owner && <><dt>Pemilik</dt><dd>{doc.owner.name}</dd></>}
              {doc.service && <><dt>Layanan</dt><dd>{doc.service.name}</dd></>}
              <dt>Dibuat</dt><dd>{fmtDateTime(doc.createdAt)}</dd>
              <dt>Diubah</dt><dd>{fmtDateTime(doc.updatedAt)}</dd>
            </dl>
            {canPage('audit') && <div style={{ marginTop: 12 }}><Link className="small" to={`/audit?recordId=${doc._id}`}><Icon name="scroll" size="sm" /> Lihat audit trail</Link></div>}
          </div>
          {doc.sla?.resolutionDue && <SlaCard sla={doc.sla} status={doc.slaStatus} />}
        </aside>
      </div>
    </div>
  );
}

function TransitionModal({ resource, mod, doc, to, onSubmit, onClose, isStaff }) {
  const info = transitionInfo(resource, doc.status, to);
  const keys = mod.transitionFields?.[to] || [];
  const fields = mod.fields.filter((f) => keys.includes(f.key));
  const [values, setValues] = useState(() => Object.fromEntries(keys.map((k) => [k, doc[k]])));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await onSubmit({ ...toPayload(fields, values), note });
    setBusy(false);
  };
  return (
    <Modal title={transitionLabel(doc.status, to, resource)} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body stack">
          <div className="wf-transition">
            <Badge tone={STATUS_TONE[doc.status]}>{STATUS_LABELS[doc.status] || doc.status}</Badge>
            <Icon name="arrowRight" size="sm" />
            <Badge tone={STATUS_TONE[to]}>{STATUS_LABELS[to] || to}</Badge>
          </div>
          {(info?.hint || info?.effect || info?.approval) && (
            <ul className="wf-meta boxed">
              {info.hint && <li><Icon name="help" size="sm" />{info.hint}</li>}
              {info.approval && <li><Icon name="checkSquare" size="sm" />Memulai persetujuan: {info.approval.steps.map((st) => st.name).join(' → ')}</li>}
              {info.effect && <li className="auto"><Icon name="zap" size="sm" />Otomatis: {info.effect}</li>}
            </ul>
          )}
          {fields.length > 0 && <p className="muted small" style={{ margin: 0 }}>Lengkapi informasi berikut sesuai alur kerja {mod.label}.</p>}
          {fields.length > 0 && <FormFields fields={fields} values={values} isStaff={isStaff} onChange={(k, v) => setValues((s) => ({ ...s, [k]: v }))} />}
          <label><span>Catatan (opsional)</span><textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} /></label>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>Batal</button>
          <button className={`btn ${NEGATIVE.includes(to) ? 'btn-danger' : 'btn-primary'}`} disabled={busy}>{transitionLabel(doc.status, to, resource)}</button>
        </div>
      </form>
    </Modal>
  );
}

function SpawnMenu({ resource, id, spawns }) {
  const { open, setOpen, ref } = usePopover();
  const navigate = useNavigate();
  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="btn" onClick={() => setOpen(!open)}><Icon name="link" size="sm" />Buat terkait<Icon name="chevronDown" size="sm" /></button>
      {open && (
        <div className="popover menu" style={{ minWidth: 260 }}>
          {spawns.map((r) => (
            <button key={r.target} className="menu-item" onClick={() => navigate(`/m/${r.target}/new?_spawn=${resource}:${id}`)}>
              <Icon name={MODULES[r.target]?.icon} size="sm" />{r.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Panel persetujuan multi-tahap generik (CAB, PO, tagihan, pembayaran, vendor, BIA, dst.). */
function ApprovalPanel({ resource, policy, doc, user, act }) {
  const [comment, setComment] = useState('');
  const progress = approvalProgress(policy, doc);
  const waiting = doc.status === policy.status;
  const reason = waiting ? approvalError(policy, doc, user) : null;
  const history = (doc.approvals || []).slice().reverse();
  const decide = (decision) => act(() => api(`/${resource}/${doc._id}/approve`, { method: 'POST', body: { decision, comment } }), decision === 'approved' ? 'Persetujuan tercatat' : 'Ditolak');
  return (
    <div className={`card ${waiting ? 'highlight' : ''}`}>
      <div className="row between">
        <h3 style={{ margin: 0 }}><Icon name="checkSquare" size="sm" /> {policy.label}</h3>
        {waiting ? <Badge tone="amber">Menunggu: {progress.current?.name}</Badge> : doc.approvals?.length ? <Badge tone="gray">Riwayat persetujuan</Badge> : <Badge tone="gray">Belum diajukan</Badge>}
      </div>
      <ol className="approval-steps">
        {progress.steps.map((st) => (
          <li key={st.name} className={st.done ? 'done' : progress.current?.name === st.name && waiting ? 'current' : ''}>
            <span className="bullet">{st.done ? <Icon name="check" size="sm" /> : ''}</span>
            <span className="grow">
              <b>{st.name}</b>
              <span className="small muted"> · {st.field ? 'penyetuju yang ditunjuk' : st.roles.map((r) => ROLES[r] || r).join(' / ')}{st.required > 1 ? ` · ${st.required} persetujuan` : ''}</span>
              {st.approvers.length > 0 && <div className="small">Disetujui: {st.approvers.join(', ')}</div>}
            </span>
            <span className="small muted">{st.approved}/{st.required}</span>
          </li>
        ))}
      </ol>
      {waiting && !reason && (
        <div className="row">
          <input className="grow" style={{ width: 'auto' }} placeholder="Komentar (opsional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <button className="btn btn-success" onClick={() => decide('approved')}><Icon name="check" size="sm" />Setujui</button>
          <button className="btn btn-danger" onClick={() => decide('rejected')}><Icon name="x" size="sm" />Tolak</button>
        </div>
      )}
      {waiting && reason && <p className="small muted" style={{ margin: 0 }}><Icon name="lock" size="sm" /> {reason}</p>}
      {history.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary className="small muted">Riwayat keputusan ({history.length})</summary>
          <ul className="plain">
            {history.map((a, i) => (
              <li key={a._id || i} className="row small">
                <span className="avatar" style={{ width: 24, height: 24, fontSize: 10 }}>{initials(a.approverName)}</span>
                <b>{a.approverName}</b><Badge tone={a.decision === 'approved' ? 'green' : 'red'}>{a.decision === 'approved' ? 'Setuju' : 'Tolak'}</Badge>
                <span className="muted">{a.step} · putaran {a.round || 1} · {fmtDateTime(a.at)}</span>{a.comment && <span>“{a.comment}”</span>}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!(waiting && reason) && <p className="muted small" style={{ margin: '10px 0 0' }}>Segregation of duties: pembuat/pemohon tidak dapat menyetujui; satu orang satu keputusan per putaran.</p>}
    </div>
  );
}

function SlaCard({ sla, status }) {
  return (
    <div className="card">
      <div className="row between"><h3 style={{ margin: 0 }}>SLA</h3><FormatValue name="slaStatus" value={status} /></div>
      <dl className="kv" style={{ marginTop: 12 }}>
        <dt>Target respons</dt><dd>{fmtDateTime(sla.responseDue)}{sla.responseBreached && <> <Badge tone="red">breach</Badge></>}</dd>
        <dt>Direspons</dt><dd>{fmtDateTime(sla.respondedAt) || '—'}</dd>
        <dt>Target resolusi</dt><dd>{fmtDateTime(sla.resolutionDue)}{sla.resolutionBreached && <> <Badge tone="red">breach</Badge></>}</dd>
        <dt>Diselesaikan</dt><dd>{fmtDateTime(sla.resolvedAt) || '—'}</dd>
        <dt>Total jeda</dt><dd>{sla.pausedMinutes || 0} menit</dd>
      </dl>
    </div>
  );
}

function Activity({ resource, doc, activities, canWorknote, reload }) {
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [worknote, setWorknote] = useState(false);
  const send = async (e) => {
    e.preventDefault();
    if (!message.trim()) return;
    try {
      await api(`/${resource}/${doc._id}/comments`, { method: 'POST', body: { message, type: worknote ? 'worknote' : 'comment' } });
      setMessage('');
      reload();
    } catch (err) {
      toast(err.message, 'error');
    }
  };
  return (
    <div className="card">
      <form onSubmit={send} className="stack">
        <textarea rows={3} placeholder={worknote ? 'Catatan internal untuk tim TI…' : 'Tulis komentar…'} value={message} onChange={(e) => setMessage(e.target.value)} />
        <div className="row between">
          {canWorknote ? <label className="inline small"><input type="checkbox" checked={worknote} onChange={(e) => setWorknote(e.target.checked)} /><span>Work note (internal, tidak terlihat pemohon)</span></label> : <span />}
          <button className="btn btn-primary"><Icon name="message" size="sm" />Kirim</button>
        </div>
      </form>
      <ul className="timeline">
        {activities.map((a) => (
          <li key={a._id} className={`tl-${a.type}`}>
            <div className="small"><b>{a.byName || a.by?.name || 'Sistem'}</b> <span className="muted">· {fmtDateTime(a.at)}</span> {a.type === 'worknote' && <Badge tone="gold">work note</Badge>}</div>
            {a.type === 'transition' && <div className="small">Status: <b>{STATUS_LABELS[a.from] || a.from}</b> → <b>{STATUS_LABELS[a.to] || a.to}</b></div>}
            {a.message && <div className="tl-msg pre">{a.message}</div>}
          </li>
        ))}
      </ul>
    </div>
  );
}
