/** Temporary passwords are also stored in password_hash. They are not proof
 * that a guardian completed password setup, even after the temporary expiry. */
export function hasEstablishedPortalPassword(user) {
  return Boolean(user?.password_hash) && !user?.temporary_password_hash;
}
