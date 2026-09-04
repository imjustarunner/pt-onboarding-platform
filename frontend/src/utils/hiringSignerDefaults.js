/** Resolve Haley Inyart as default hiring signer when role has no default. */
export const DEFAULT_HIRING_SIGNER_EMAIL = 'haley@plottwistco.com';

export function findDefaultHiringSignerUserId(staffUsers = [], preferredEmail = DEFAULT_HIRING_SIGNER_EMAIL) {
  const email = String(preferredEmail || '').trim().toLowerCase();
  const list = Array.isArray(staffUsers) ? staffUsers : [];
  const byEmail = list.find((u) => String(u?.email || '').trim().toLowerCase() === email);
  if (byEmail?.id) return Number(byEmail.id);
  const byName = list.find((u) => {
    const first = String(u?.first_name || u?.firstName || '').trim().toLowerCase();
    const last = String(u?.last_name || u?.lastName || '').trim().toLowerCase();
    return first === 'haley' && last === 'inyart';
  });
  return byName?.id ? Number(byName.id) : null;
}

export function mapSignerRolesWithDefaults(roles, staffUsers = []) {
  const fallbackId = findDefaultHiringSignerUserId(staffUsers);
  const list = Array.isArray(roles) ? roles : [];
  return list.map((r, index) => {
    const existing = r.default_user_id || r.defaultUserId || null;
    const label = String(r.role_label || r.roleLabel || '').toLowerCase();
    const shouldDefaultHaley =
      !existing
      && fallbackId
      && (index === 0 || label.includes('hiring') || label.includes('manager'));
    return {
      id: r.id,
      roleLabel: r.role_label || r.roleLabel,
      userId: existing || (shouldDefaultHaley ? fallbackId : null),
      fieldKey: r.field_key || r.fieldKey || null
    };
  });
}
