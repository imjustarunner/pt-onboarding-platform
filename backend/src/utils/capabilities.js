import { checkAccess } from './accessControl.js';

/**
 * Derive a consistent set of capabilities from a user record.
 * This is the server-side source of truth for feature flags / permissions.
 *
 * @param {object|null} user - user record (prefer DB row) with at least { role, status }.
 * @returns {object} capabilities object
 */
export function getUserCapabilities(user) {
  const role = user?.role || null;
  const status = user?.status || null;

  // Default deny
  const base = {
    canAccessPlatform: false,
    canViewTraining: false,
    canSignDocuments: false,
    canJoinProgramEvents: false,
    canUseChat: false,
    canManageHiring: false
  };

  if (!user) return base;
  if (status === 'ARCHIVED') return base;

  // Guardian portal accounts: non-clinical access.
  // They should be able to access the platform shell + documents + links/materials, but not admin tooling.
  if (role === 'client_guardian') {
    return {
      ...base,
      canAccessPlatform: true,
      canViewTraining: true, // used for "program materials" in non-clinical programs
      canSignDocuments: true,
      canJoinProgramEvents: true,
      canUseChat: false
    };
  }

  // Existing status-based access model
  const access = checkAccess(user);

  // NOTE: These are conservative defaults based on current platform behavior.
  // Future roles (e.g., client/participant) can be added here without changing callers.
  const isApprovedEmployee = role === 'approved_employee' || user?.type === 'approved_employee';

  // Access to the app shell (navigation + general pages).
  // (For future: sign-only clients may have this false even if authenticated.)
  const canAccessPlatform = !!access.canAccessDashboard || !!access.canAccessAdmin || isApprovedEmployee;

  // Training visibility (admin training modules + onboarding training + on-demand).
  const canViewTraining = !!access.canAccessTraining || isApprovedEmployee;

  // Document actions (signing + viewing documents).
  const canSignDocuments = !!access.canAccessDocuments;

  // Program/event links (placeholder until programs/events have a dedicated access model).
  const canJoinProgramEvents = canAccessPlatform;

  // Chat feature (placeholder; currently mainly used by privileged roles).
  const canUseChat = canAccessPlatform;

  // Hiring/candidate collaboration tools.
  // Defaults: backoffice roles can manage hiring. Optionally allow any user explicitly flagged.
  const roleNorm = String(role || '').toLowerCase();
  const hasHiringFlag = user?.has_hiring_access === true || user?.has_hiring_access === 1 || user?.has_hiring_access === '1';
  const canManageHiring = ['admin', 'super_admin', 'support', 'staff'].includes(roleNorm) || hasHiringFlag;

  return {
    ...base,
    canAccessPlatform,
    canViewTraining,
    canSignDocuments,
    canJoinProgramEvents,
    canUseChat,
    canManageHiring
  };
}

