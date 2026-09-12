/**
 * Inner Strength Institute marketing landing defaults + icon presets.
 * Admin edits live in branding_json; the public view merges overrides onto these defaults.
 */

export const TISI_LANDING_ICON_OPTIONS = [
  { value: 'person', label: 'Person' },
  { value: 'grad', label: 'Graduation cap' },
  { value: 'run', label: 'Athlete / run' },
  { value: 'chat', label: 'Chat / therapy' },
  { value: 'pair', label: 'Two people' },
  { value: 'dumbbell', label: 'Dumbbell' },
  { value: 'mind', label: 'Mind / head' },
  { value: 'plant', label: 'Plant / growth' },
  { value: 'peak', label: 'Mountain peak' },
  { value: 'shield', label: 'Shield' },
  { value: 'chart', label: 'Chart' },
  { value: 'brain', label: 'Brain' },
  { value: 'heart', label: 'Heart' }
];

const ICON_SVG = {
  person: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="8" r="3.25"/><path d="M5.5 19.5c1.6-3.2 4-4.8 6.5-4.8s4.9 1.6 6.5 4.8"/></svg>`,
  grad: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m2 8 10-5 10 5-10 5zM6 10v7c4 3 8 3 12 0v-7M22 8v10"/></svg>`,
  run: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="14" cy="5" r="2"/><path d="M8 21l2.5-5 3 2 3-7"/><path d="M5 12l4 1 3-3 3 1"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M5 17.5V7.5A2.5 2.5 0 0 1 7.5 5h9A2.5 2.5 0 0 1 19 7.5v6A2.5 2.5 0 0 1 16.5 16H9l-4 3.5z"/></svg>`,
  pair: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="9" cy="8" r="2.5"/><circle cx="16" cy="9" r="2"/><path d="M4.5 18c.9-2.4 2.5-3.6 4.5-3.6s3.6 1.2 4.5 3.6"/><path d="M13 18c.6-1.6 1.7-2.4 3-2.4 1.4 0 2.5.9 3.1 2.4"/></svg>`,
  dumbbell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M6 9v6M18 9v6M8 7v10M16 7v10M8 12h8"/></svg>`,
  mind: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 4a6 6 0 0 1 5.5 8.4c.9.6 1.5 1.6 1.5 2.7A3.9 3.9 0 0 1 15 19h-2v-3.2l2.2-2.2A6 6 0 0 0 12 4z"/><path d="M9 19H8a3 3 0 0 1-1.2-5.7"/></svg>`,
  plant: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 21v-8"/><path d="M12 13c-4 0-6-3-6-6 4 0 6 3 6 6z"/><path d="M12 13c4 0 6-3 6-6-4 0-6 3-6 6z"/><path d="M8 21h8"/></svg>`,
  peak: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 19h18L14 6l-3 5-2-2-6 10z"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 3l8 3v5c0 5-3.4 8.4-8 10-4.6-1.6-8-5-8-10V6l8-3z"/><path d="M9 12l2 2 4-4"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M5 19V10M12 19V5M19 19v-7"/></svg>`,
  brain: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M9 6a3.5 3.5 0 0 1 6 0 3 3 0 0 1 3 4.5 3 3 0 0 1-1 5.5V18a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2v-2A3 3 0 0 1 6 10.5 3 3 0 0 1 9 6z"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>`
};

export function tisiIconSvg(iconKey) {
  const key = String(iconKey || '').trim().toLowerCase();
  return ICON_SVG[key] || ICON_SVG.person;
}

