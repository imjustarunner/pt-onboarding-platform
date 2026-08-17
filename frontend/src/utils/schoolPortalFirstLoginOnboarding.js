const STORAGE_KEY = 'schoolPortalFirstLoginOnboarding';

export function isSchoolStaffRole(role) {
  return String(role || '').toLowerCase() === 'school_staff';
}

export function shouldMarkSchoolPortalFirstLoginOnboarding(user, extra = {}) {
  const role = user?.role || extra.role;
  if (!isSchoolStaffRole(role)) return false;
  return extra.isFirstLogin === true || user?.isFirstLogin === true;
}

export function markSchoolPortalFirstLoginOnboarding(user, extra = {}) {
  if (!shouldMarkSchoolPortalFirstLoginOnboarding(user, extra)) return false;
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
    return true;
  } catch {
    return false;
  }
}

export function consumeSchoolPortalFirstLoginOnboarding() {
  try {
    if (sessionStorage.getItem(STORAGE_KEY) !== '1') return false;
    sessionStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
