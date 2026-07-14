/**
 * Built-in careers page assets (hero frames + icon library).
 * Served from frontend/public/assets/careers/
 */

import { ITSCO_CAREERS_DEFAULTS, NLU_CAREERS_DEFAULTS } from './careersBrandDefaults.js';

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

export function resolveDefaultHeroPreset({ slug = '', agencyName = '' } = {}) {
  const brand = resolveCareersBrandKey({ slug, agencyName });
  if (brand === 'itsco') return HERO_BY_ID['itsco-framed'];
  if (brand === 'nlu') return HERO_BY_ID['nlu-framed'];
  return HERO_BY_ID['neutral-framed'];
}

const clone = (v) => JSON.parse(JSON.stringify(v));

export function blankWhyModal() {
  return {
    enabled: true,
    title: '',
    subtitle: '',
    icon: 'care',
    cards: [
      { icon: 'team', title: '', body: '' },
      { icon: 'growth', title: '', body: '' },
      { icon: 'learning', title: '', body: '' },
      { icon: 'care', title: '', body: '' }
    ],
    ctaText: 'View open roles',
    ctaAction: 'jobs',
    ctaHref: '#jobs'
  };
}

export function blankImpactModal() {
  return {
    enabled: true,
    title: '',
    subtitle: '',
    icon: 'community',
    stats: [
      { icon: 'team', value: '', label: '', body: '' },
      { icon: 'learning', value: '', label: '', body: '' },
      { icon: 'care', value: '', label: '', body: '' },
      { icon: 'badge', value: '', label: '', body: '' }
    ],
    growthTitle: '',
    growthLabel: '',
    growthPoints: [
      { label: '2021', value: 0 },
      { label: '2022', value: 0 },
      { label: '2023', value: 0 },
      { label: '2024', value: 0 }
    ],
    sidebarTitle: '',
    sidebarBody: '',
    sidebarButtonText: '',
    sidebarButtonHref: '',
    sidebarButtonAction: 'why'
  };
}

export function normalizeWhyModal(raw) {
  const blank = blankWhyModal();
  const src = raw && typeof raw === 'object' ? raw : {};
  const cards = Array.isArray(src.cards) ? src.cards : [];
  return {
    enabled: src.enabled !== false,
    title: String(src.title || '').trim(),
    subtitle: String(src.subtitle || '').trim(),
    icon: String(src.icon || blank.icon).trim() || blank.icon,
    cards: [0, 1, 2, 3].map((i) => ({
      icon: String(cards[i]?.icon || blank.cards[i].icon).trim(),
      title: String(cards[i]?.title || '').trim(),
      body: String(cards[i]?.body || '').trim()
    })),
    ctaText: String(src.ctaText || '').trim(),
    ctaAction: String(src.ctaAction || 'jobs').trim() || 'jobs',
    ctaHref: String(src.ctaHref || '#jobs').trim()
  };
}

export function normalizeImpactModal(raw) {
  const blank = blankImpactModal();
  const src = raw && typeof raw === 'object' ? raw : {};
  const stats = Array.isArray(src.stats) ? src.stats : [];
  const points = Array.isArray(src.growthPoints) ? src.growthPoints : [];
  return {
    enabled: src.enabled !== false,
    title: String(src.title || '').trim(),
    subtitle: String(src.subtitle || '').trim(),
    icon: String(src.icon || blank.icon).trim() || blank.icon,
    stats: [0, 1, 2, 3].map((i) => ({
      icon: String(stats[i]?.icon || blank.stats[i].icon).trim(),
      value: String(stats[i]?.value || '').trim(),
      label: String(stats[i]?.label || '').trim(),
      body: String(stats[i]?.body || '').trim()
    })),
    growthTitle: String(src.growthTitle || '').trim(),
    growthLabel: String(src.growthLabel || '').trim(),
    growthPoints: [0, 1, 2, 3].map((i) => ({
      label: String(points[i]?.label || blank.growthPoints[i].label).trim(),
      value: Number(points[i]?.value || 0) || 0
    })),
    sidebarTitle: String(src.sidebarTitle || '').trim(),
    sidebarBody: String(src.sidebarBody || '').trim(),
    sidebarButtonText: String(src.sidebarButtonText || '').trim(),
    sidebarButtonHref: String(src.sidebarButtonHref || '').trim(),
    sidebarButtonAction: String(src.sidebarButtonAction || 'why').trim() || 'why'
  };
}

