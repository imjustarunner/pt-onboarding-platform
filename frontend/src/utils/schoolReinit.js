export const SECTION_META = [
  {
    key: 'school_information',
    title: 'School Information',
    shortTitle: 'School Information',
    hint: 'Confirm basic school details for the upcoming year',
    description: 'Confirm school name and contact details for the year.',
    icon: 'calendar',
  },
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
    hint: 'Confirm last year’s clinicians and days',
    description: 'Review assigned clinicians and weekly day schedules.',
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
    hint: 'On-site days and provider preferences',
    description: 'Estimate on-site days and share provider preferences.',
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

export function logoSrc(agencyLike) {
  if (!agencyLike) return null;
  const raw = agencyLike.logo_url || agencyLike.logo_path || agencyLike.logoUrl || agencyLike.logoPath;
  if (!raw) return null;
  if (String(raw).startsWith('http') || String(raw).startsWith('/')) return raw;
  return `/uploads/${raw}`;
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
