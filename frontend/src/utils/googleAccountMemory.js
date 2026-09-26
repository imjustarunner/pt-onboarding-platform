import { getRememberedGoogleLogin, setRememberedGoogleLogin, shouldRememberSso } from './loginRemember';

export function hasRememberedGoogleAccount(user) {
  const saved = getRememberedGoogleLogin();
  if (!user?.id || !saved) return false;
  const addresses = [user.email, user.username].filter(Boolean).map(v => String(v).toLowerCase());
  return [saved.username, saved.loginHint].some(v => addresses.includes(String(v || '').toLowerCase()));
}

// Call only with server-verified session/bootstrap data. A shortcut is never proof
// of authentication; the button always goes through Google's normal OAuth flow.
export function rememberVerifiedGoogleAccount({ user, authMethod, orgSlug, agencies = [], remember = true }) {
  if (authMethod !== 'google' || !user?.id || !orgSlug || !remember || !shouldRememberSso(orgSlug)) return false;
  const agency = agencies.find(a => [a.slug, a.portal_url, a.portalUrl].includes(orgSlug));
  setRememberedGoogleLogin({
    username: user.username || user.email, orgSlug,
    displayName: [user.firstName || user.first_name, user.lastName || user.last_name].filter(Boolean).join(' '),
    loginHint: user.email, organizationName: agency?.name || '', title: user.title || ''
  });
  return true;
}