export function defaultTisiLandingConfig() {
  return {
    siteName: 'Inner Strength Institute',
    tagline: 'Stronger People. Brighter Tomorrows.',
    logoUrl: '/assets/branding/innerstrength-mark.png',
    heroImageUrl: '/assets/tisi/home-hero.webp',
    ctaImageUrl: '/assets/tisi/mountain-banner.webp',
    ctaPosition: '50% 50%',
    heroMobilePosition: '65% 35%',
    heroPosition: '50% 52%',
    ctaHref: '/join/tisi',
    ctaButtonLabel: 'Get Started',
    ctaFinalButtonLabel: 'Schedule a Consultation',
    learnMoreHref: '#who-we-support',
    contactPhone: '',
    contactEmail: '',
    contactAddress: '',
    heroEyebrow: 'Mental health care for a stronger tomorrow',
    heroTitle: 'Build Inner Strength',
    heroSubtitle:
      'Compassionate, expert mental health services for men, boys, athletes and everyone on the journey to a healthier, more resilient life.',
    heroScript: 'Stronger People\nBrighter Tomorrows',
    pillarsText: 'HEAL | GROW | PERFORM | BELONG',
    supportKicker: 'Real people. Real potential.',
    supportTitle: 'Who We Support',
    supportBody:
      'We create a welcoming, inclusive space for growth — whether you are navigating pressure, purpose, performance, or the next chapter of life.',
    supportCards: [
      {
        slug: 'men',
        title: 'Men',
        body: "Support for life's challenges, pressure, identity, and purpose.",
        iconKey: 'person',
        iconUrl: '',
        href: '/p/tisi/men'
      },
      {
        slug: 'boys',
        title: 'Boys',
        body: "Guidance for today's challenges and tomorrow's brighter future.",
        iconKey: 'grad',
        iconUrl: '',
        href: '/p/tisi/boys'
      },
      {
        slug: 'athletes',
        title: 'Athletes',
        body: 'Mental skills, resilience, and support on and off the field.',
        iconKey: 'run',
        iconUrl: '',
        href: '/p/tisi/athletes'
      }
    ],
    servicesTitle: 'Our Services',
    servicesViewAllLabel: 'View All Services →',
    servicesViewAllHref: '/p/tisi/services',
    services: [
      {
        slug: 'individual-therapy',
        title: 'Individual Therapy',
        body: 'One-on-one care tailored to your goals, pace, and story.',
        iconKey: 'chat',
        iconUrl: '',
        href: '/p/tisi/individual-therapy'
      },
      {
        slug: 'adolescent-counseling',
        title: 'Adolescent Counseling',
        body: 'Support for teens navigating school, identity, and growth.',
        iconKey: 'pair',
        iconUrl: '',
        href: '/p/tisi/adolescent-counseling'
      },
      {
        slug: 'sports-performance',
        title: 'Sports & Performance Support',
        body: 'Mental skills that help athletes compete and recover well.',
        iconKey: 'dumbbell',
        iconUrl: '',
        href: '/p/tisi/sports-performance'
      },
      {
        slug: 'anxiety-stress',
        title: 'Anxiety & Stress',
        body: 'Practical tools to calm the mind and rebuild confidence.',
        iconKey: 'mind',
        iconUrl: '',
        href: '/p/tisi/anxiety-stress'
      },
      {
        slug: 'depression-mood',
        title: 'Depression & Mood Support',
        body: 'Compassionate care when motivation and hope feel far away.',
        iconKey: 'plant',
        iconUrl: '',
        href: '/p/tisi/depression-mood'
      },
      {
        slug: 'life-transitions',
        title: 'Life Transitions',
        body: 'Guidance through change, loss, purpose, and new beginnings.',
        iconKey: 'peak',
        iconUrl: '',
        href: '/p/tisi/life-transitions'
      }
    ],
    whyTitle: 'Why Clients Choose Inner Strength Institute',
    whyItems: [
      {
        title: 'Confidential Care',
        body: 'A private, respectful space where your story stays protected.',
        iconKey: 'shield',
        iconUrl: ''
      },
      {
        title: 'Specialized Support',
        body: 'Focused expertise for men, boys, athletes, and families.',
        iconKey: 'chart',
        iconUrl: ''
      },
      {
        title: 'Evidence-Based Approach',
        body: 'Care grounded in proven methods and real-world practice.',
        iconKey: 'brain',
        iconUrl: ''
      },
      {
        title: 'Supportive Environment',
        body: 'Warm, judgment-free relationships that make growth possible.',
        iconKey: 'heart',
        iconUrl: ''
      }
    ],
    processKicker: 'Simple steps. Meaningful progress.',
    processTitle: 'How It Works',
    processSteps: [
      {
        title: 'Connect',
        body: 'Tell us about the support you are looking for through our online intake.',
        href: '/join/tisi'
      },
      {
        title: 'Get Matched',
        body: "We'll match you with the right therapist for your goals and needs.",
        href: '/join/tisi'
      },
      {
        title: 'Begin Care',
        body: 'Start your journey toward a stronger, healthier you.',
        href: ''
      }
    ],
    testimonialsTitle: 'What Our Clients Say',
    testimonials: [],
    ctaTitle: 'Ready to Take the Next Step?',
    ctaBody: 'Reach out today for a confidential consultation. A healthier, stronger you is possible.',
    ctaNote: 'No pressure. Just a conversation.',
    socialLinks: [],
    primaryNav: [
      { label: 'Home', href: '/p/tisi' },
      { label: 'Services', href: '/p/tisi/services' },
      { label: 'Who We Help', href: '/p/tisi/who-we-help' },
      { label: 'About', href: '/p/tisi/about' },
      { label: 'Resources', href: '/p/tisi/resources' },
      { label: 'Contact', href: '/p/tisi/contact' }
    ],
    legalFooterLinks: [
      { label: 'Privacy Policy', href: '/p/tisi/privacy' },
      { label: 'Terms of Service', href: '/p/tisi/terms' },
      { label: 'Accessibility', href: '/p/tisi/accessibility' }
    ]
  };
}