/**
 * Full public-page defaults. Prefer DB-seeded careers_page_json (Admin → Careers).
 * These are fallbacks / starter content for the admin form.
 */
export function resolveDefaultCareersPage({ slug = '', agencyName = '' } = {}) {
  const brand = resolveCareersBrandKey({ slug, agencyName });
  if (brand === 'itsco') return clone(ITSCO_CAREERS_DEFAULTS);
  if (brand === 'nlu') return clone(NLU_CAREERS_DEFAULTS);

  const hero = resolveDefaultHeroPreset({ slug, agencyName });
  const name = String(agencyName || '').trim() || 'Our team';
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
      { label: 'Why join us', href: '', style: 'link', action: 'why', icon: 'care' },
      { label: 'Our Impact', href: '', style: 'link', action: 'impact', icon: 'team' },
      { label: 'Open roles', href: '#jobs', style: 'button', action: 'jobs' }
    ],
    featureCards: [
      { icon: 'team', title: 'Mission-driven work', body: 'Join a team focused on meaningful outcomes for the people we serve.' },
      { icon: 'growth', title: 'Grow with us', body: 'Support, learning, and room to advance as you build your career.' }
    ],
    bannerText: `Explore open roles and find your next step with ${name}.`,
    bannerBullets: ['Flexible opportunities', 'Supportive teams', 'Meaningful work'],
    bannerLinkText: 'View open roles',
    bannerLinkHref: '#jobs',
    bannerLinkAction: 'jobs',
    whyModal: {
      ...blankWhyModal(),
      title: `Why ${name}`,
      subtitle: 'Learn what makes this a meaningful place to build your career.',
      cards: [
        { icon: 'team', title: 'Mission-driven work', body: 'Meaningful outcomes for the people we serve.' },
        { icon: 'growth', title: 'Room to grow', body: 'Support and pathways as you advance.' },
        { icon: 'learning', title: 'Learning culture', body: 'Training and collaboration built into the work.' },
        { icon: 'care', title: 'Supportive teams', body: 'People who care about clients and each other.' }
      ]
    },
    impactModal: {
      ...blankImpactModal(),
      title: 'Our Impact',
      subtitle: 'A snapshot of the communities and people we serve.',
      sidebarTitle: 'Growing together',
      sidebarBody: `We are growing carefully so ${name} can keep delivering quality care.`
    }
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
    accentColor: pickText('accentColor') || defaults.accentColor,
    fontFamily: String(raw.fontFamily || '').trim().toLowerCase(),
    headingFontFamily: String(raw.headingFontFamily || '').trim().toLowerCase(),
    textStyles: normalizeTextStyles(raw.textStyles),
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
    bannerLinkHref: String(raw.bannerLinkHref || '').trim() || defaults.bannerLinkHref || '',
    bannerLinkAction: String(raw.bannerLinkAction || defaults.bannerLinkAction || '').trim(),
    bannerBullets: savedBullets.length ? savedBullets : defaults.bannerBullets,
    navItems: savedNav.length ? savedNav : defaults.navItems,
    featureCards: savedFeatures.length ? savedFeatures : defaults.featureCards,
    whyModal: raw.whyModal ? normalizeWhyModal(raw.whyModal) : normalizeWhyModal(defaults.whyModal),
    impactModal: raw.impactModal ? normalizeImpactModal(raw.impactModal) : normalizeImpactModal(defaults.impactModal),
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
  if (key === 'community' || key === 'badge') {
    const job = CAREERS_JOB_ICONS.find((i) => i.id === key);
    if (job) return job.url;
  }
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

