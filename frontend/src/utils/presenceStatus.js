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
  { id: 'out_day', label: 'Out for the Day', group: 'day' },
  { id: 'available_offline', label: 'Available · Logged out', group: 'offline_available' }
];

/** Shared availability bands — Team Board + Messages use the same colors. */
export const AVAILABILITY_BANDS = Object.freeze({
  available: { id: 'available', label: 'Available', short: 'Available' },
  away_reachable: { id: 'away_reachable', label: 'Away · reachable', short: 'Away' },
  unavailable: { id: 'unavailable', label: 'Unavailable', short: 'Unavailable' },
  available_offline: {
    id: 'available_offline',
    label: 'Available · logged out',
    short: 'Available (offline)'
  },
  offline: { id: 'offline', label: 'Inactive', short: 'Inactive' }
});

/** Team Board enum labels (roster for admin/support/super_admin). Not for Messages peers. */
export const TEAM_BOARD_STATUS_LABELS = {
  in_available: 'In – Available',
  in_heads_down: 'In – Heads Down',
  in_available_for_phone: 'In – Available for Phone',
  out_quick: 'Out – Quick',
  out_am: 'Out – AM',
  out_pm: 'Out – PM',
  out_full_day: 'Out – Full Day',
  traveling_offsite: 'Traveling / Offsite'
};

export function labelForAwayReason(reason) {
  const key = String(reason || '').trim();
  if (!key) return null;
  const hit = AWAY_REASONS.find((r) => r.id === key);
  return hit?.label || null;
}

/**
 * Privileged Team Board label — prefers meal/day display from Timedown status prompt.
 * Messages peers must keep using peerFacingStatusLabel / statusSubtitle (Active/Idle/Inactive).
 */
export function teamBoardStatusLabel(person, enumFallbackMap = TEAM_BOARD_STATUS_LABELS) {
  if (!person) return '';
  if (isTimedAwayExpired(person)) return '';
  const rich = String(person.presence_display_label || person.display_label || '').trim();
  if (rich && rich.toLowerCase() !== 'active') return rich;
  const fromReason = labelForAwayReason(person.presence_reason || person.reason);
  if (fromReason) return fromReason;
  const status = String(person.presence_status || person.status || '').trim();
  if (status && enumFallbackMap[status]) return enumFallbackMap[status];
  return rich || '';
}

/** Return-at for Team Board note column (session extend or expected return). */
export function teamBoardReturnAt(person) {
  if (!person) return null;
  const raw =
    person.presence_expected_return_at ||
    person.presence_session_extend_until ||
    person.expected_return_at ||
    person.session_extend_until ||
    null;
  if (!raw) return null;
  const ms = new Date(raw).getTime();
  // Hide stale "Back …" times from a previous day/session.
  if (!Number.isFinite(ms) || ms <= Date.now()) return null;
  return raw;
}

/** Timed Away overlay whose return/end time has already passed. */
export function isTimedAwayExpired(person, now = Date.now()) {
  if (!person) return false;
  // Use rich Team Board status only — never wire status (online/idle/offline).
  const rich = String(person.presence_status || '').trim();
  const isAway = rich.startsWith('out_') || rich === 'traveling_offsite';
  if (!isAway) return false;
  const candidates = [
    person.presence_expected_return_at,
    person.expected_return_at,
    person.presence_ends_at,
    person.ends_at,
    person.presence_session_extend_until,
    person.session_extend_until
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const ms = new Date(raw).getTime();
    if (Number.isFinite(ms)) return ms <= now;
  }
  return false;
}

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