function mergeList(defaults, overrides, mapRow) {
  if (!Array.isArray(overrides)) return defaults.map((d) => ({ ...d }));
  return overrides.map((row, i) => mapRow(row || {}, defaults[i] || {}));
}

/** Resolve full landing config from page + branding_json (admin overrides win). */
export function resolveTisiLandingConfig({ pageMeta, branding } = {}) {
  const b = branding && typeof branding === 'object' ? branding : {};
  const landing = b.landing && typeof b.landing === 'object' ? b.landing : {};
  const d = defaultTisiLandingConfig();
  const page = pageMeta || {};

  const pick = (...vals) => {
    for (const v of vals) {
      if (v == null) continue;
      const s = typeof v === 'string' ? v.trim() : v;
      if (s !== undefined) return typeof v === 'string' ? s : v;
    }
    return '';
  };

  const supportCards = mergeList(d.supportCards, landing.supportCards, (row, def) => ({
    slug: pick(row.slug, def.slug),
    title: pick(row.title, def.title),
    body: pick(row.body, def.body),
    iconKey: pick(row.iconKey, def.iconKey) || 'person',
    iconUrl: pick(row.iconUrl, def.iconUrl),
    href: pick(row.href, def.href, row.slug ? `/p/tisi/${row.slug}` : '')
  }));

  const services = mergeList(d.services, landing.services, (row, def) => ({
    slug: pick(row.slug, def.slug),
    title: pick(row.title, def.title),
    body: pick(row.body, def.body),
    iconKey: pick(row.iconKey, def.iconKey) || 'chat',
    iconUrl: pick(row.iconUrl, def.iconUrl),
    href: pick(row.href, def.href, row.slug ? `/p/tisi/${row.slug}` : '')
  }));

  const whyItems = mergeList(d.whyItems, landing.whyItems, (row, def) => ({
    title: pick(row.title, def.title),
    body: pick(row.body, def.body),
    iconKey: pick(row.iconKey, def.iconKey) || 'shield',
    iconUrl: pick(row.iconUrl, def.iconUrl)
  }));

  const processSteps = mergeList(d.processSteps, landing.processSteps, (row, def) => ({
    title: pick(row.title, def.title),
    body: pick(row.body, def.body),
    href: pick(row.href, def.href)
  }));

  const testimonials = mergeList(d.testimonials, landing.testimonials, (row, def) => ({
    text: pick(row.text, def.text),
    attribution: pick(row.attribution, def.attribution),
    verified: row.verified === true
  }));

  const socialLinks = mergeList(d.socialLinks, landing.socialLinks || b.socialLinks, (row, def) => ({
    label: pick(row.label, def.label),
    short: pick(row.short, def.short),
    href: pick(row.href, def.href)
  }));

  const primaryNavRaw = Array.isArray(b.primaryNav) ? b.primaryNav : d.primaryNav;
  const primaryNav = primaryNavRaw
    .map((r) => ({ label: String(r?.label || '').trim(), href: String(r?.href || '').trim() }))
    .filter((r) => r.label && r.href);

  const legalRaw =
    Array.isArray(b.legalFooterLinks) ? b.legalFooterLinks : d.legalFooterLinks;
  const legalFooterLinks = legalRaw
    .map((r) => ({ label: String(r?.label || '').trim(), href: String(r?.href || r?.url || '').trim() }))
    .filter((r) => r.label && r.href);

  return {
    heroPosition: pick(landing.heroPosition, d.heroPosition),
    heroMobilePosition: pick(landing.heroMobilePosition, d.heroMobilePosition),
    ctaPosition: pick(landing.ctaPosition, d.ctaPosition),
    siteName: pick(b.siteName, landing.siteName, page.title, d.siteName),
    tagline: pick(b.tagline, landing.tagline, d.tagline),
    logoUrl: pick(b.logoUrl, b.logoPath, landing.logoUrl, d.logoUrl),
    heroImageUrl: currentTisiImage(pick(page.heroImageUrl, b.heroImageUrl, landing.heroImageUrl, d.heroImageUrl), d.heroImageUrl),
    ctaImageUrl: currentTisiImage(pick(b.ctaImageUrl, landing.ctaImageUrl, d.ctaImageUrl), d.ctaImageUrl),
    ctaHref: pick(b.ctaHref, landing.ctaHref, d.ctaHref) === '/p/tisi/get-started' ? '/join/tisi' : pick(b.ctaHref, landing.ctaHref, d.ctaHref),
    ctaButtonLabel: pick(landing.ctaButtonLabel, d.ctaButtonLabel),
    ctaFinalButtonLabel: pick(landing.ctaFinalButtonLabel, d.ctaFinalButtonLabel),
    learnMoreHref: pick(landing.learnMoreHref, d.learnMoreHref),
    contactPhone: pick(b.contactPhone, landing.contactPhone, b.contact?.phone, d.contactPhone),
    contactEmail: pick(b.contactEmail, landing.contactEmail, b.contact?.email, d.contactEmail),
    contactAddress: pick(b.contactAddress, landing.contactAddress, b.contact?.address, d.contactAddress),
    heroEyebrow: pick(landing.heroEyebrow, d.heroEyebrow),
    heroTitle: pick(page.heroTitle, landing.heroTitle, d.heroTitle),
    heroSubtitle: pick(page.heroSubtitle, landing.heroSubtitle, d.heroSubtitle),
    heroScript: pick(landing.heroScript, d.heroScript),
    pillarsText: pick(landing.pillarsText, d.pillarsText),
    supportKicker: pick(landing.supportKicker, d.supportKicker),
    supportTitle: pick(landing.supportTitle, d.supportTitle),
    supportBody: pick(landing.supportBody, d.supportBody),
    supportCards,
    servicesTitle: pick(landing.servicesTitle, d.servicesTitle),
    servicesViewAllLabel: pick(landing.servicesViewAllLabel, d.servicesViewAllLabel),
    servicesViewAllHref: pick(landing.servicesViewAllHref, d.servicesViewAllHref),
    services,
    whyTitle: pick(landing.whyTitle, d.whyTitle),
    whyItems,
    processKicker: pick(landing.processKicker, d.processKicker),
    processTitle: pick(landing.processTitle, d.processTitle),
    processSteps,
    testimonialsTitle: pick(landing.testimonialsTitle, d.testimonialsTitle),
    testimonials,
    ctaTitle: pick(landing.ctaTitle, d.ctaTitle),
    ctaBody: pick(landing.ctaBody, d.ctaBody),
    ctaNote: pick(landing.ctaNote, d.ctaNote),
    socialLinks,
    primaryNav,
    legalFooterLinks
  };
}

