import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { MODULES, NAV_GROUPS } from '../config/modules.js';
import Icon from '../components/Icon.jsx';
import { PageHeader, useToast } from '../components/ui.jsx';

const SHORT = {
  service_desk: 'Service Desk', technician: 'Teknisi', incident_manager: 'Incident Mgr', problem_manager: 'Problem Mgr', change_manager: 'Change Mgr',
  cab_member: 'CAB', asset_manager: 'Asset Mgr', knowledge_manager: 'Knowledge Mgr', risk_officer: 'Risk Officer', security_officer: 'CISO',
  architect: 'Arsitek', project_manager: 'PM / SM', vendor_manager: 'Procurement', auditor: 'Auditor', requester: 'End User',
  finance_manager: 'IT Controller', accountant: 'Akuntan', treasurer: 'Treasury', dc_manager: 'DC Mgr', bcm_manager: 'BCM', executive: 'CIO / Direksi',
};

/** Matriks peran × modul. Klik sel: — → Lihat (R) → Ubah (W). Admin selalu memiliki akses penuh. */
export default function Access() {
  const { refresh } = useAuth();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const load = () =>
    api('/tenant/access').then((d) => {
      setData(d);
      setMatrix(Object.fromEntries(Object.entries(d.defaults).map(([res, def]) => {
        const o = d.overrides[res] || {};
        return [res, { read: o.read || def.read, write: o.write || def.write }];
      })));
    });
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const roles = useMemo(() => (data ? Object.keys(data.roles).filter((r) => r !== 'admin') : []), [data]);
  if (!data || !matrix) return <div className="card"><div className="skeleton" style={{ height: 240 }} /></div>;

  const level = (res, role) => (matrix[res].write.includes(role) ? 'W' : matrix[res].read.includes('*') || matrix[res].read.includes(role) ? 'R' : '');
  const cycle = (res, role) => {
    const m = matrix[res];
    const allRead = m.read.includes('*');
    const cur = level(res, role);
    let read = m.read.filter((r) => r !== role);
    let write = m.write.filter((r) => r !== role);
    if (cur === '') read = [...read, role];
    else if (cur === 'R') { write = [...write, role]; if (!allRead) read = [...read, role]; }
    // W → '' (atau → R bila modul dapat dilihat semua pengguna)
    setMatrix({ ...matrix, [res]: { read: allRead ? ['*'] : read, write } });
  };
  const changed = Object.keys(matrix).filter((res) => JSON.stringify([...matrix[res].read].sort()) !== JSON.stringify([...data.defaults[res].read].sort()) || JSON.stringify([...matrix[res].write].sort()) !== JSON.stringify([...data.defaults[res].write].sort()));
  const save = async () => {
    try {
      const overrides = Object.fromEntries(changed.map((res) => [res, matrix[res]]));
      await api('/tenant/access', { method: 'PUT', body: { overrides } });
      await refresh();
      toast('Matriks hak akses disimpan — menu pengguna menyesuaikan otomatis');
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  };
  const reset = () => setMatrix(Object.fromEntries(Object.entries(data.defaults).map(([res, d]) => [res, { read: d.read, write: d.write }])));
  const rows = NAV_GROUPS.flatMap((g) => Object.entries(MODULES).filter(([, m]) => m.group === g).map(([k]) => k)).filter((k) => matrix[k]);

  return (
    <div>
      <PageHeader icon="key" title="Peran & Akses" description="Atur modul yang dapat dilihat (R) dan diubah (W) setiap peran. Menu portal setiap pengguna mengikuti matriks ini. Admin selalu memiliki akses penuh."
        actions={<>
          <button className="btn" onClick={reset}>Kembalikan default</button>
          <button className="btn btn-primary" onClick={save}><Icon name="check" size="sm" />Simpan{changed.length ? ` (${changed.length} modul disesuaikan)` : ''}</button>
        </>} />
      <div className="alert info"><Icon name="shield" size="sm" />Default mengikuti prinsip least privilege. Aturan alur kerja (mis. segregation of duties CAB) tetap berlaku apa pun pengaturannya.</div>
      <div className="card flush table-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th>Modul</th>
              {roles.map((r) => <th key={r} className="rot" title={data.roles[r]}>{SHORT[r] || r}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((res) => {
              const enabled = data.effective[res]?.enabled;
              return (
                <tr key={res} style={enabled ? undefined : { opacity: 0.5 }}>
                  <td className="nowrap">
                    <span className="row" style={{ gap: 6 }}><Icon name={MODULES[res].icon} size="sm" /><b style={{ fontWeight: 600 }}>{MODULES[res].plural}</b>{!enabled && <Icon name="lock" size="sm" title="Tidak termasuk paket" />}</span>
                    {matrix[res].read.includes('*') && <div className="small muted">Dapat dilihat semua pengguna</div>}
                  </td>
                  {roles.map((role) => {
                    const l = level(res, role);
                    return (
                      <td key={role}>
                        <span className="perm-cell">
                          <button type="button" className={`${l === 'W' ? 'on' : l === 'R' ? 'on r' : ''}`} onClick={() => cycle(res, role)} disabled={!enabled}
                            title={`${data.roles[role]} — ${l === 'W' ? 'lihat & ubah' : l === 'R' ? 'lihat saja' : 'tidak ada akses'}`}>{l || '–'}</button>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="small muted"><b>R</b> = lihat · <b>W</b> = lihat & ubah · <b>–</b> = tidak ada akses. Halaman Laporan, Kepatuhan, Audit Log, dan Administrasi mengikuti peran tetap.</p>
    </div>
  );
}