/** Derive shared availability band from API person payload. */
export function availabilityBandForPerson(person) {
  if (!person) return 'offline';
  const expiredAway = isTimedAwayExpired(person);
  const band = String(person.availability_band || '').toLowerCase();
  // Trust API band unless a timed Away timer has already expired client-side.
  if (band && AVAILABILITY_BANDS[band] && !expiredAway) return band;

  const reason = expiredAway ? '' : String(person.presence_reason || person.reason || '').trim();
  if (reason === 'available_offline') return 'available_offline';

  const note = expiredAway ? '' : String(person.presence_note || person.note || '').trim();
  const display = expiredAway
    ? ''
    : String(person.presence_display_label || person.display_label || person.status_label || '').toLowerCase();
  const rich = expiredAway ? 'in_available' : String(person.presence_status || '').trim();
  const reachable =
    ['call', 'text', 'call_text'].includes(note) ||
    ['call', 'text', 'call_text'].includes(reason) ||
    display.includes('available for call') ||
    display.includes('available for text');

  const wire = String(person.status || '').toLowerCase();
  if (wire === 'online' || wire === 'active') {
    if (rich === 'in_heads_down') return 'unavailable';
    if (rich.startsWith('out_') || rich === 'traveling_offsite') {
      return reachable || rich === 'in_available_for_phone' ? 'away_reachable' : 'unavailable';
    }
    if (
      person.calendar_busy ||
      display.includes('in session') ||
      display.includes('supervision') ||
      display.includes('in meeting')
    ) {
      return 'unavailable';
    }
    return 'available';
  }
  if (wire === 'idle' || wire === 'away') {
    if (reachable || rich === 'in_available_for_phone') return 'away_reachable';
    // Explicit Away / heads-down without reachable → red unavailable
    if (rich.startsWith('out_') || rich === 'traveling_offsite' || rich === 'in_heads_down') {
      return 'unavailable';
    }
    // Timedown / soft idle before a status is chosen → Away (yellow)
    return 'away_reachable';
  }
  if (rich.startsWith('out_') || rich === 'traveling_offsite' || rich === 'in_heads_down') {
    return reachable ? 'away_reachable' : 'unavailable';
  }
  return 'offline';
}

export function availabilityBandLabel(band) {
  return AVAILABILITY_BANDS[band]?.label || AVAILABILITY_BANDS.offline.label;
}

/** Wire status → peer-facing label (legacy Active / Idle / Inactive). Prefer band labels. */
export function peerFacingStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'online' || s === 'active') return 'Available';
  if (s === 'idle' || s === 'away') return 'Away';
  return 'Inactive';
}

export function presenceDotClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'online' || s === 'active' || s === 'available') return 'dot-available';
  if (s === 'idle' || s === 'away' || s === 'away_reachable') return 'dot-away-reachable';
  if (s === 'unavailable' || s === 'busy') return 'dot-unavailable';
  if (s === 'available_offline') return 'dot-available-offline';
  return 'dot-offline';
}

/** Prefer shared availability band colors (Team Board + Messages). */
export function presenceDotClassForPerson(person) {
  if (!person) return 'dot-offline';
  const band = availabilityBandForPerson(person);
  if (band === 'available') return 'dot-available';
  if (band === 'away_reachable') return 'dot-away-reachable';
  if (band === 'unavailable') return 'dot-unavailable';
  if (band === 'available_offline') return 'dot-available-offline';
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

/**
 * Peer list subtitle — shared availability bands (matches Team Board colors).
 * Privileged viewers may also see rich Away labels (Out for Meal, etc.).
 */
export function statusSubtitle(person) {
  if (!person) return '';
  const band = availabilityBandForPerson(person);
  let label = String(person.status_label || '').trim() || availabilityBandLabel(band);
  // Privileged directory payloads include rich Away labels — prefer them for detail.
  if (person.presence_display_label || person.presence_reason) {
    const rich = teamBoardStatusLabel(person);
    if (rich) label = rich;
  }
  if (person.status === 'online' && person.calendar_busy) {
    const apiLabel = String(person.status_label || '').trim();
    if (apiLabel) label = apiLabel;
  }
  const school = String(person.role || '').toLowerCase() === 'school_staff' ? personOrgLabel(person) : '';
  return school ? `${label} · ${school}` : label;
}

/** Hover / detail lines for Team Board + Messages. */
export function presenceDetailLines(person) {
  if (!person) return [];
  const band = availabilityBandForPerson(person);
  const lines = [availabilityBandLabel(band)];
  const rich = teamBoardStatusLabel(person);
  if (rich && rich !== lines[0]) lines.push(rich);
  const back = teamBoardReturnAt(person);
  if (back) {
    try {
      lines.push(
        `Back ${new Date(back).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      );
    } catch {
      /* ignore */
    }
  }
  return lines;
}

/** Sort: available → away reachable → unavailable → available offline → offline */
export function presenceSortRank(statusOrBand) {
  const s = String(statusOrBand || '').toLowerCase();
  if (s === 'online' || s === 'available') return 0;
  if (s === 'idle' || s === 'away' || s === 'away_reachable') return 1;
  if (s === 'unavailable' || s === 'busy') return 2;
  if (s === 'available_offline') return 3;
  return 4;
}

export function presenceSortRankForPerson(person) {
  return presenceSortRank(availabilityBandForPerson(person));
}
