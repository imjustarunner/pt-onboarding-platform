import { checkPasswordBasics } from './passwordValidation.js';

export const CUSTOM_SCHOOL_STAFF_TEMP_PASSWORD_ROLES = new Set(['admin', 'super_admin', 'support']);

export function actorCanSetCustomSchoolStaffTempPassword(actorRole) {
  return CUSTOM_SCHOOL_STAFF_TEMP_PASSWORD_ROLES.has(String(actorRole || '').toLowerCase());
}

export function resolveSchoolStaffTemporaryPassword({ actorRole, requestedPassword }) {
  const requested = String(requestedPassword || '').trim();
  if (!requested) return { ok: true, password: null };
  if (!actorCanSetCustomSchoolStaffTempPassword(actorRole)) {
    return { ok: true, password: null };
  }
  const basics = checkPasswordBasics(requested);
  if (!basics.valid) {
    return {
      ok: false,
      error: basics.message.replace(/^Password/, 'Temporary password')
    };
  }
  return { ok: true, password: requested };
}
