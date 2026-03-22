/**
 * Format MySQL-style wall time (e.g. "15:15:00", "9:05") for Skill Builders UI — 12-hour clock, no seconds.
 */
export function formatSkillBuilderWallTime12h(t) {
  const raw = String(t || '').trim();
  if (!raw) return '—';
  const m = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!m) return raw.length <= 8 ? raw : raw.slice(0, 8);
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return raw.slice(0, 8);
  h = ((h % 24) + 24) % 24;
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(min).padStart(2, '0')} ${ap}`;
}