/** Flatten resolved config into admin form fields. */
export function tisiLandingToAdminForm(resolved) {
  const r = resolved || defaultTisiLandingConfig();
  return {
    heroPosition: r.heroPosition,
    heroMobilePosition: r.heroMobilePosition,
    ctaPosition: r.ctaPosition,
    siteName: r.siteName || '',
    tagline: r.tagline || '',
    ctaImageUrl: r.ctaImageUrl || '',
    ctaHref: r.ctaHref || '',
    ctaButtonLabel: r.ctaButtonLabel || '',
    ctaFinalButtonLabel: r.ctaFinalButtonLabel || '',
    learnMoreHref: r.learnMoreHref || '',
    contactPhone: r.contactPhone || '',
    contactEmail: r.contactEmail || '',
    contactAddress: r.contactAddress || '',
    heroEyebrow: r.heroEyebrow || '',
    heroScript: r.heroScript || '',
    pillarsText: r.pillarsText || '',
    supportKicker: r.supportKicker || '',
    supportTitle: r.supportTitle || '',
    supportBody: r.supportBody || '',
    supportCards: (r.supportCards || []).map((c) => ({ ...c })),
    servicesTitle: r.servicesTitle || '',
    servicesViewAllLabel: r.servicesViewAllLabel || '',
    servicesViewAllHref: r.servicesViewAllHref || '',
    services: (r.services || []).map((c) => ({ ...c })),
    whyTitle: r.whyTitle || '',
    whyItems: (r.whyItems || []).map((c) => ({ ...c })),
    processKicker: r.processKicker || '',
    processTitle: r.processTitle || '',
    processSteps: (r.processSteps || []).map((c) => ({ ...c })),
    testimonialsTitle: r.testimonialsTitle || '',
    testimonials: (r.testimonials || []).map((c) => ({ ...c })),
    ctaTitle: r.ctaTitle || '',
    ctaBody: r.ctaBody || '',
    ctaNote: r.ctaNote || '',
    socialLinks: (r.socialLinks || []).map((c) => ({ ...c }))
  };
}