/** Curated fonts for public careers page editing (Google Fonts where noted). */
export const CAREERS_FONT_OPTIONS = [
  { id: '', label: 'Default', css: '', google: '' },
  { id: 'dm-sans', label: 'DM Sans', css: '"DM Sans", system-ui, sans-serif', google: 'DM+Sans:wght@400;600;700;800' },
  { id: 'manrope', label: 'Manrope', css: 'Manrope, system-ui, sans-serif', google: 'Manrope:wght@400;600;700;800' },
  { id: 'space-grotesk', label: 'Space Grotesk', css: '"Space Grotesk", system-ui, sans-serif', google: 'Space+Grotesk:wght@400;600;700' },
  { id: 'outfit', label: 'Outfit', css: 'Outfit, system-ui, sans-serif', google: 'Outfit:wght@400;600;700;800' },
  { id: 'fraunces', label: 'Fraunces', css: 'Fraunces, Georgia, serif', google: 'Fraunces:opsz,wght@9..144,500;700;800' },
  { id: 'source-serif', label: 'Source Serif 4', css: '"Source Serif 4", Georgia, serif', google: 'Source+Serif+4:opsz,wght@8..60,400;600;700' },
  { id: 'libre-baskerville', label: 'Libre Baskerville', css: '"Libre Baskerville", Georgia, serif', google: 'Libre+Baskerville:ital,wght@0,400;0,700;1,400' },
  { id: 'newsreader', label: 'Newsreader', css: 'Newsreader, Georgia, serif', google: 'Newsreader:opsz,ital,wght@6..72,0,400;0,600;0,700;1,400' }
];

export const CAREERS_SIZE_PRESETS = [
  { id: '', label: 'Default', css: '' },
  { id: 'xs', label: 'XS', css: '0.75rem' },
  { id: 'sm', label: 'Small', css: '0.9rem' },
  { id: 'md', label: 'Medium', css: '1.05rem' },
  { id: 'lg', label: 'Large', css: '1.2rem' },
  { id: 'xl', label: 'XL', css: '1.35rem' },
  { id: '2xl', label: '2XL', css: '1.75rem' },
  { id: '3xl', label: '3XL', css: '2.25rem' },
  { id: 'hero', label: 'Hero', css: 'clamp(2rem, 4.4vw, 3.15rem)' },
  { id: 'hero-lg', label: 'Hero XL', css: 'clamp(2.4rem, 5vw, 3.75rem)' }
];

export const CAREERS_TEXT_STYLE_KEYS = [
  { id: 'eyebrow', label: 'Eyebrow' },
  { id: 'heroHeadline', label: 'Headline' },
  { id: 'heroSubheadline', label: 'Subheadline' },
  { id: 'lead', label: 'Lead' },
  { id: 'bannerText', label: 'Banner' },
  { id: 'featureTitle', label: 'Feature titles' },
  { id: 'featureBody', label: 'Feature body' }
];

const FONT_BY_ID = Object.fromEntries(CAREERS_FONT_OPTIONS.map((f) => [f.id, f]));

export function blankTextStyle() {
  return { bold: false, italic: false, fontSize: '', color: '', fontFamily: '' };
}

export function normalizeTextStyle(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  return {
    bold: src.bold === true,
    italic: src.italic === true,
    fontSize: String(src.fontSize || '').trim(),
    color: String(src.color || '').trim(),
    fontFamily: String(src.fontFamily || '').trim().toLowerCase()
  };
}

export function normalizeTextStyles(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const { id } of CAREERS_TEXT_STYLE_KEYS) {
    if (src[id]) out[id] = normalizeTextStyle(src[id]);
  }
  return out;
}

export function resolveCareersFontCss(fontId) {
  const id = String(fontId || '').trim().toLowerCase();
  return FONT_BY_ID[id]?.css || '';
}

export function resolveCareersFontGoogle(fontId) {
  const id = String(fontId || '').trim().toLowerCase();
  return FONT_BY_ID[id]?.google || '';
}

