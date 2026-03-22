/**
 * Normalize clients.skills from API (0/1, booleans, strings).
 * Keeps admin "Skills client" and Events / groups tab in sync.
 */
export function isSkillsClientFlag(raw) {
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0 || raw == null) return false;
  if (typeof raw === 'bigint') return raw !== 0n;
  if (typeof raw === 'number') return raw !== 0 && Number.isFinite(raw);
  if (typeof raw === 'string') {
    const s = raw.trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(s)) return true;
    if (['0', 'false', 'no', 'n', ''].includes(s)) return false;
    return false;
  }
  return !!raw;
}
