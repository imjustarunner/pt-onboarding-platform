/** Shared roster-editor field catalog. Keys must stay stable. */

export const USER_GRID_MAX_COLUMNS = 10;

export const USER_GRID_STATUS_OPTIONS = [
  { value: 'PENDING', label: 'Pending' },
  { value: 'ONBOARDING', label: 'Onboarding' },
  { value: 'ACTIVE_EMPLOYEE', label: 'Active' },
  { value: 'INACTIVE_EMPLOYEE', label: 'Inactive' },
  { value: 'ARCHIVED', label: 'Archived' }
];

export const USER_GRID_ROLE_OPTIONS = [
  { value: 'provider', label: 'Provider' },
  { value: 'provider_plus', label: 'Provider Plus' },
  { value: 'staff', label: 'Staff' },
  { value: 'support', label: 'Staff (admin tools)' },
  { value: 'school_staff', label: 'School staff' },
  { value: 'admin', label: 'Admin' },
  { value: 'clinical_practice_assistant', label: 'CPA' },
  { value: 'client_guardian', label: 'Guardian' }
];

export const USER_GRID_EMPLOYMENT_TYPE_OPTIONS = [
  { value: 'full_time', label: 'Full time' },
  { value: 'part_time', label: 'Part time' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'intern', label: 'Intern' },
  { value: 'per_diem', label: 'Per diem' }
];

export const USER_GRID_MEDCANCEL_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' }
];

/** @typedef {{ key: string, label: string, group: string, type: string, source: string, editable?: boolean, sortable?: boolean, needsAgency?: boolean, personas?: string[], options?: {value:string,label:string}[], userField?: string, infoKey?: string }} UserGridField */

