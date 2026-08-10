/**
 * Paper-packet school ROI expiration defaults.
 *
 * Historical paper packets (before 2026-08-09) expire in 1 year.
 * Packets uploaded on/after 2026-08-09 expire in 3 years.
 * Smart/digital school ROI completion uses its own path (+3 years) and should not use this helper.
 */

export const PAPER_PACKET_ROI_3Y_START = '2026-08-09';

function toDateOnly(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const raw = String(value || '').trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
}

export function paperPacketRoiYears(fromDate = new Date()) {
  const d = toDateOnly(fromDate) || toDateOnly(new Date());
  const cutoff = toDateOnly(PAPER_PACKET_ROI_3Y_START);
  if (d.getTime() < cutoff.getTime()) return 1;
  return 3;
}

/** @returns {string} YYYY-MM-DD */
export function paperPacketRoiExpiresAtYmd(fromDate = new Date()) {
  const d = toDateOnly(fromDate) || toDateOnly(new Date());
  const years = paperPacketRoiYears(d);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
