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

export function resolveCareersBrandKey({ slug = '', agencyName = '' } = {}) {
  const hay = `${slug || ''} ${agencyName || ''}`.trim().toLowerCase();
  if (hay.includes('itsco')) return 'itsco';
  if (/(^|[^a-z])nlu([^a-z]|$)/.test(hay) || hay.includes('new life') || hay.includes('newlife')) {
    return 'nlu';
  }
  return 'neutral';
}

/**
 * Default framed hero by agency:
 * - ITSCO → itsco-framed
 * - NLU → nlu-framed
 * - everyone else → neutral-framed
 */
export function resolveDefaultHeroPreset({ slug = '', agencyName = '' } = {}) {
  const brand = resolveCareersBrandKey({ slug, agencyName });
  if (brand === 'itsco') return HERO_BY_ID['itsco-framed'];
  if (brand === 'nlu') return HERO_BY_ID['nlu-framed'];
  return HERO_BY_ID['neutral-framed'];
}

/**
 * Full public-page defaults so ITSCO/NLU look like the designed careers layout
 * even before admins fill in careers page settings. Saved settings always win.
 */
export function resolveDefaultCareersPage({ slug = '', agencyName = '' } = {}) {
  const brand = resolveCareersBrandKey({ slug, agencyName });
  const hero = resolveDefaultHeroPreset({ slug, agencyName });
  const name = String(agencyName || '').trim() || (brand === 'itsco' ? 'ITSCO' : brand === 'nlu' ? 'NLU' : 'Our team');

  if (brand === 'itsco') {
    return {
      accentColor: '#1a8c54',
      brandWordmark: 'ITSCO',
      heroHeadline: 'Make a difference.',
      heroSubheadline: 'Build brighter futures.',
      lead: 'Join a supportive, purpose-driven team providing mental health services to children, adolescents, and families across Colorado.',
      heroImageUrl: hero.url,
      heroImageAlt: 'Colorado landscape — ITSCO careers',
      heroFrameStyle: 'preframed',
      showLeafAccent: false,
      navItems: [
        { label: 'Why ITSCO', href: '#why', style: 'link', icon: 'care' },
        { label: 'Our Impact', href: '#impact', style: 'link', icon: 'team' },
        { label: 'Join Our Team', href: '#jobs', style: 'button' }
      ],
      featureCards: [
        {
          icon: 'team',
          title: 'Community Focused',
          body: 'We partner with schools and families to create lasting impact.'
        },
        {
          icon: 'growth',
          title: 'Grow with Us',
          body: 'Clear pathways for learning, licensure, and advancement.'
        }
      ],
      bannerText: 'Join a team supporting 1,000+ students across Colorado.',
      bannerBullets: ['School-based and office-based roles', 'Flexible schedules', 'Meaningful work'],
      bannerLinkText: 'Learn more about ITSCO',
      bannerLinkHref: '#why'
    };
  }

  if (brand === 'nlu') {
    return {
      accentColor: '#1e3a5f',
      brandWordmark: 'NLU',
      heroHeadline: 'Grow with purpose.',
      heroSubheadline: 'Serve with heart.',
      lead: 'Join New Life Unlimited and help families build stronger, healthier futures through compassionate mental health care.',
      heroImageUrl: hero.url,
      heroImageAlt: 'Mountain landscape — NLU careers',
      heroFrameStyle: 'preframed',
      showLeafAccent: false,
      navItems: [
        { label: 'Why NLU', href: '#why', style: 'link', icon: 'care' },
        { label: 'Our Impact', href: '#impact', style: 'link', icon: 'team' },
        { label: 'Join Our Team', href: '#jobs', style: 'button' }
      ],
      featureCards: [
        {
          icon: 'care',
          title: 'People First',
          body: 'Supportive supervision and a culture built around care for clients and clinicians.'
        },
        {
          icon: 'growth',
          title: 'Room to Grow',
          body: 'Mentorship, licensure support, and clear next steps in your career.'
        }
      ],
      bannerText: 'Build a career that makes a measurable difference for families.',
      bannerBullets: ['Collaborative teams', 'Meaningful caseloads', 'Growth pathways'],
      bannerLinkText: 'Learn more about NLU',
      bannerLinkHref: '#why'
    };
  }

  return {
    accentColor: '#1a8c54',
    brandWordmark: name,
    heroHeadline: 'Build a career that matters.',
    heroSubheadline: 'Join our team.',
    lead: `Explore open roles at ${name} and apply in a few minutes.`,
    heroImageUrl: hero.url,
    heroImageAlt: `${name} careers`,
    heroFrameStyle: 'preframed',
    showLeafAccent: false,
    navItems: [
      { label: 'Why join us', href: '#why', style: 'link', icon: 'care' },
      { label: 'Open roles', href: '#jobs', style: 'button' }
    ],
    featureCards: [
      {
        icon: 'team',
        title: 'Mission-driven work',
        body: 'Join a team focused on meaningful outcomes for the people we serve.'
      },
      {
        icon: 'growth',
        title: 'Grow with us',
        body: 'Support, learning, and room to advance as you build your career.'
      }
    ],
    bannerText: `Explore open roles and find your next step with ${name}.`,
    bannerBullets: ['Flexible opportunities', 'Supportive teams', 'Meaningful work'],
    bannerLinkText: 'View open roles',
    bannerLinkHref: '#jobs'
  };
}