/** @type {UserGridField[]} */
export const USER_GRID_FIELDS = [
  { key: 'is_demo', label: 'Demo / test', group: 'Account', type: 'boolean', source: 'user', userField: 'isDemo', editable: true, sortable: true },
  { key: 'preferred_name', label: 'Preferred name', group: 'Account', type: 'text', source: 'user', userField: 'preferredName', editable: true, sortable: true },
  { key: 'title', label: 'Title', group: 'Account', type: 'text', source: 'user', userField: 'title', editable: true, sortable: true },
  { key: 'credential', label: 'Credential', group: 'Account', type: 'text', source: 'user', userField: 'credential', editable: true, sortable: true },
  { key: 'service_focus', label: 'Service focus', group: 'Account', type: 'text', source: 'user', userField: 'serviceFocus', editable: true, sortable: true },
  { key: 'languages_spoken', label: 'Languages', group: 'Account', type: 'text', source: 'user', userField: 'languagesSpoken', editable: true, sortable: true },
  { key: 'personal_email', label: 'Personal email', group: 'Account', type: 'text', source: 'user', userField: 'personalEmail', editable: true, sortable: true },
  { key: 'personal_phone', label: 'Personal phone', group: 'Account', type: 'text', source: 'user', userField: 'personalPhone', editable: true, sortable: true },
  { key: 'work_phone', label: 'Work phone', group: 'Account', type: 'text', source: 'user', userField: 'workPhone', editable: true, sortable: true },
  { key: 'psychology_today_url', label: 'Psychology Today', group: 'Account', type: 'url', source: 'user', userField: 'psychologyTodayUrl', editable: true, sortable: true },
  { key: 'date_of_birth', label: 'Birthdate', group: 'Account', type: 'date', source: 'info', infoKey: 'date_of_birth', editable: true, sortable: true },

  { key: 'status', label: 'Status', group: 'Employment', type: 'select', source: 'user', userField: 'status', editable: true, sortable: true, options: USER_GRID_STATUS_OPTIONS },
  { key: 'role', label: 'Role', group: 'Employment', type: 'select', source: 'user', userField: 'role', editable: true, sortable: true, options: USER_GRID_ROLE_OPTIONS },
  { key: 'provider_start_date', label: 'Start date', group: 'Employment', type: 'date', source: 'user', userField: 'providerStartDate', editable: true, sortable: true },
  { key: 'employment_type', label: 'Employment type', group: 'Employment', type: 'select', source: 'user', userField: 'employmentType', editable: true, sortable: true, options: USER_GRID_EMPLOYMENT_TYPE_OPTIONS },
  { key: 'department', label: 'Department', group: 'Employment', type: 'text', source: 'user', userField: 'department', editable: true, sortable: true },

  { key: 'offer_accepted_date', label: 'Offer accepted', group: 'Lifecycle', type: 'date', source: 'lifecycle', infoKey: 'offer_accepted_date', editable: true, sortable: true },
  { key: 'lifecycle_start_date', label: 'Lifecycle start', group: 'Lifecycle', type: 'date', source: 'lifecycle', infoKey: 'start_date', editable: true, sortable: true },
  { key: 'orientation_date', label: 'Orientation', group: 'Lifecycle', type: 'date', source: 'lifecycle', infoKey: 'orientation_date', editable: true, sortable: true },
  { key: 'first_client_date', label: 'First client', group: 'Lifecycle', type: 'date', source: 'lifecycle', infoKey: 'first_client_date', editable: true, sortable: true },
  { key: 'first_payroll_submission_date', label: 'First payroll', group: 'Lifecycle', type: 'date', source: 'lifecycle', infoKey: 'first_payroll_submission_date', editable: true, sortable: true },
  { key: 'probation_end_date', label: 'Probation end', group: 'Lifecycle', type: 'date', source: 'lifecycle', infoKey: 'probation_end_date', editable: true, sortable: true },
  { key: 'termination_date', label: 'Termination date', group: 'Lifecycle', type: 'date', source: 'user_col', userField: 'termination_date', editable: true, sortable: true },

  { key: 'has_payroll_access', label: 'Payroll access', group: 'Permissions', type: 'boolean', source: 'agency_flag', editable: true, sortable: true },
  { key: 'has_billing_access', label: 'Billing access', group: 'Permissions', type: 'boolean', source: 'agency_flag', editable: true, sortable: true },
  { key: 'has_hiring_access', label: 'Hiring access', group: 'Permissions', type: 'boolean', source: 'user', userField: 'hasHiringAccess', editable: true, sortable: true },
  { key: 'has_outreach_access', label: 'Outreach access', group: 'Permissions', type: 'boolean', source: 'user', userField: 'hasOutreachAccess', editable: true, sortable: true },
  { key: 'has_credentialing_access', label: 'Credentialing access', group: 'Permissions', type: 'boolean', source: 'agency_flag', editable: true, sortable: true },
  { key: 'has_games_access', label: 'Games access', group: 'Permissions', type: 'boolean', source: 'user', userField: 'hasGamesAccess', editable: true, sortable: true },
  { key: 'has_supervisor_privileges', label: 'Supervisor privileges', group: 'Permissions', type: 'boolean', source: 'user', userField: 'hasSupervisorPrivileges', editable: true, sortable: true },
  { key: 'has_provider_access', label: 'Provider access', group: 'Permissions', type: 'boolean', source: 'user', userField: 'hasProviderAccess', editable: true, sortable: true },

  { key: 'company_card_enabled', label: 'Company card', group: 'Features', type: 'boolean', source: 'user', userField: 'companyCardEnabled', editable: true, sortable: true },
  { key: 'skill_builder_eligible', label: 'Skill Builders eligible', group: 'Features', type: 'boolean', source: 'user', userField: 'skillBuilderEligible', editable: true, sortable: true },
  { key: 'provider_accepting_new_clients', label: 'Accepting new clients', group: 'Features', type: 'boolean', source: 'user', userField: 'providerAcceptingNewClients', editable: true, sortable: true },
  { key: 'is_hourly_worker', label: 'Hourly worker', group: 'Features', type: 'boolean', source: 'user', userField: 'isHourlyWorker', editable: true, sortable: true },
  { key: 'medcancel_rate_schedule', label: 'Med cancel schedule', group: 'Features', type: 'select', source: 'user', userField: 'medcancelRateSchedule', editable: true, sortable: true, options: USER_GRID_MEDCANCEL_OPTIONS },

  { key: 'comp_level', label: 'Pay level', group: 'Payroll', type: 'select', source: 'payroll', editable: true, sortable: true, needsAgency: true },
  { key: 'pay_system_enabled', label: 'Pay system', group: 'Payroll', type: 'boolean', source: 'payroll_flag', editable: true, sortable: true, needsAgency: true },
  { key: 'waive_probation', label: 'Waive probation', group: 'Payroll', type: 'boolean', source: 'payroll_flag', editable: true, sortable: true, needsAgency: true },
  { key: 'spanish_bonus_eligible', label: 'Spanish bonus', group: 'Payroll', type: 'boolean', source: 'payroll_flag', editable: true, sortable: true, needsAgency: true },

  { key: 'last_login', label: 'Last login', group: 'Activity', type: 'datetime', source: 'activity', editable: false, sortable: true },
  { key: 'created_at', label: 'Created', group: 'Activity', type: 'datetime', source: 'user_col', userField: 'created_at', editable: false, sortable: true },
  { key: 'agencies', label: 'Agencies', group: 'Affiliations', type: 'text', source: 'affiliation', editable: false, sortable: true },
  { key: 'schools', label: 'Schools', group: 'Affiliations', type: 'text', source: 'affiliation', editable: false, sortable: true },
  { key: 'districts', label: 'Districts', group: 'Affiliations', type: 'text', source: 'affiliation', editable: false, sortable: true },

  { key: 'admin_doc_contract', label: 'Contract', group: 'Documents', type: 'file', source: 'admin_doc', editable: true, sortable: true }
];

const FIELD_BY_KEY = new Map(USER_GRID_FIELDS.map((f) => [f.key, f]));

export function getUserGridField(key) {
  return FIELD_BY_KEY.get(String(key || '')) || null;
}

export function parseUserGridFieldKeys(raw, { max = USER_GRID_MAX_COLUMNS } = {}) {
  const list = Array.isArray(raw)
    ? raw
    : String(raw || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const key of list) {
    if (!FIELD_BY_KEY.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
    if (out.length >= max) break;
  }
  return out;
}

export function defaultUserGridFieldKeys(persona) {
  const p = String(persona || 'employees');
  if (p === 'school_staff') return ['email', 'personal_phone', 'last_login', 'schools', 'is_demo'];
  if (p === 'guardians') return ['email', 'personal_phone', 'last_login', 'status', 'is_demo'];
  return ['credential', 'is_demo', 'date_of_birth', 'provider_start_date', 'comp_level'];
}
