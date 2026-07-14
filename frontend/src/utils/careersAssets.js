/**
 * Built-in careers page assets (hero frames + icon library).
 * Served from frontend/public/assets/careers/
 */

const BASE = '/assets/careers';

export const CAREERS_HERO_PRESETS = [
  {
    id: 'itsco-framed',
    label: 'ITSCO framed',
    url: `${BASE}/heroes/itsco-framed.png`,
    frameStyle: 'preframed',
    description: 'Organic Colorado frame with leaf accent (ITSCO)'
  },
  {
    id: 'nlu-framed',
    label: 'NLU framed',
    url: `${BASE}/heroes/nlu-framed.png`,
    frameStyle: 'preframed',
    description: 'Layered organic frame with growth arrow (NLU)'
  },
  {
    id: 'neutral-framed',
    label: 'Neutral framed',
    url: `${BASE}/heroes/neutral-framed.png`,
    frameStyle: 'preframed',
    description: 'Agency-neutral framed hero for future agencies'
  },
  {
    id: 'colorado-photo',
    label: 'Colorado photo',
    url: `${BASE}/heroes/colorado-photo.png`,
    frameStyle: 'organic',
    description: 'Full landscape photo — clipped to an organic shape on the page'
  }
];

const HERO_BY_ID = Object.fromEntries(CAREERS_HERO_PRESETS.map((h) => [h.id, h]));

/**
 * Default framed hero by agency:
 * - ITSCO → itsco-framed
 * - NLU → nlu-framed
 * - everyone else → neutral-framed (for future agencies)
 */
export function resolveDefaultHeroPreset({ slug = '', agencyName = '' } = {}) {
  const hay = `${slug || ''} ${agencyName || ''}`.trim().toLowerCase();
  if (hay.includes('itsco')) return HERO_BY_ID['itsco-framed'];
  if (/(^|[^a-z])nlu([^a-z]|$)/.test(hay) || hay.includes('new life') || hay.includes('newlife')) {
    return HERO_BY_ID['nlu-framed'];
  }
  return HERO_BY_ID['neutral-framed'];
}

/** Page 2 — colorful circular icons for job cards (primary picker). */
export const CAREERS_JOB_ICONS = [
  { id: 'clinical', label: 'Clinical / Provider', url: `${BASE}/icons/page2/clinical.png`, themes: ['provider', 'clinician', 'therapist', 'counselor'] },
  { id: 'application', label: 'Application / Facilitator', url: `${BASE}/icons/page2/application.png`, themes: ['facilitator', 'coordinator'] },
  { id: 'badge', label: 'Badge / Intern', url: `${BASE}/icons/page2/badge.png`, themes: ['intern', 'trainee', 'student'] },
  { id: 'community', label: 'Community / Care', url: `${BASE}/icons/page2/community.png`, themes: ['community', 'family', 'care'] },
  { id: 'workspace', label: 'Workspace / Office', url: `${BASE}/icons/page2/workspace.png`, themes: ['admin', 'office', 'operations'] },
  { id: 'schedule', label: 'Schedule', url: `${BASE}/icons/page2/schedule.png`, themes: ['schedule', 'part-time'] },
  { id: 'flexible-hours', label: 'Flexible hours', url: `${BASE}/icons/page2/flexible-hours.png`, themes: ['flexible', 'remote'] },
  { id: 'alert', label: 'Alert / Featured', url: `${BASE}/icons/page2/alert.png`, themes: ['featured', 'urgent'] }
];

/** Page 1 — feature / nav / UI accent icons. */
export const CAREERS_FEATURE_ICONS = [
  { id: 'team', label: 'Team', url: `${BASE}/icons/page1/team.png` },
  { id: 'care', label: 'Care', url: `${BASE}/icons/page1/care.png` },
  { id: 'growth', label: 'Growth', url: `${BASE}/icons/page1/growth.png` },
  { id: 'learning', label: 'Learning', url: `${BASE}/icons/page1/learning.png` },
  { id: 'list', label: 'List', url: `${BASE}/icons/page1/list.png` },
  { id: 'location', label: 'Location', url: `${BASE}/icons/page1/location.png` },
  { id: 'bell', label: 'Bell', url: `${BASE}/icons/page1/bell.png` },
  { id: 'search', label: 'Search', url: `${BASE}/icons/page1/search.png` },
  { id: 'clock', label: 'Clock', url: `${BASE}/icons/page1/clock.png` },
  { id: 'bookmark', label: 'Bookmark', url: `${BASE}/icons/page1/bookmark.png` }
];

const FEATURE_ICON_BY_ID = Object.fromEntries(CAREERS_FEATURE_ICONS.map((i) => [i.id, i]));
const JOB_ICON_BY_ID = Object.fromEntries(CAREERS_JOB_ICONS.map((i) => [i.id, i]));
const JOB_ICON_BY_URL = Object.fromEntries(CAREERS_JOB_ICONS.map((i) => [i.url, i]));
const HERO_BY_URL = Object.fromEntries(CAREERS_HERO_PRESETS.map((h) => [h.url, h]));

export function getFeatureIconUrl(iconKey) {
  const key = String(iconKey || '').trim().toLowerCase();
  if (!key || key === 'none') return '';
  return FEATURE_ICON_BY_ID[key]?.url || '';
}

export function getJobIconByUrl(url) {
  const u = String(url || '').trim();
  return JOB_ICON_BY_URL[u] || null;
}

export function getHeroPresetByUrl(url) {
  const u = String(url || '').trim();
  return HERO_BY_URL[u] || null;
}

/** Pick a default page-2 icon from role type / education label when no custom icon is set. */
export function resolveDefaultJobIconUrl(roleType, educationLevel) {
  const hay = `${roleType || ''} ${educationLevel || ''}`.toLowerCase();
  for (const icon of CAREERS_JOB_ICONS) {
    if (icon.themes.some((t) => hay.includes(t))) return icon.url;
  }
  return JOB_ICON_BY_ID.community?.url || CAREERS_JOB_ICONS[0]?.url || '';
}

export function isCareersStaticAssetUrl(url) {
  return String(url || '').startsWith('/assets/careers/');
}
