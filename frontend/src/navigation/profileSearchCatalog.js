/**
 * In-profile search jump targets (UserProfileView + Ask Assistant profileJump).
 * tabId must match UserProfileView tab ids; sectionId is a stable DOM id when present.
 * clinicalSubTab switches Clinical Information inner nav when set.
 *
 * Imported by frontend AND backend (pure data + helpers — keep Vue-free).
 */

export const PROFILE_SEARCH_TARGETS = [
  { id: 'overview', tabId: 'overview', sectionId: '', label: 'Overview', aliases: ['summary', 'home', 'snapshot'] },
  { id: 'account', tabId: 'account', sectionId: '', label: 'Account', aliases: ['account tab', 'profile tab'] },
  { id: 'account-info', tabId: 'account', sectionId: 'account-info', label: 'Account information', aliases: ['name', 'role', 'title', 'phone', 'contact', 'email', 'account info'] },
  { id: 'professional-details', tabId: 'account', sectionId: 'professional-details', label: 'Professional details', aliases: ['modality', 'population', 'caseload', 'session length'] },
  { id: 'home-address', tabId: 'account', sectionId: 'home-address', label: 'Home address', aliases: ['address', 'street', 'city', 'zip', 'postal', 'mailing', 'home address'] },
  { id: 'licenses', tabId: 'account', sectionId: 'licenses', label: 'Licenses & Certifications', aliases: ['license', 'licenses', 'credential', 'lpcc', 'lcsw', 'certification', 'pdf', 'license upload', 'license pdf'] },
  { id: 'compensation-level', tabId: 'account', sectionId: 'compensation-level', label: 'Compensation level', aliases: ['comp level', 'pay level', 'bypass', 'compensation level'] },
  { id: 'service-availability', tabId: 'account', sectionId: 'service-availability', label: 'Service availability', aliases: ['accepting', 'new clients', 'service availability'] },
  { id: 'employment-dates', tabId: 'account', sectionId: 'employment-dates', label: 'Employment dates', aliases: ['hire date', 'start date', 'tenure', 'employment dates'] },
  { id: 'access-permissions', tabId: 'account', sectionId: 'access-permissions', label: 'Access & permissions', aliases: ['permissions', 'entitlements', 'access'] },
  { id: 'feature-access', tabId: 'account', sectionId: 'feature-access', label: 'Feature access', aliases: ['billing access', 'features', 'feature access'] },
  { id: 'supervisor-assignments', tabId: 'account', sectionId: 'supervisor-assignments', label: 'Supervisor assignments', aliases: ['supervisor assignment', 'supervisees'] },
  { id: 'agency-assignments', tabId: 'account', sectionId: 'agency-assignments', label: 'Agency assignments', aliases: ['agencies', 'agency assignment'] },
  { id: 'building-offices', tabId: 'account', sectionId: 'building-offices', label: 'Building offices', aliases: ['offices', 'building', 'office assignment'] },
  { id: 'workspace-security', tabId: 'account', sectionId: 'workspace-security', label: 'Workspace & Security', aliases: ['password', 'security', 'login', 'token', 'reset password', 'workspace'] },
  { id: 'status-management', tabId: 'account', sectionId: 'status-management', label: 'Status management', aliases: ['employee status', 'activate', 'terminate', 'mark terminated', 'status'] },
  { id: 'public-profile', tabId: 'account', sectionId: 'public-profile', label: 'Public profile', aliases: ['public bio', 'directory bio', 'marketing profile'] },
  { id: 'admin-notes', tabId: 'account', sectionId: 'admin-notes', label: 'Admin notes', aliases: ['notes', 'hr notes', 'admin note'] },
  { id: 'benefits', tabId: 'benefits', sectionId: '', label: 'Benefits', aliases: ['pto', 'insurance', '401k', 'eligibility', 'benefit'] },
  { id: 'lifecycle', tabId: 'lifecycle', sectionId: '', label: 'Lifecycle', aliases: ['lifecycle tab', 'hire checklist'] },
  { id: 'lifecycle-onboarding', tabId: 'lifecycle', sectionId: 'lifecycle-onboarding', label: 'Onboarding', aliases: ['onboarding', 'onboard', 'checklist'] },
  { id: 'lifecycle-equipment', tabId: 'lifecycle', sectionId: 'lifecycle-equipment', label: 'Equipment / Issued gear', aliases: ['equipment', 'gear', 'inventory', 'cart', 'hoodie', 'sizes', 'badge', 'keys', 'issued gear', 'stock'] },
  { id: 'lifecycle-offboarding', tabId: 'lifecycle', sectionId: 'lifecycle-offboarding', label: 'Offboarding', aliases: ['offboarding', 'offboard', 'termination', 'separation', 'last day', 'termination date'] },
  { id: 'payroll', tabId: 'payroll', sectionId: '', label: 'Payroll', aliases: ['pay', 'wages', 'compensation', 'time', 'payroll tab'] },
  { id: 'credentialing', tabId: 'credentialing', sectionId: '', label: 'Credentialing', aliases: ['payer', 'npi', 'caqh', 'credentialing tab'] },
  { id: 'affiliations', tabId: 'affiliations', sectionId: '', label: 'Affiliations', aliases: ['school', 'program', 'learning', 'affiliation'] },
  { id: 'schedule_availability', tabId: 'schedule_availability', sectionId: '', label: 'Schedule & Availability', aliases: ['schedule', 'availability', 'slots', 'extra availability'] },
  { id: 'training', tabId: 'training', sectionId: '', label: 'Training', aliases: ['lms', 'courses', 'modules', 'training tab'] },
  { id: 'documents', tabId: 'documents', sectionId: '', label: 'Documents', aliases: ['files', 'docs', 'signing', 'documents tab'] },
  { id: 'communications', tabId: 'communications', sectionId: '', label: 'Communications', aliases: ['messages', 'sms', 'email log', 'communications tab'] },
  { id: 'preferences', tabId: 'preferences', sectionId: '', label: 'Preferences', aliases: ['settings', 'notifications prefs', 'preferences tab'] },
  { id: 'supervision', tabId: 'supervision', sectionId: '', label: 'Supervision', aliases: ['supervisor', 'supervisee', 'supervision tab'] },
  { id: 'provider_info', tabId: 'provider_info', sectionId: '', label: 'Clinical Information', aliases: ['clinical', 'provider info', 'clinical information'] },
  { id: 'clinical-overview', tabId: 'provider_info', sectionId: '', clinicalSubTab: 'overview', label: 'Clinical overview', aliases: ['clinical overview', 'clinical snapshot'] },
  { id: 'clinical-populations', tabId: 'provider_info', sectionId: '', clinicalSubTab: 'populations_client_focus', label: 'Populations & client focus', aliases: ['populations', 'client focus', 'age specialty'] },
  { id: 'clinical-approaches', tabId: 'provider_info', sectionId: '', clinicalSubTab: 'therapeutic_approaches', label: 'Therapeutic approaches', aliases: ['approaches', 'modality', 'modalities', 'cbt'] },
  { id: 'clinical-interventions', tabId: 'provider_info', sectionId: '', clinicalSubTab: 'interventions_techniques', label: 'Interventions & techniques', aliases: ['interventions', 'techniques', 'treatment prefs'] },
  { id: 'clinical-groups', tabId: 'provider_info', sectionId: '', clinicalSubTab: 'groups_programs', label: 'Groups & programs', aliases: ['groups', 'programs'] },
  { id: 'clinical-supervision-notes', tabId: 'provider_info', sectionId: '', clinicalSubTab: 'supervision_notes', label: 'Clinical supervision notes', aliases: ['clinician notes'] },
  { id: 'clinical-specialties', tabId: 'provider_info', sectionId: '', clinicalSubTab: 'specialties', label: 'Specialties', aliases: ['specialties', 'specialty'] },
  { id: 'clinical-administrative', tabId: 'provider_info', sectionId: '', clinicalSubTab: 'administrative', label: 'Administrative & schedule (clinical)', aliases: ['administrative', 'npi number', 'birthdate', 'languages spoken'] },
  { id: 'clinical-personal-bio', tabId: 'provider_info', sectionId: '', clinicalSubTab: 'personal_bio', label: 'Personal & bio', aliases: ['personal bio', 'about me', 'why counselor'] },
  { id: 'clinical-all-fields', tabId: 'provider_info', sectionId: '', clinicalSubTab: 'all_fields', label: 'All profile fields', aliases: ['all fields', 'all profile fields'] },
  { id: 'departments', tabId: 'departments', sectionId: '', label: 'Departments', aliases: ['department'] },
  { id: 'activity', tabId: 'activity', sectionId: '', label: 'Activity Log', aliases: ['activity', 'audit', 'history', 'activity log'] },
  { id: 'admin_docs', tabId: 'admin_docs', sectionId: '', label: 'Admin Documentation', aliases: ['admin docs', 'admin documentation'] },
];

