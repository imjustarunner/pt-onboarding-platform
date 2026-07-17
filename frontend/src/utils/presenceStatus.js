/** Shared presence / rich status helpers for chat + Timedown. */

/** Roles that get status timeout prompts + logout/timeout split control. */
export const PRIVILEGED_PRESENCE_ROLES = [
  'admin',
  'super_admin',
  'support',
  'clinical_practice_assistant'
];

/** Can toggle DM directory beyond default team employees. */
export const DIRECTORY_TOGGLE_ROLES = [
  'admin',
  'super_admin',
  'support',
  'clinical_practice_assistant'
];

export const DIRECTORY_ROLE_OPTIONS = [
  { id: 'school_staff', label: 'School staff' },
  { id: 'provider', label: 'Providers' },
  { id: 'provider_plus', label: 'Provider+' },
  { id: 'client_guardian', label: 'Guardians' }
];

export function isPrivilegedPresenceRole(role) {
  return PRIVILEGED_PRESENCE_ROLES.includes(String(role || '').toLowerCase());
}

export function canToggleDirectoryAudience(role) {
  return DIRECTORY_TOGGLE_ROLES.includes(String(role || '').toLowerCase());
}

export function isSchoolStaffRole(role) {
  return String(role || '').toLowerCase() === 'school_staff';
}

export function personOrgLabel(person) {
  if (!person) return '';
  if (String(person.role || '').toLowerCase() === 'school_staff') {
    return person.school_names || person.org_label || person.agency_names || 'School staff';
  }
  return person.school_names || person.org_label || person.agency_names || '';
}

export const AWAY_REASONS = [
  { id: 'meal', label: 'Out for Meal', group: 'out' },
  { id: 'fitness', label: 'Out for Fitness', group: 'out' },
  { id: 'family', label: 'Out for Family', group: 'out' },
  { id: 'personal', label: 'Out for Personal', group: 'out' },
  { id: 'call', label: 'Available for Call', group: 'reachable' },
  { id: 'text', label: 'Available for Text', group: 'reachable' },
  { id: 'call_text', label: 'Available for Call & Text', group: 'reachable' },
  { id: 'out_day', label: 'Out for the Day', group: 'day' }
];

const CUSTOM_OUT_KEY = (userId) => `presence:customOutReasons:v1:${userId || 'anon'}`;

/** Personal “Out for …” reasons saved locally per user. */
export function loadCustomOutReasons(userId) {
  try {
    const raw = localStorage.getItem(CUSTOM_OUT_KEY(userId));
    const arr = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x) => x && typeof x.label === 'string' && String(x.label).trim())
      .map((x) => ({
        id: String(x.id || `custom_${String(x.label).trim()}`),
        label: String(x.label).trim().slice(0, 40)
      }))
      .slice(0, 24);
  } catch {
    return [];
  }
}

export function addCustomOutReason(userId, label) {
  const trimmed = String(label || '').trim().slice(0, 40);
  if (!trimmed) return null;
  const list = loadCustomOutReasons(userId);
  const existing = list.find((x) => x.label.toLowerCase() === trimmed.toLowerCase());
  if (existing) return existing;
  const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const next = [...list, { id, label: trimmed }].slice(-24);
  try {
    localStorage.setItem(CUSTOM_OUT_KEY(userId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return { id, label: trimmed };
}

export function removeCustomOutReason(userId, id) {
  const next = loadCustomOutReasons(userId).filter((x) => x.id !== id);
  try {
    localStorage.setItem(CUSTOM_OUT_KEY(userId), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export const DURATION_CHIPS = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 90, label: '90 min' },
  { minutes: 120, label: '2 hours' }
];

export function presenceDotClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'online') return 'dot-online';
  if (s === 'idle') return 'dot-idle';
  return 'dot-offline';
}

export function formatReturnAt(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function statusSubtitle(person) {
  if (!person) return '';
  const label =
    person.presence_display_label ||
    person.status_label ||
    (person.status === 'online' ? 'Active' : person.status === 'idle' ? 'Away' : 'Offline');
  const back = formatReturnAt(person.presence_expected_return_at || person.presence_session_extend_until);
  const school = String(person.role || '').toLowerCase() === 'school_staff' ? personOrgLabel(person) : '';
  const parts = [label];
  if (back && person.status === 'idle') parts[0] = `${label} · back ${back}`;
  if (school) parts.push(school);
  return parts.join(' · ');
}

/** Sort: online → idle → offline, then name */
export function presenceSortRank(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'online') return 0;
  if (s === 'idle') return 1;
  return 2;
}