export function textStyleToCss(style, { pageFont = '', headingFont = '', asHeading = false } = {}) {
  const s = normalizeTextStyle(style);
  const css = {};
  if (s.bold) css.fontWeight = '800';
  if (s.italic) css.fontStyle = 'italic';
  if (s.fontSize) css.fontSize = s.fontSize;
  if (s.color) css.color = s.color;
  const family =
    resolveCareersFontCss(s.fontFamily) ||
    (asHeading ? resolveCareersFontCss(headingFont) : '') ||
    resolveCareersFontCss(pageFont);
  if (family) css.fontFamily = family;
  return css;
}

export function ensureCareersGoogleFonts(fontIds = []) {
  if (typeof document === 'undefined') return;
  const families = [...new Set(
    (fontIds || []).map(resolveCareersFontGoogle).filter(Boolean)
  )];
  if (!families.length) return;
  const href = `https://fonts.googleapis.com/css2?${families.map((f) => `family=${f}`).join('&')}&display=swap`;
  const existing = document.getElementById('careers-google-fonts');
  if (existing) {
    if (existing.getAttribute('href') !== href) existing.setAttribute('href', href);
    return;
  }
  const link = document.createElement('link');
  link.id = 'careers-google-fonts';
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
}

/**
 * Shape a merged/public careers page into the JSON payload accepted by PUT /hiring/careers-page.
 */
export function compactCareersPageForSave(page) {
  const p = page && typeof page === 'object' ? page : {};
  const why = normalizeWhyModal(p.whyModal);
  const impact = normalizeImpactModal(p.impactModal);
  const navItems = (Array.isArray(p.navItems) ? p.navItems : [])
    .map((n) => ({
      label: String(n?.label || '').trim(),
      href: String(n?.href || '').trim(),
      style: String(n?.style || 'link').trim() === 'button' ? 'button' : 'link',
      action: String(n?.action || '').trim(),
      icon: String(n?.icon || 'none').trim() || 'none'
    }))
    .filter((n) => n.label)
    .slice(0, 6);
  const featureCards = (Array.isArray(p.featureCards) ? p.featureCards : [])
    .map((c) => ({
      icon: String(c?.icon || '').trim(),
      title: String(c?.title || '').trim(),
      body: String(c?.body || '').trim()
    }))
    .filter((c) => c.title || c.body)
    .slice(0, 4);
  const textStyles = normalizeTextStyles(p.textStyles);
  const compactStyles = {};
  for (const [key, style] of Object.entries(textStyles)) {
    if (style.bold || style.italic || style.fontSize || style.color || style.fontFamily) {
      compactStyles[key] = style;
    }
  }

  return {
    accentColor: String(p.accentColor || '').trim(),
    fontFamily: String(p.fontFamily || '').trim().toLowerCase(),
    headingFontFamily: String(p.headingFontFamily || '').trim().toLowerCase(),
    textStyles: compactStyles,
    heroHeadline: String(p.heroHeadline || '').trim(),
    heroSubheadline: String(p.heroSubheadline || '').trim(),
    eyebrow: String(p.eyebrow || '').trim(),
    lead: String(p.lead || '').trim(),
    heroImageUrl: String(p.heroImageUrl || '').trim(),
    heroImageAlt: String(p.heroImageAlt || '').trim(),
    heroImagePosition: String(p.heroImagePosition || '').trim(),
    heroFrameStyle: String(p.heroFrameStyle || '').trim(),
    showLeafAccent: p.showLeafAccent !== false,
    bannerText: String(p.bannerText || '').trim(),
    bannerBullets: (Array.isArray(p.bannerBullets) ? p.bannerBullets : [])
      .map((b) => String(b || '').trim())
      .filter(Boolean)
      .slice(0, 6),
    bannerLinkText: String(p.bannerLinkText || '').trim(),
    bannerLinkHref: String(p.bannerLinkHref || '').trim(),
    bannerLinkAction: String(p.bannerLinkAction || '').trim(),
    navItems,
    featureCards,
    whyModal: {
      ...why,
      cards: why.cards.filter((c) => c.title || c.body)
    },
    impactModal: {
      ...impact,
      stats: impact.stats.filter((s) => s.value || s.label || s.body)
    }
  };
}
