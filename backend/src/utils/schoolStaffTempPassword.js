export const CUSTOM_SCHOOL_STAFF_TEMP_PASSWORD_ROLES = new Set(['admin', 'super_admin', 'support']);

export function actorCanSetCustomSchoolStaffTempPassword(actorRole) {
  return CUSTOM_SCHOOL_STAFF_TEMP_PASSWORD_ROLES.has(String(actorRole || '').toLowerCase());
}

export function resolveSchoolStaffTemporaryPassword({ actorRole, requestedPassword, minLength = 8 }) {
  const requested = String(requestedPassword || '').trim();
  if (!requested) return { ok: true, password: null };
  if (!actorCanSetCustomSchoolStaffTempPassword(actorRole)) {
    return { ok: true, password: null };
  }
  if (requested.length < minLength) {
    return { ok: false, error: `Temporary password must be at least ${minLength} characters` };
  }
  if (requested.length > 128) {
    return { ok: false, error: 'Temporary password must be no more than 128 characters' };
  }
  if (!/[a-zA-Z]/.test(requested)) {
    return { ok: false, error: 'Temporary password must contain at least one letter' };
  }
  return { ok: true, password: requested };
}
