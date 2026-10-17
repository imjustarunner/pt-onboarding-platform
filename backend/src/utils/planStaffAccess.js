const STAFF_PLAN_ROLES = new Set(['super_admin', 'admin', 'agency_admin', 'provider', 'provider_plus', 'supervisor', 'clinical_practice_assistant', 'support', 'staff', 'intern', 'intern_plus']);

// Agency membership alone does not authorize the staff view of every observer.
export function requireStaffPlanActor(user) {
  if (!user?.id || !STAFF_PLAN_ROLES.has(String(user.role || '').toLowerCase())) {
    throw Object.assign(new Error('Staff plan access is required. Use your own portal for family observations.'), { status: 403 });
  }
}

export function guardianLearningRouteAllowed(method, path) {
  const reads = [/^\/taxonomy$/, /^\/clients\/\d+\/(guardian-feed|guardian-dashboard|practice|packages|package-entitlements)$/];
  const writes = [/^\/practice\/\d+\/complete$/, /^\/clients\/\d+\/packages\/\d+\/(checkout|confirm)$/];
  return (method === 'GET' && reads.some(pattern => pattern.test(path))) || (method === 'POST' && writes.some(pattern => pattern.test(path)));
}
