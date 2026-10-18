import { Badge } from '../components/format.jsx';

export const STATUS = {
  operational: ['Normal', 'green', '●'],
  maintenance: ['Pemeliharaan', 'blue', '◆'],
  degraded: ['Gangguan sebagian', 'amber', '▲'],
  major_outage: ['Gangguan besar', 'red', '■'],
};

export const StatusPill = ({ status }) => {
  const [label, tone, icon] = STATUS[status] || STATUS.operational;
  return <Badge tone={tone}>{icon} {label}</Badge>;
};

export function overall(services = []) {
  if (services.some((s) => s.status === 'major_outage')) return 'major_outage';
  if (services.some((s) => s.status === 'degraded')) return 'degraded';
  if (services.some((s) => s.status === 'maintenance')) return 'maintenance';
  return 'operational';
}

export const OVERALL_TEXT = {
  operational: 'Semua layanan berjalan normal',
  maintenance: 'Sebagian layanan sedang dalam pemeliharaan terencana',
  degraded: 'Sebagian layanan mengalami gangguan',
  major_outage: 'Terjadi gangguan besar pada layanan',
};
