import { useMemo, useState } from 'react';
import { STATUS_LABELS, STATUS_TONE } from '../config/labels.js';
import { MODULES, STATUS_FLOW } from '../config/modules.js';
import { useAuth } from '../auth.jsx';
import { Badge } from './format.jsx';
import Icon from './Icon.jsx';
import { Modal } from './ui.jsx';
import { statusHelp, transitionInfo, workflowGuide } from '../../../shared/workflow-guide.mjs';
import { ROLES } from '../../../shared/roles.mjs';

const label = (s) => STATUS_LABELS[s] || s;

/** Langkah alur utama: bullet bernomor dengan label di bawahnya; status di luar alur ditampilkan terpisah. */
export function Stepper({ resource, status }) {
  const flow = STATUS_FLOW[resource];
  if (!flow) return null;
  const idx = flow.indexOf(status);
  const off = idx === -1;
  return (
    <div className="wf-steps" aria-label="Alur status">
      {flow.map((s, i) => {
        const state = off ? '' : i < idx ? 'done' : i === idx ? 'current' : '';
        return (
          <div key={s} className={`wf-step ${state}`}>
            <span className="wf-dot">{state === 'done' ? <Icon name="check" size="sm" /> : i + 1}</span>
            <span className="wf-label">{label(s)}</span>
            {state === 'current' && <span className="wf-here">Posisi saat ini</span>}
          </div>
        );
      })}
      {off && (
        <div className="wf-step current off">
          <span className="wf-dot">!</span>
          <span className="wf-label">{label(status)}</span>
          <span className="wf-here">di luar alur utama</span>
        </div>
      )}
    </div>
  );
}

/**
 * Panel alur kerja pada halaman detail: posisi saat ini, artinya, dan langkah berikutnya —
 * lengkap dengan siapa yang berwenang, data wajib, persetujuan yang dimulai, dan efek otomatis.
 */
export function WorkflowPanel({ resource, doc, allowed, possible, policy, labelFor, onAction }) {
  const { permissions } = useAuth();
  const [guide, setGuide] = useState(false);
  const atApproval = policy && doc.status === policy.status;
  const infos = possible.map((to) => transitionInfo(resource, doc.status, to) || { to, required: [], roles: [] });
  const flow = STATUS_FLOW[resource] || [];
  const idx = flow.indexOf(doc.status);
  // Aksi utama = langkah maju pertama di alur utama
  const primary = infos.find((i) => !i.negative && allowed.includes(i.to) && flow.indexOf(i.to) > idx)?.to;
  const writers = (permissions?.[resource]?.write || []).filter((r) => r !== '*').map((r) => ROLES[r] || r);
  const final = !possible.length && !atApproval;

  return (
    <div className="card wf-card">
      <div className="wf-head">
        <h3><Icon name="activity" size="sm" />Alur kerja</h3>
        <button className="btn btn-ghost btn-sm" onClick={() => setGuide(true)}><Icon name="layers" size="sm" />Lihat diagram alur</button>
      </div>
      <Stepper resource={resource} status={doc.status} />
      <div className="wf-now">
        <Badge tone={STATUS_TONE[doc.status]}>{label(doc.status)}</Badge>
        <span>{statusHelp(resource, doc.status) || 'Status saat ini.'}</span>
      </div>
      {atApproval && (
        <div className="wf-callout">
          <Icon name="checkSquare" size="sm" />
          <span>Keputusan berikutnya diambil melalui <b>panel {policy.label}</b> di bawah (Setujui / Tolak). Bila disetujui → <b>{label(policy.approved)}</b>; bila ditolak → <b>{label(policy.rejected)}</b>.</span>
        </div>
      )}
      {infos.length > 0 && (
        <>
          <div className="wf-subtitle">Langkah berikutnya</div>
          <div className="wf-actions">
            {infos.map((i) => {
              const can = allowed.includes(i.to);
              const list = i.roles.length ? i.roles : writers;
              const short = list.length > 3 ? `${list.slice(0, 3).join(' / ')} +${list.length - 3} peran lain` : list.join(' / ');
              const who = `${i.owner ? 'Pemilik/pemohon record, atau ' : ''}${short || 'pengelola modul'}`;
              return (
                <div key={i.to} className={`wf-action ${i.to === primary ? 'primary' : ''} ${i.negative ? 'negative' : ''}`}>
                  <div className="wf-action-body">
                    <div className="wf-action-title">
                      <Icon name={i.negative ? 'x' : 'check'} size="sm" />
                      {labelFor(doc.status, i.to)}
                      <span className="wf-to"><Icon name="arrowRight" size="sm" />{label(i.to)}</span>
                    </div>
                    {i.hint && <p>{i.hint}</p>}
                    <ul className="wf-meta">
                      {i.required.length > 0 && <li><Icon name="edit" size="sm" />Wajib diisi: {i.required.join(', ')}</li>}
                      <li title={list.join(' / ')}><Icon name="user" size="sm" />Oleh: {who}</li>
                      {i.approval && <li><Icon name="checkSquare" size="sm" />Memulai persetujuan: {i.approval.steps.map((s) => s.name).join(' → ')}</li>}
                      {i.effect && <li className="auto"><Icon name="zap" size="sm" />Otomatis: {i.effect}</li>}
                    </ul>
                  </div>
                  {can
                    ? <button className={`btn ${i.to === primary ? 'btn-primary' : i.negative ? 'btn-danger' : ''}`} onClick={() => onAction(i.to)}>{labelFor(doc.status, i.to)}</button>
                    : <span className="wf-wait"><Icon name="lock" size="sm" />Menunggu pihak berwenang</span>}
                </div>
              );
            })}
          </div>
        </>
      )}
      {final && <div className="wf-callout done"><Icon name="check" size="sm" /><span>Tidak ada langkah lanjutan — proses pada record ini sudah selesai atau diperbarui otomatis oleh sistem.</span></div>}
      {guide && <WorkflowGuideModal resource={resource} current={doc.status} onClose={() => setGuide(false)} />}
    </div>
  );
}

