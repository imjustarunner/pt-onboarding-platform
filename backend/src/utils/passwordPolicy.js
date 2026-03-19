export function calcPasswordExpiry(u) {
  const role = String(u?.role || '').toLowerCase();
  const changedAt = u?.password_changed_at ? new Date(u.password_changed_at) : (u?.created_at ? new Date(u.created_at) : null);
  if (!changedAt || Number.isNaN(changedAt.getTime())) {
    return {
      requiresPasswordChange: false,
      passwordExpiresAt: null,
      passwordExpired: false,
      passwordPolicyDays: role === 'school_staff' ? 90 : 180
    };
  }

  const expiresAt = new Date(changedAt.getTime());
  if (role === 'school_staff') {
    expiresAt.setDate(expiresAt.getDate() + 90);
  } else {
    expiresAt.setMonth(expiresAt.getMonth() + 6);
  }

  const expired = expiresAt.getTime() <= Date.now();
  return {
    requiresPasswordChange: expired,
    passwordExpiresAt: expiresAt.toISOString(),
    passwordExpired: expired,
    passwordPolicyDays: role === 'school_staff' ? 90 : 180
  };
}