function escapeRegExp(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rank profile search hits for a query. Higher score = better.
 */
export function scoreProfileSearchTarget(query, target) {
  const q = String(query || '').trim().toLowerCase();
  if (!q || !target) return 0;
  const label = String(target.label || '').toLowerCase();
  const aliases = (target.aliases || []).map((a) => String(a).toLowerCase());
  const hay = [label, target.tabId, target.sectionId, target.clinicalSubTab, ...aliases]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  const parts = q.split(/\s+/).filter(Boolean);
  const allParts = parts.every((part) => hay.includes(part));
  if (!hay.includes(q) && !allParts) return 0;

  let score = 10;
  if (aliases.some((a) => a === q)) score += 120;
  else if (label === q) score += 110;
  else if (aliases.some((a) => a.startsWith(q) || q.startsWith(a))) score += 70;
  else if (label.includes(q)) score += 45;
  else if (allParts) score += 30;

  // Prefer deeper anchors over bare tabs when equally matched
  if (target.sectionId) score += 28;
  if (target.clinicalSubTab) score += 22;

  // Whole-word boost for multi-word aliases
  for (const a of aliases) {
    if (a.length < 3) continue;
    const re = new RegExp(`\\b${escapeRegExp(a)}\\b`);
    if (re.test(q) || re.test(hay) && q.includes(a)) score += 8;
  }
  return score;
}

export function filterProfileSearchTargets(query, allowedTabIds = null) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return [];
  const allowed = allowedTabIds ? new Set(allowedTabIds) : null;
  return PROFILE_SEARCH_TARGETS
    .filter((t) => (!allowed || allowed.has(t.tabId)))
    .map((t) => ({ ...t, score: scoreProfileSearchTarget(q, t) }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score || String(a.label).localeCompare(String(b.label)))
    .slice(0, 10);
}

/**
 * Strip navigation filler words so "open licenses" ≈ "licenses".
 */
export function normalizeProfileSearchQuery(query) {
  return String(query || '')
    .toLowerCase()
    .replace(/\b(take me to|go to|navigate to|navigate|open|visit|show me|show|find|search for|search|look up|look for|please|the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9\s&#/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Best single profile section for assistant short prompts (equipment, licenses, …).
 */
export function resolveBestProfileSection(query, allowedTabIds = null) {
  const cleaned = normalizeProfileSearchQuery(query);
  const hits = filterProfileSearchTargets(cleaned || query, allowedTabIds);
  if (!hits.length) return null;
  const best = hits[0];
  if (best.score < 40) return null;
  // Prefer section/clinical-specific hits when score is competitive
  const deep = hits.find((h) => h.sectionId || h.clinicalSubTab);
  if (deep && deep.score >= best.score - 20) return deep;
  return best;
}

/** True when assistant context indicates an admin user profile page. */
export function isUserProfileContext(context = {}) {
  const routeName = String(context?.routeName || '');
  const path = String(context?.path || context?.fullPath || '');
  const profileUserId = Number(context?.profileUserId || context?.userId || 0) || null;
  return (
    /UserProfile|OrganizationUserProfile/i.test(routeName) ||
    /\/admin\/users\/\d+/.test(path) ||
    !!profileUserId
  );
}
