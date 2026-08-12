/** Timed full-name reveal on school portals (HIPAA acknowledgment). */
export const SCHOOL_PORTAL_FULL_NAME_MS = 10 * 60 * 1000;
export const SCHOOL_PORTAL_FULL_NAME_UNTIL_KEY = 'schoolPortalFullNameUntil';
export const SCHOOL_PORTAL_FULL_NAME_PREV_KEY = 'schoolPortalFullNamePrevMode';

export function formatSchoolPortalClientLabel(client, mode = 'codes') {
  const initials = String(client?.initials || client?.client_initials || '').replace(/\s+/g, '').trim();
  const code = String(client?.identifier_code || client?.client_identifier_code || '').replace(/\s+/g, '').trim();
  const fullName = String(client?.full_name || client?.client_full_name || '').trim();
  const m = String(mode || 'codes');

  if (client?.client_force_code_only || client?.school_portal_force_code) {
    return (code || initials || '').toUpperCase() || '—';
  }

  if (m === 'full_name') return fullName || initials || code || '—';
  if (m === 'initials') return initials || code || '—';
  return (code || initials || '—').toUpperCase();
}

export function formatFullNameCountdown(ms) {
  const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}
