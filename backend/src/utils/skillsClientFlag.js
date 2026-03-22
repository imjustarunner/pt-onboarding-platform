/**
 * Normalize clients.skills from MySQL / JSON (0/1, booleans, strings).
 * Matches product intent: "Skills client" in admin UI and Skill Builders gating.
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
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    return raw.length > 0 && raw[0] === 1;
  }
  return !!raw;
}
