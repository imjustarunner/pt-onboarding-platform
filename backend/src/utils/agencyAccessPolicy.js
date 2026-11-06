import { STAFF_ROLES } from './staffEligibility.js';

export const AGENCY_ACCESS_FIELDS = Object.freeze([
  ['has_hiring_access', 'Hiring process access', 'Hiring'],
  ['has_payroll_access', 'Payroll access', 'Finance'],
  ['has_billing_access', 'Medical billing access', 'Finance'],
  ['has_department_access', 'Budget and department access', 'Finance'],
  ['can_manage_credentialing', 'Credentialing access', 'Finance'],
  ['has_medical_records_release_access', 'Medical records release', 'Records'],
  ['has_outreach_access', 'Outreach Hub access', 'Operations'],
  ['is_marketing_contact', 'Marketing contact', 'Operations'],
  ['has_provider_access', 'Provider access', 'Clinical'],
  ['has_staff_access', 'Staff access', 'Operations'],
  ['has_supervisor_privileges', 'Supervisor privileges', 'Clinical'],
  ['has_skill_builder_coordinator_access', 'Program coordinator access', 'Programs'],
  ['skill_builder_eligible', 'Skill development program eligible', 'Programs'],
  ['group_supervision_eligible', 'Group supervision eligible', 'Clinical'],
  ['has_games_access', 'Games access', 'Programs'],
  ['company_card_enabled', 'Company card', 'Employment'],
  ['company_car_submit_access', 'Company car submit', 'Employment'],
  ['company_car_manage_access', 'Company car manage', 'Employment'],
  ['is_hourly_worker', 'Hourly worker', 'Employment']
].map(([key, label, group]) => Object.freeze({ key, label, group })));

export const AGENCY_ACCESS_KEYS = new Set(AGENCY_ACCESS_FIELDS.map(f => f.key));
export const PLATFORM_SERVICE_FIELDS = Object.freeze([
  {key:'has_platform_support',label:'Platform support (PlotTwistHQ tickets)'},
  {key:'has_platform_gear_access',label:'Platform Gear & Materials'}
]);
export const AGENCY_ACCESS_ROLES = STAFF_ROLES.filter(role => role !== 'super_admin');
export const jsonAccess = value => typeof value === 'string' ? JSON.parse(value) : (value || {});
export const accessEnabled = value => [true, 1, '1'].includes(value);

// Existing grants are the fallback. A deliberate local override always wins,
// including false; selected platform defaults also cover access-only companies.
export function resolveAgencyAccess(profile, defaults = null) {
  const baseline = jsonAccess(profile.permissions_baseline);
  const overrides = jsonAccess(profile.permissions_overrides);
  const inherited = defaults?.enabled ? { ...jsonAccess(defaults.permissions_json) } : {};
  if (defaults?.enabled && defaults.role) {
    if (!Object.hasOwn(inherited, 'has_hiring_access') && ['admin','support','staff'].includes(defaults.role)) inherited.has_hiring_access = true;
    if (!Object.hasOwn(inherited, 'has_outreach_access') && ['admin','support'].includes(defaults.role)) inherited.has_outreach_access = true;
  }
  const permissions = {}, sources = {};
  for (const { key } of AGENCY_ACCESS_FIELDS) {
    const local = Object.hasOwn(overrides, key);
    const platform = Object.hasOwn(inherited, key);
    const roleGrant = key === 'has_hiring_access' ? ['admin','support','staff'].includes(profile.role_override)
      : key === 'has_outreach_access' && ['admin','support'].includes(profile.role_override);
    permissions[key] = accessEnabled(local ? overrides[key] : platform ? inherited[key] : roleGrant || baseline[key]);
    sources[key] = local ? 'agency_override' : platform ? 'platform_default' : roleGrant ? 'agency_role' : 'preserved_agency_access';
  }
  const role = profile.role_override || (defaults?.enabled && defaults.role) || profile.role_baseline;
  return { role, permissions, sources, roleSource: profile.role_override ? 'agency_override'
    : defaults?.enabled && defaults.role ? 'platform_default' : 'preserved_agency_access' };
}

export function validateAgencyAccessPatch(input, { platform = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Object.assign(new Error('Choose access settings.'), { status: 400 });
  const allowed = new Set(['role', 'permissions', 'revision', ...(platform ? ['enabled','platformServices'] : [])]);
  if (Object.keys(input).some(key => !allowed.has(key))) throw Object.assign(new Error('Unknown access setting.'), { status: 400 });
  if (Object.hasOwn(input, 'role') && input.role !== null && !AGENCY_ACCESS_ROLES.includes(input.role)) {
    throw Object.assign(new Error('Choose an agency working role. Superadmin authority is managed separately.'), { status: 400 });
  }
  if (platform && Object.hasOwn(input, 'enabled') && typeof input.enabled !== 'boolean') throw Object.assign(new Error('Choose whether platform defaults are enabled.'), { status: 400 });
  if (input.platformServices !== undefined && (!platform || !input.platformServices || typeof input.platformServices !== 'object'
    || Array.isArray(input.platformServices) || Object.entries(input.platformServices).some(([key,value])=>!PLATFORM_SERVICE_FIELDS.some(f=>f.key===key)||typeof value!=='boolean'))) {
    throw Object.assign(new Error('Choose valid platform service permissions.'), {status:400});
  }
  if (input.permissions !== undefined && (!input.permissions || typeof input.permissions !== 'object' || Array.isArray(input.permissions)
      || Object.entries(input.permissions).some(([key, value]) => !AGENCY_ACCESS_KEYS.has(key) || (value !== null && typeof value !== 'boolean')))) {
    throw Object.assign(new Error('Choose On, Off, or Inherit for each permission.'), { status: 400 });
  }
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) throw Object.assign(new Error('Refresh access settings before saving.'), { status: 409 });
  return input;
}

export function applyAgencyAccess(user, access) {
  if (!access) return user;
  return { ...user, ...access.permissions,
    role: user.role === 'super_admin' ? 'super_admin' : access.role,
    platformRole: user.platformRole || user.role, agencyAccess: access };
}