/** Build branding.landing (+ related top-level keys) from admin form state. */
export function adminFormToTisiLandingBranding(form) {
  const f = form || {};
  const cleanCards = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map((r) => ({
        slug: String(r.slug || '').trim(),
        title: String(r.title || '').trim(),
        body: String(r.body || '').trim(),
        iconKey: String(r.iconKey || '').trim() || 'person',
        iconUrl: String(r.iconUrl || '').trim(),
        href: String(r.href || '').trim()
      }))
      .filter((r) => r.title);

  const cleanWhy = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map((r) => ({
        title: String(r.title || '').trim(),
        body: String(r.body || '').trim(),
        iconKey: String(r.iconKey || '').trim() || 'shield',
        iconUrl: String(r.iconUrl || '').trim()
      }))
      .filter((r) => r.title);

  const cleanSteps = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map((r) => ({
        title: String(r.title || '').trim(),
        body: String(r.body || '').trim(),
        href: String(r.href || '').trim()
      }))
      .filter((r) => r.title);

  const cleanQuotes = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map((r) => ({
        text: String(r.text || '').trim(),
        attribution: String(r.attribution || '').trim(),
        verified: r.verified === true
      }))
      .filter((r) => r.text);

  const cleanSocial = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map((r) => ({
        label: String(r.label || '').trim(),
        short: String(r.short || '').trim(),
        href: String(r.href || '').trim()
      }))
      .filter((r) => r.label && r.href);

  const landing = {
    heroPosition: String(f.heroPosition || '').trim(),
    heroMobilePosition: String(f.heroMobilePosition || '').trim(),
    ctaPosition: String(f.ctaPosition || '').trim(),
    siteName: String(f.siteName || '').trim(),
    tagline: String(f.tagline || '').trim(),
    ctaImageUrl: String(f.ctaImageUrl || '').trim(),
    ctaHref: String(f.ctaHref || '').trim(),
    ctaButtonLabel: String(f.ctaButtonLabel || '').trim(),
    ctaFinalButtonLabel: String(f.ctaFinalButtonLabel || '').trim(),
    learnMoreHref: String(f.learnMoreHref || '').trim(),
    contactPhone: String(f.contactPhone || '').trim(),
    contactEmail: String(f.contactEmail || '').trim(),
    contactAddress: String(f.contactAddress || '').trim(),
    heroEyebrow: String(f.heroEyebrow || '').trim(),
    heroTitle: String(f.heroTitle || '').trim(),
    heroSubtitle: String(f.heroSubtitle || '').trim(),
    heroScript: String(f.heroScript || '').trim(),
    pillarsText: String(f.pillarsText || '').trim(),
    supportKicker: String(f.supportKicker || '').trim(),
    supportTitle: String(f.supportTitle || '').trim(),
    supportBody: String(f.supportBody || '').trim(),
    supportCards: cleanCards(f.supportCards),
    servicesTitle: String(f.servicesTitle || '').trim(),
    servicesViewAllLabel: String(f.servicesViewAllLabel || '').trim(),
    servicesViewAllHref: String(f.servicesViewAllHref || '').trim(),
    services: cleanCards(f.services),
    whyTitle: String(f.whyTitle || '').trim(),
    whyItems: cleanWhy(f.whyItems),
    processKicker: String(f.processKicker || '').trim(),
    processTitle: String(f.processTitle || '').trim(),
    processSteps: cleanSteps(f.processSteps),
    testimonialsTitle: String(f.testimonialsTitle || '').trim(),
    testimonials: cleanQuotes(f.testimonials),
    ctaTitle: String(f.ctaTitle || '').trim(),
    ctaBody: String(f.ctaBody || '').trim(),
    ctaNote: String(f.ctaNote || '').trim(),
    socialLinks: cleanSocial(f.socialLinks)
  };

  return {
    landingTemplate: 'tisi',
    siteName: landing.siteName,
    tagline: landing.tagline,
    ctaHref: landing.ctaHref,
    ctaImageUrl: landing.ctaImageUrl,
    contactPhone: landing.contactPhone,
    contactEmail: landing.contactEmail,
    contactAddress: landing.contactAddress,
    landing
  };
}

// Replace only the previous bundled placeholder, preserving uploaded/editor-selected images.
function currentTisiImage(url, fallback) {
  return url === '/assets/careers/heroes/colorado-photo.png' ? fallback : url;
}