/** Diagram alur lengkap satu modul: status alur utama + percabangan, syarat, peran, persetujuan & otomatisasi. */
export function WorkflowGuideModal({ resource, current, onClose }) {
  const guide = useMemo(() => workflowGuide(resource, STATUS_FLOW[resource]), [resource]);
  const mod = MODULES[resource];
  if (!guide) return null;
  const main = guide.statuses.filter((s) => s.main);
  const other = guide.statuses.filter((s) => !s.main);
  const Row = ({ s, i }) => (
    <li className={`wf-node ${s.status === current ? 'current' : ''} ${s.final ? 'final' : ''}`}>
      <span className="wf-node-dot">{i ?? '•'}</span>
      <div className="wf-node-body">
        <div className="row"><Badge tone={STATUS_TONE[s.status]}>{label(s.status)}</Badge>{s.status === current && <span className="wf-here inline">Posisi record ini</span>}{s.final && <span className="small muted">status akhir</span>}</div>
        {s.help && <p className="small muted">{s.help}</p>}
        {s.next.length > 0 && (
          <ul className="wf-edges">
            {s.next.map((n) => (
              <li key={n.to} className={n.negative ? 'negative' : ''}>
                <span className="wf-edge-to">→ {label(n.to)}</span>
                <span className="small muted">
                  {n.viaApproval ? 'melalui keputusan persetujuan' : n.auto ? 'otomatis oleh sistem' : n.roles.length ? `oleh ${n.roles.join(' / ')}` : n.owner ? 'oleh pemilik/pemohon atau pengelola' : 'oleh pengelola modul'}
                  {n.required.length > 0 && ` · wajib: ${n.required.join(', ')}`}
                  {n.effect && ` · otomatis: ${n.effect}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </li>
  );
  return (
    <Modal title={`Alur kerja — ${mod?.plural || resource}`} onClose={onClose} width={820}>
      <div className="modal-body">
        {mod?.description && <p className="muted" style={{ marginTop: 0 }}>{mod.description}</p>}
        <div className="wf-subtitle">Alur utama</div>
        <ol className="wf-graph">{main.map((s, i) => <Row key={s.status} s={s} i={i + 1} />)}</ol>
        {other.length > 0 && (
          <>
            <div className="wf-subtitle">Percabangan & pengecualian</div>
            <ol className="wf-graph branch">{other.map((s) => <Row key={s.status} s={s} />)}</ol>
          </>
        )}
        {guide.approval && (
          <div className="wf-approval">
            <div className="wf-subtitle">Persetujuan: {guide.approval.label}</div>
            <ol className="wf-chain">
              {guide.approval.steps.map((s, i) => (
                <li key={s.name}><span className="wf-node-dot">{i + 1}</span><span><b>{s.name}</b><span className="small muted"> · {s.who}{s.conditional ? ' · bila kondisi terpenuhi' : ''}</span></span></li>
              ))}
            </ol>
            <p className="small muted" style={{ margin: 0 }}>
              Disetujui → <b>{label(guide.approval.approved)}</b> · Ditolak → <b>{label(guide.approval.rejected)}</b>
              {guide.approval.sod && ' · Segregation of duties: pembuat/pemohon tidak dapat menyetujui; satu orang satu keputusan per putaran.'}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}

/** Tombol "Alur kerja" untuk header daftar modul. */
export function WorkflowButton({ resource }) {
  const [open, setOpen] = useState(false);
  if (!STATUS_FLOW[resource] || !workflowGuide(resource, STATUS_FLOW[resource])) return null;
  return (
    <>
      <button className="btn" onClick={() => setOpen(true)}><Icon name="layers" size="sm" />Alur kerja</button>
      {open && <WorkflowGuideModal resource={resource} onClose={() => setOpen(false)} />}
    </>
  );
}