/**
 * Merge saved careers page JSON over brand defaults.
 * Empty / missing saved fields fall back to the designed defaults.
 */
export function mergeCareersPageWithDefaults(saved, { slug = '', agencyName = '' } = {}) {
  const defaults = resolveDefaultCareersPage({ slug, agencyName });
  const raw = saved && typeof saved === 'object' ? saved : {};

  const pickText = (key) => {
    const v = String(raw[key] ?? '').trim();
    return v || defaults[key] || '';
  };

  const savedNav = Array.isArray(raw.navItems) ? raw.navItems.filter((n) => String(n?.label || '').trim()) : [];
  const savedFeatures = Array.isArray(raw.featureCards)
    ? raw.featureCards.filter((c) => String(c?.title || '').trim() || String(c?.body || '').trim())
    : [];
  const savedBullets = Array.isArray(raw.bannerBullets)
    ? raw.bannerBullets.map((b) => String(b || '').trim()).filter(Boolean)
    : [];

  return {
    ...defaults,
    ...Object.fromEntries(
      Object.keys(defaults).map((key) => {
        if (key === 'navItems' || key === 'featureCards' || key === 'bannerBullets') return [key, defaults[key]];
        if (typeof defaults[key] === 'boolean') {
          return [key, raw[key] !== undefined ? raw[key] : defaults[key]];
        }
        const v = String(raw[key] ?? '').trim();
        return [key, v || defaults[key]];
      })
    ),
    accentColor: pickText('accentColor') || defaults.accentColor,
    heroHeadline: pickText('heroHeadline'),
    heroSubheadline: pickText('heroSubheadline'),
    lead: pickText('lead'),
    heroImageUrl: pickText('heroImageUrl') || defaults.heroImageUrl,
    heroImageAlt: pickText('heroImageAlt') || defaults.heroImageAlt,
    heroFrameStyle: pickText('heroFrameStyle') || defaults.heroFrameStyle,
    heroImagePosition: String(raw.heroImagePosition || '').trim() || 'center center',
    showLeafAccent: raw.showLeafAccent !== undefined ? raw.showLeafAccent !== false : defaults.showLeafAccent,
    eyebrow: String(raw.eyebrow || '').trim(),
    bannerText: pickText('bannerText'),
    bannerLinkText: pickText('bannerLinkText'),
    bannerLinkHref: pickText('bannerLinkHref'),
    bannerBullets: savedBullets.length ? savedBullets : defaults.bannerBullets,
    navItems: savedNav.length ? savedNav : defaults.navItems,
    featureCards: savedFeatures.length ? savedFeatures : defaults.featureCards,
    brandWordmark: defaults.brandWordmark
  };
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
