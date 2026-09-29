const enabled = value => value === true || value === 1 || value === '1';

/** Managed email groups are delivery addresses, not Google sign-in accounts. */
export function usesPasswordLogin(user) {
  return enabled(user?.sso_password_override) || enabled(user?.login_is_group_email) || enabled(user?.is_demo);
}
