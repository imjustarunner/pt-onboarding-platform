export function isAccountDisabled(user) {
  const status = String(user?.status || '').trim().toUpperCase();
  return [false, 0, '0'].includes(user?.is_active)
    || [true, 1, '1'].includes(user?.is_archived)
    || ['ARCHIVED', 'INACTIVE_EMPLOYEE'].includes(status);
}

export function assertAccountEnabled(user) {
  if (!user) throw Object.assign(new Error('Account no longer exists. Sign in again.'), {
    status: 401, statusCode: 401, code: 'ACCOUNT_UNAVAILABLE'
  });
  if (isAccountDisabled(user)) throw Object.assign(new Error('Account is inactive. Contact your administrator.'), {
    status: 403, statusCode: 403, code: 'ACCOUNT_DISABLED'
  });
}
