/** Temporary passwords are also stored in password_hash. They are not proof
 * that a guardian completed password setup, even after the temporary expiry. */
export function hasEstablishedPortalPassword(user) {
  return Boolean(user?.password_hash) && !user?.temporary_password_hash;
}

/** Safe administrative status from presence flags; never return credential artifacts. */
export function portalPasswordSetupStatus(account, now = Date.now()) {
  const known = value => value === 0 || value === 1 || value === true || value === false || value === '0' || value === '1';
  if (!known(account?.hasEstablishedPassword)) return 'unknown';
  if (Boolean(Number(account.hasEstablishedPassword))) return 'password_set';
  if (Boolean(Number(account.hasTemporaryPassword))) {
    const expiry = new Date(account.temporaryPasswordExpiresAt || '').getTime();
    if (!Number.isFinite(expiry)) return 'unknown';
    return expiry > Number(now) ? 'temporary_password' : 'temporary_password_expired';
  }
  if (Boolean(Number(account.hasPasswordSetupLink))) {
    const expiry = new Date(account.passwordSetupLinkExpiresAt || '').getTime();
    if (!Number.isFinite(expiry)) return 'unknown';
    return expiry > Number(now) ? 'setup_link_pending' : 'setup_link_expired';
  }
  return 'setup_required';
}
