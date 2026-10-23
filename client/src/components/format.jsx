import { STATUS_LABELS, STATUS_TONE, PRIORITY_LABELS, LEVEL_TONE, SLA_LABELS, SLA_TONE } from '../config/labels.js';

export const Badge = ({ tone = 'gray', children }) => <span className={`badge badge-${tone}`}>{children}</span>;

export const fmtDate = (v) => (v ? new Date(v).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '');
export const fmtDateTime = (v) =>
  v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
export const fmtNumber = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('id-ID'));

export const refLabel = (v) => {
  if (!v) return '';
  if (typeof v !== 'object') return String(v);
  const main = v.name || v.title || v.email || '';
  return v.number && main ? `${v.number} · ${main}` : main || v.number || v._id;
};

const optionLabel = (field, v) => field?.options?.find(([k]) => String(k) === String(v))?.[1];

export const fmtMoney = (v) => `Rp ${Math.round(Number(v) || 0).toLocaleString('id-ID')}`;
const MONEY_KEYS = /^(amount|total|subtotal|hpsAmount|unitPrice|recommendedAmount|savingsAmount|catalogTotal|nonCatalogTotal|value|estimatedCost|contractValue|purchaseCost|actualCost|committedAmount|actualAmount|availableAmount|taxAmount|paidAmount|totalDebit|totalCredit)$/;

/** Tabel baris (rincian PO, jurnal) untuk tampilan detail. */
function LinesView({ field, value }) {
  if (!value?.length) return <span className="muted">—</span>;
  const cols = field.lines.filter((l) => !l.hidden);
  return (
    <table className="lines-view">
      <thead><tr>{cols.map((l) => <th key={l.key}>{l.label}</th>)}</tr></thead>
      <tbody>
        {value.map((r, i) => (
          <tr key={i}>{cols.map((l) => <td key={l.key} className={l.type === 'number' ? 'num' : ''}>{l.type === 'number' ? (r[l.key] ? Number(r[l.key]).toLocaleString('id-ID') : '') : l.options ? `${r[l.key] || ''} ${l.options.find(([k]) => k === r[l.key])?.[1] || ''}` : r[l.key]}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

/** Render nilai field secara konsisten di tabel & halaman detail. */
export function FormatValue({ name, value, field }) {
  if (value === undefined || value === null || value === '') return <span className="muted">—</span>;
  const fmt = field?.format;
  if (field?.type === 'lines') return <LinesView field={field} value={value} />;
  if (fmt === 'money' || (MONEY_KEYS.test(name) && typeof value === 'number')) return <span className="nowrap">{fmtMoney(value)}</span>;
  if (fmt === 'percent' || /Utilization$/.test(name)) return <span className="nowrap">{value}%</span>;
  if (name === 'status') return <Badge tone={STATUS_TONE[value]}>{STATUS_LABELS[value] || value}</Badge>;
  if (name === 'slaStatus') return <Badge tone={SLA_TONE[value]}>{SLA_LABELS[value] || value}</Badge>;
  if ((name === 'priority' || fmt === 'priority') && typeof value === 'number')
    return <Badge tone={['', 'red', 'orange', 'amber', 'green'][value]}>{PRIORITY_LABELS[value]}</Badge>;
  if (fmt === 'level' || /Level$|^criticality$|^riskRating$|^risk$/.test(name)) return <Badge tone={LEVEL_TONE[value] || 'gray'}>{optionLabel(field, value) || value}</Badge>;
  if (name === 'health') return <Badge tone={{ green: 'green', amber: 'amber', red: 'red' }[value]}>{value}</Badge>;
  if (typeof value === 'boolean' || fmt === 'bool') return value ? '✔ Ya' : 'Tidak';
  if (Array.isArray(value)) return value.length ? value.map((x) => refLabel(x)).join(', ') : <span className="muted">—</span>;
  if (typeof value === 'object') return refLabel(value);
  if (field?.type === 'datetime' || fmt === 'datetime' || /At$|^planned|^actual/.test(name)) return fmtDateTime(value);
  if (field?.type === 'date' || fmt === 'date' || /Date$|End$|Expiry$|^neededBy$|^nextReview$|^lastAssessed$|Due$/.test(name)) return fmtDate(value);
  if (field?.options) return optionLabel(field, value) || String(value);
  if (name === 'percentComplete') return `${value}%`;
  if (typeof value === 'number') return fmtNumber(value);
  return String(value);
}
