/**
 * Format API clock strings (HH:mm or HH:mm:ss, 24h) as h:mm AM/PM.
 * Unrecognized values are returned trimmed (unchanged).
 */
export function formatTimeHm12h(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return '—';
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return s;
  const h = parseInt(m[1], 10);
  const min = m[2];
  if (!Number.isFinite(h) || h < 0 || h > 23) return s;
  const ap = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${min} ${ap}`;
}

/** e.g. 08:00–15:00 → 8:00 AM–3:00 PM */
export function formatTimeRange12h(start, end) {
  const s = String(start ?? '').trim();
  const e = String(end ?? '').trim();
  if (!s && !e) return '—';
  const a = formatTimeHm12h(s);
  const b = formatTimeHm12h(e);
  if (s && !e) return a;
  if (!s && e) return b;
  return `${a}–${b}`;
}
