import { addMonthsYmd } from './scheduleRecurrence.js';

export const PAPER_PACKET_DEFAULT_ROI_TERM_MONTHS = 36;
export const ROI_TERM_OPTIONS = Object.freeze([
  { months: 12, label: '12 months' },
  { months: 36, label: '36 months (paper packet default)' }
]);

export function todayYmd(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function normalizeYmd(value) {
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

export function computeRoiExpiresAtYmd(startYmd, termMonths) {
  const start = normalizeYmd(startYmd);
  const months = Number(termMonths || 0);
  if (!start || !Number.isFinite(months) || months <= 0) return '';
  return addMonthsYmd(start, months);
}

export function formatRoiDateLabel(ymd) {
  const normalized = normalizeYmd(ymd);
  if (!normalized) return '—';
  const dt = new Date(`${normalized}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return normalized;
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
