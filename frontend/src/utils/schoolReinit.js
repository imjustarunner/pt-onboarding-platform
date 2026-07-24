import { toUploadsUrl } from './uploadsUrl.js';

export const SECTION_META = [
  {
    key: 'school_events',
    title: 'School Events',
    shortTitle: 'School Events',
    hint: 'First day of school and Back-to-School details',
    description: 'Confirm first day, Back-to-School, and related dates.',
    icon: 'confetti',
  },
  {
    key: 'assigned_providers',
    title: 'Providers',
    shortTitle: 'Providers',
    hint: 'Review clinicians, then share capacity plans',
    description: 'Review assigned clinicians with photos and schedules, then indicate if you expect more or fewer providers/days.',
    icon: 'providers',
  },
  {
    key: 'school_staff',
    title: 'Staff Members',
    shortTitle: 'Staff Members',
    hint: 'Review contacts who use the portal',
    description: 'Verify school staff with portal access.',
    icon: 'staff',
  },
  {
    key: 'materials',
    title: 'Materials Request',
    shortTitle: 'Materials Request',
    hint: 'Packets, trifolds, and delivery',
    description: 'Request paper packets, trifolds, and delivery.',
    icon: 'box',
  },
  {
    key: 'needs_assessment',
    title: 'Needs Assessment',
    shortTitle: 'Needs Assessment',
    hint: 'How many on-site days you need (5–7 clients per day)',
    description: 'Estimate on-site days using the 5–7 clients per full day guide, then share preferences.',
    icon: 'chart',
  },
  {
    key: 'fall_check_in',
    title: 'Fall School Check-In',
    shortTitle: 'Fall School Check-In',
    hint: 'Book a check-in or share a preferred time',
    description: 'Book your mandatory Fall School Check-In.',
    icon: 'clock',
  },
  {
    key: 'growth_feedback',
    title: 'Growth & Feedback',
    shortTitle: 'Growth & Feedback',
    hint: 'Quotes, contacts, and annual feedback',
    description: 'Share feedback, quotes, and growth contacts.',
    icon: 'heart',
  },
];

export const DAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

const SCHOOL_EVENT_CATEGORY_LABELS = {
  back_to_school: 'Back to School',
  fall_check_in: 'Fall School Check-in',
  spring: 'Spring School Check-in',
  first_day: 'First Day of School',
  open_house: 'Open House',
  resource_fair: 'Resource Fair',
  family_night: 'Family Night',
  orientation: 'Orientation',
  holiday: 'Holiday',
  day_off: 'Day Off',
  other: 'School Event',
};

export function schoolEventCategoryLabel(category) {
  return SCHOOL_EVENT_CATEGORY_LABELS[String(category || '').trim().toLowerCase()] || 'School Event';
}

/** Attendable school portal events (not calendar-only dates). */
export const CALENDAR_ONLY_SCHOOL_EVENT_CATEGORIES = new Set([
  'holiday',
  'day_off',
  'first_day',
  'fall_check_in',
  'spring',
]);

function resolveLogoUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  const raw = String(pathOrUrl).trim();
  if (!raw) return null;
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  if (raw.startsWith('/uploads/') || raw.includes('/uploads/')) return toUploadsUrl(raw);
  if (raw.startsWith('/')) return raw;
  return toUploadsUrl(raw);
}

/** Prefer full logo assets over icons; schools may fall back to icon when no logo is set. */
export function logoSrc(agencyLike, { allowIcon = false } = {}) {
  if (!agencyLike) return null;
  const path = agencyLike.logo_path || agencyLike.logoPath;
  if (path) return resolveLogoUrl(path);
  if (allowIcon) {
    const icon = agencyLike.icon_file_path || agencyLike.iconFilePath;
    if (icon) return resolveLogoUrl(icon);
  }
  const url = agencyLike.logo_url || agencyLike.logoUrl;
  return resolveLogoUrl(url);
}

export function parseAgencyPalette(agencyLike) {
  if (!agencyLike) return {};
  let raw = agencyLike.color_palette || agencyLike.colorPalette || null;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      raw = {};
    }
  }
  const p = raw && typeof raw === 'object' ? raw : {};
  return {
    primary: p.primary || p.primaryColor || p.brand || '#0c4a6e',
    secondary: p.secondary || p.secondaryColor || '#15803d',
    accent: p.accent || p.accentColor || p.secondary || '#2563eb',
  };
}

export function agencyDisplayName(agencyLike, fallback = 'Partner') {
  const name = String(agencyLike?.name || agencyLike?.agency_name || '').trim();
  return name || fallback;
}

/** Match backend schoolReinit currentSchoolYear (July rollover for fall year-update). */
export function currentSchoolYear(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  if (m >= 7) return `${y}-${String(y + 1).slice(-2)}`;
  return `${y - 1}-${String(y).slice(-2)}`;
}

/** 2026-27 → 2026–2027 */
export function formatSchoolYearLabel(raw) {
  const y = String(raw || '').trim();
  const m = y.match(/^(\d{4})-(\d{2})$/);
  if (m) return `${m[1]}–20${m[2]}`;
  const m2 = y.match(/^(\d{4})-(\d{4})$/);
  if (m2) return `${m2[1]}–${m2[2]}`;
  return y || 'upcoming';
}

export function sectionProgressMap(sections = []) {
  const map = {};
  for (const s of sections || []) {
    map[s.sectionKey] = s;
  }
  return map;
}

export function identityStorageKey(cycleId) {
  return `school_reinit_identity_${cycleId || 'x'}`;
}

export function loadStoredIdentity(cycleId) {
  try {
    const raw = sessionStorage.getItem(identityStorageKey(cycleId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeIdentity(cycleId, identity) {
  try {
    sessionStorage.setItem(identityStorageKey(cycleId), JSON.stringify(identity));
  } catch {
    /* ignore */
  }
}

export function publicReinitUrl(token) {
  if (!token) return '';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/school-reinit/${token}`;
}

export const PROVIDER_REMOVAL_REASONS = [
  {
    value: 'different_day',
    label: 'Requesting different day',
    description: 'Choose which days work for the whole school; non-matching provider days are requested for removal.',
  },
  { value: 'day_wont_work', label: 'Day will not work, will discuss at meeting' },
  { value: 'provider_not_fit', label: 'Provider not a good fit, will discuss at meeting' },
];

export function providerRemovalReasonLabel(value) {
  return PROVIDER_REMOVAL_REASONS.find((r) => r.value === value)?.label || value || '';
}

export async function copyTextToClipboard(text) {
  const value = String(text || '');
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch {
      return false;
    }
  }
}
