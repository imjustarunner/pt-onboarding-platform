import { useAuthStore } from '../store/auth';
import { useAgencyStore } from '../store/agency';
import { getDashboardRoute } from './router';
import { getPrimarySchoolStaffPortalSlug } from './schoolStaffPortal.js';
import { storeUserAgencies } from './loginRedirect.js';

function markJustLoggedIn() {
  try {
    sessionStorage.setItem('justLoggedIn', 'true');
    sessionStorage.setItem('justLoggedInAt', String(Date.now()));
  } catch {
    // ignore
  }
}

/**
 * Persist the JWT from a password-set / reset-token response and send the user
 * to their home (school portal for school staff, otherwise the usual dashboard).
 */
export async function completePasswordTokenLogin(payload, router) {
  const authStore = useAuthStore();
  const agencyStore = useAgencyStore();
  const user = payload?.user || null;
  const agencies = Array.isArray(payload?.agencies) ? payload.agencies : [];

  authStore.setAuth(payload?.token || null, user ? { ...user, agencies } : null, payload?.sessionId);
  markJustLoggedIn();

  if (agencies.length && String(user?.role || '').toLowerCase() !== 'super_admin') {
    agencyStore.applyLoginAgencies(agencies);
  } else if (String(user?.role || '').toLowerCase() !== 'super_admin' && String(user?.type || '') !== 'approved_employee') {
    try {
      await agencyStore.fetchUserAgencies();
    } catch {
      storeUserAgencies(agencies);
    }
  } else if (agencies.length) {
    agencyStore.applyLoginAgencies(agencies);
  }

  const role = String(authStore.user?.role || '').toLowerCase();
  const agencyList = agencyStore.userAgencies || agencies || [];
  let dest = getDashboardRoute();
  if (role === 'school_staff') {
    const slug = getPrimarySchoolStaffPortalSlug(agencyList);
    if (slug) dest = `/${slug}/dashboard`;
  }

  await router.replace(dest);
}
