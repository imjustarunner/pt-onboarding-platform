/**
 * Defaults + helpers for practitioner public booking frames
 * (life coach discovery flow + consultant service booking).
 */

export function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

export function defaultDiscoverySettings(orgType) {
  const t = String(orgType || '').toLowerCase();
  if (t === 'life_coach') {
    return {
      discoveryBookingEnabled: true,
      discoveryBookingRequired: true,
      discoveryDurationMin: 20,
      discoveryLabel: 'Discovery Call'
    };
  }
  if (t === 'consultant') {
    return {
      discoveryBookingEnabled: true,
      discoveryBookingRequired: false,
      discoveryDurationMin: 30,
      discoveryLabel: 'Quick Clarity Call'
    };
  }
  return {
    discoveryBookingEnabled: false,
    discoveryBookingRequired: false,
    discoveryDurationMin: 30,
    discoveryLabel: 'Discovery Call'
  };
}

export function resolveDiscoverySettings(orgType, featureFlags = {}) {
  const defaults = defaultDiscoverySettings(orgType);
  const flags = featureFlags || {};
  return {
    discoveryBookingEnabled:
      flags.discoveryBookingEnabled === undefined
        ? defaults.discoveryBookingEnabled
        : !!flags.discoveryBookingEnabled,
    discoveryBookingRequired:
      flags.discoveryBookingRequired === undefined
        ? defaults.discoveryBookingRequired
        : !!flags.discoveryBookingRequired,
    discoveryDurationMin: Number(flags.discoveryDurationMin || defaults.discoveryDurationMin) || defaults.discoveryDurationMin,
    discoveryLabel: String(flags.discoveryLabel || defaults.discoveryLabel).trim() || defaults.discoveryLabel
  };
}

/** Default paid/service catalog for consultants (customizable via feature_flags.practitionerServiceCatalog). */
export function defaultConsultantServiceCatalog(discoverySettings) {
  const catalog = [
    {
      id: 'strategy',
      name: 'Strategy Session',
      durationMin: 60,
      priceCents: 25000,
      description: 'Deep dive into your challenges and opportunities.',
      icon: 'chart',
      isDiscovery: false
    },
    {
      id: 'growth',
      name: 'Growth Planning Session',
      durationMin: 90,
      priceCents: 37500,
      description: 'Build a customized growth plan for your business.',
      icon: 'group',
      isDiscovery: false
    },
    {
      id: 'ops',
      name: 'Operations Review',
      durationMin: 60,
      priceCents: 25000,
      description: 'Optimize systems and improve operational efficiency.',
      icon: 'gear',
      isDiscovery: false
    },
    {
      id: 'workshop',
      name: 'Team Workshop',
      durationMin: 120,
      priceCents: 75000,
      description: 'Collaborative session for your leadership team.',
      icon: 'team',
      isDiscovery: false
    }
  ];

  if (discoverySettings?.discoveryBookingEnabled) {
    catalog.push({
      id: 'discovery',
      name: discoverySettings.discoveryLabel || 'Quick Clarity Call',
      durationMin: discoverySettings.discoveryDurationMin || 30,
      priceCents: 0,
      description: 'Short call to get quick answers to your top questions.',
      icon: 'chat',
      isDiscovery: true
    });
  }
  return catalog;
}

export function resolveServiceCatalog(orgType, featureFlags = {}) {
  const discovery = resolveDiscoverySettings(orgType, featureFlags);
  const custom = Array.isArray(featureFlags?.practitionerServiceCatalog)
    ? featureFlags.practitionerServiceCatalog
    : null;
  if (custom?.length) {
    return custom.map((s) => ({
      id: String(s.id || s.name || '').trim() || `svc_${Math.random().toString(36).slice(2, 7)}`,
      name: String(s.name || 'Session').trim(),
      durationMin: Number(s.durationMin || 60),
      priceCents: Number(s.priceCents || 0),
      description: String(s.description || ''),
      icon: String(s.icon || 'chart'),
      isDiscovery: !!s.isDiscovery
    }));
  }
  if (String(orgType || '').toLowerCase() === 'consultant') {
    return defaultConsultantServiceCatalog(discovery);
  }
  // Life coach: discovery-only catalog by default
  return [
    {
      id: 'discovery',
      name: discovery.discoveryLabel || 'Discovery Call',
      durationMin: discovery.discoveryDurationMin || 20,
      priceCents: 0,
      description: 'A free, no-pressure conversation to explore your goals.',
      icon: 'chat',
      isDiscovery: true
    }
  ];
}

/**
 * Default marketing shell for practitioner booking pages.
 * Pathway (3-step discovery vs consultant service+calendar) stays by org type;
 * every copy/visual area here is overridable per tenant.
 */
const BOOKING_PAGE_STYLE_DEFAULTS = Object.freeze({
  fontFamily: '',
  headingFontFamily: '',
  accentColor: ''
});

export function defaultBookingPageSettings(orgType) {
  const t = String(orgType || '').toLowerCase();
  if (t === 'consultant') {
    return {
      ...BOOKING_PAGE_STYLE_DEFAULTS,
      brandDisplayName: '',
      ctaLabel: 'Book a Session',
      showNav: false,
      navLinks: [],
      backgroundImageUrl: '',
      consultantTagline: 'Strategic guidance. Practical solutions. Real results.',
      consultantBenefits: [
        'Personalized 1:1 Sessions',
        'Flexible Scheduling',
        'Secure & Confidential'
      ],
      providerTitleFallback: 'Senior Consultant',
      providerBioFallback:
        'I help leaders and organizations grow with clarity, strategy, and systems that scale.',
      specialties: [],
      whatToExpectTitle: 'What to expect',
      whatToExpectBody:
        'A focused working session tailored to the service you select.',
      coachQuote: '',
      modalityLabel: 'Virtual',
      valueProps: [
        { title: 'Easy scheduling', body: 'Book from live calendar availability' },
        { title: 'Calendar sync', body: 'Works with your calendar' },
        { title: "You're in control", body: 'Decide next steps after you connect' }
      ],
      coachEyebrow: '',
      coachHeroTitles: { step1: '', step2: '', step3: '' },
      coachHeroSubtitles: { step1: '', step2: '', step3: '' },
      valuePropsStep1: [],
      valuePropsLater: [],
      step3Fields: []
    };
  }
  // life_coach (+ fallback)
  return {
    ...BOOKING_PAGE_STYLE_DEFAULTS,
    brandDisplayName: '',
    ctaLabel: 'Book a Discovery Call',
    showNav: true,
    navLinks: [
      { label: 'About Me', href: '#booking' },
      { label: 'Coaching', href: '#booking' },
      { label: 'Programs', href: '#booking' },
      { label: 'Resources', href: '#booking' },
      { label: 'Contact', href: '#booking' }
    ],
    backgroundImageUrl: '',
    consultantTagline: '',
    consultantBenefits: [],
    providerTitleFallback: 'Life Coach',
    providerBioFallback: 'Helping you rise, revive, and create lasting change.',
    specialties: [
      'Life & Personal Growth',
      'Mindset & Confidence',
      'Goal Setting & Accountability',
      'Work-Life Balance'
    ],
    whatToExpectTitle: 'What to expect',
    whatToExpectBody:
      'A friendly, no-pressure conversation to explore your goals and see how I can support you.',
    coachQuote:
      "Sometimes the first step is the hardest, but it's also the most powerful. I'm honored you're taking it.",
    modalityLabel: 'Virtual (Zoom)',
    coachEyebrow: 'Discovery Call',
    coachHeroTitles: {
      step1: "Let's find a time that works for you",
      step2: 'Almost there!',
      step3: "You're almost all set!"
    },
    coachHeroSubtitles: {
      step1:
        'This is the first step toward lasting change. Select a time that works best for you for our discovery call.',
      step2: 'Share the days and times that usually work for you — this is submitted with your request.',
      step3:
        'Just a few quick details so I can personalize our call and make the most of our time together.'
    },
    valueProps: [],
    valuePropsStep1: [
      { title: 'No Obligation', body: 'This discovery call is 100% free with no pressure.' },
      { title: 'Get to Know Each Other', body: "A chance to connect and see if we're a good fit." },
      { title: 'Next Steps', body: "If it feels right, we'll talk about how I can support you." }
    ],
    valuePropsLater: [
      { title: 'Get to know each other', body: "A chance to connect and see if we're a good fit." },
      { title: 'Explore your goals', body: "We'll talk about what's on your mind and what you want to create." },
      { title: "You're in control", body: 'You decide what happens next after our call.' }
    ],
    step3Fields: defaultStep3Fields()
  };
}

export function defaultStep3Fields() {
  return [
    {
      id: 'name',
      type: 'text',
      label: 'Full Name',
      required: true,
      enabled: true,
      placeholder: '',
      options: []
    },
    {
      id: 'email',
      type: 'email',
      label: 'Email Address',
      required: true,
      enabled: true,
      placeholder: 'you@example.com',
      options: []
    },
    {
      id: 'phone',
      type: 'tel',
      label: 'Phone Number',
      required: false,
      enabled: true,
      placeholder: '(555) 123-4567',
      options: []
    },
    {
      id: 'referralSource',
      type: 'select',
      label: 'How did you hear about me?',
      required: false,
      enabled: true,
      placeholder: 'Select one…',
      options: ['Google / search', 'Social media', 'Friend or family', 'Podcast / media', 'Other']
    },
    {
      id: 'goals',
      type: 'textarea',
      label: 'What are you hoping to get out of our discovery call?',
      required: true,
      enabled: true,
      placeholder: '',
      maxLength: 500,
      options: []
    },
    {
      id: 'notes',
      type: 'textarea',
      label: 'Anything else I should know before our call?',
      required: false,
      enabled: true,
      placeholder: '',
      maxLength: 500,
      options: []
    }
  ];
}

function resolveStep3Fields(rawFields) {
  const defaults = defaultStep3Fields();
  if (!Array.isArray(rawFields) || !rawFields.length) {
    return defaults.map((f) => ({ ...f, options: [...(f.options || [])] }));
  }
  // Preserve coach order; merge known ids with defaults for missing keys
  const byId = new Map(defaults.map((f) => [f.id, f]));
  const out = [];
  for (const f of rawFields) {
    const id = String(f?.id || '').trim();
    if (!id) continue;
    const base = byId.get(id) || {
      id,
      type: 'text',
      label: id,
      required: false,
      enabled: true,
      placeholder: '',
      options: []
    };
    out.push({
      id,
      type: ['text', 'email', 'tel', 'select', 'textarea'].includes(String(f.type))
        ? String(f.type)
        : base.type,
      label: String(f.label || base.label).trim() || base.label,
      required: f.required === undefined ? !!base.required : !!f.required,
      enabled: f.enabled === undefined ? true : !!f.enabled,
      placeholder: String(f.placeholder ?? base.placeholder ?? '').trim(),
      maxLength: Number(f.maxLength || base.maxLength || 0) || undefined,
      options: Array.isArray(f.options)
        ? f.options.map((o) => String(o || '').trim()).filter(Boolean)
        : [...(base.options || [])]
    });
    byId.delete(id);
  }
  // Keep any default fields the coach didn't include (still editable later)
  for (const leftover of byId.values()) {
    out.push({ ...leftover, options: [...(leftover.options || [])] });
  }
  return out;
}

function asStringList(value, fallback = []) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v || '').trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/\n|,/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [...fallback];
}

function asValueProps(value, fallback = []) {
  if (!Array.isArray(value) || !value.length) return fallback.map((v) => ({ ...v }));
  return value
    .map((v) => ({
      title: String(v?.title || '').trim(),
      body: String(v?.body || '').trim()
    }))
    .filter((v) => v.title || v.body);
}

function asNavLinks(value, fallback = []) {
  if (!Array.isArray(value)) return fallback.map((v) => ({ ...v }));
  return value
    .map((v) => ({
      label: String(v?.label || '').trim(),
      href: String(v?.href || '#booking').trim() || '#booking'
    }))
    .filter((v) => v.label);
}

export function resolveBookingPageSettings(orgType, stored = {}) {
  const defaults = defaultBookingPageSettings(orgType);
  const raw = stored && typeof stored === 'object' ? stored : {};
  const titles = { ...defaults.coachHeroTitles, ...(raw.coachHeroTitles || {}) };
  const subs = { ...defaults.coachHeroSubtitles, ...(raw.coachHeroSubtitles || {}) };
  return {
    fontFamily: String(raw.fontFamily || defaults.fontFamily || '').trim().toLowerCase(),
    headingFontFamily: String(raw.headingFontFamily || defaults.headingFontFamily || '').trim().toLowerCase(),
    accentColor: String(raw.accentColor || defaults.accentColor || '').trim(),
    brandDisplayName: String(raw.brandDisplayName ?? defaults.brandDisplayName).trim(),
    ctaLabel: String(raw.ctaLabel || defaults.ctaLabel).trim() || defaults.ctaLabel,
    showNav: raw.showNav === undefined ? defaults.showNav : !!raw.showNav,
    navLinks: asNavLinks(raw.navLinks, defaults.navLinks),
    backgroundImageUrl: String(raw.backgroundImageUrl || defaults.backgroundImageUrl || '').trim(),
    consultantTagline: String(raw.consultantTagline || defaults.consultantTagline).trim(),
    consultantBenefits: asStringList(raw.consultantBenefits, defaults.consultantBenefits),
    providerTitleFallback: String(raw.providerTitleFallback || defaults.providerTitleFallback).trim(),
    providerBioFallback: String(raw.providerBioFallback || defaults.providerBioFallback).trim(),
    specialties: asStringList(raw.specialties, defaults.specialties),
    whatToExpectTitle: String(raw.whatToExpectTitle || defaults.whatToExpectTitle).trim(),
    whatToExpectBody: String(raw.whatToExpectBody || defaults.whatToExpectBody).trim(),
    coachQuote: String(raw.coachQuote ?? defaults.coachQuote).trim(),
    modalityLabel: String(raw.modalityLabel || defaults.modalityLabel).trim(),
    coachEyebrow: String(raw.coachEyebrow || defaults.coachEyebrow).trim(),
    coachHeroTitles: {
      step1: String(titles.step1 || defaults.coachHeroTitles.step1).trim(),
      step2: String(titles.step2 || defaults.coachHeroTitles.step2).trim(),
      step3: String(titles.step3 || defaults.coachHeroTitles.step3).trim()
    },
    coachHeroSubtitles: {
      step1: String(subs.step1 || defaults.coachHeroSubtitles.step1).trim(),
      step2: String(subs.step2 || defaults.coachHeroSubtitles.step2).trim(),
      step3: String(subs.step3 || defaults.coachHeroSubtitles.step3).trim()
    },
    valueProps: asValueProps(raw.valueProps, defaults.valueProps),
    valuePropsStep1: asValueProps(raw.valuePropsStep1, defaults.valuePropsStep1),
    valuePropsLater: asValueProps(raw.valuePropsLater, defaults.valuePropsLater),
    step3Fields: resolveStep3Fields(raw.step3Fields || defaults.step3Fields)
  };
}

/**
 * Shape a booking page draft into the JSON payload for PUT /agencies/:id publicBookingSettings.
 */
export function compactBookingPageForSave(orgType, draft = {}) {
  const resolved = resolveBookingPageSettings(orgType, draft);
  return {
    fontFamily: resolved.fontFamily,
    headingFontFamily: resolved.headingFontFamily,
    accentColor: resolved.accentColor,
    brandDisplayName: resolved.brandDisplayName,
    ctaLabel: resolved.ctaLabel,
    showNav: resolved.showNav,
    navLinks: resolved.navLinks,
    backgroundImageUrl: resolved.backgroundImageUrl,
    consultantTagline: resolved.consultantTagline,
    consultantBenefits: resolved.consultantBenefits,
    providerTitleFallback: resolved.providerTitleFallback,
    providerBioFallback: resolved.providerBioFallback,
    specialties: resolved.specialties,
    whatToExpectTitle: resolved.whatToExpectTitle,
    whatToExpectBody: resolved.whatToExpectBody,
    coachQuote: resolved.coachQuote,
    modalityLabel: resolved.modalityLabel,
    coachEyebrow: resolved.coachEyebrow,
    coachHeroTitles: resolved.coachHeroTitles,
    coachHeroSubtitles: resolved.coachHeroSubtitles,
    valueProps: resolved.valueProps,
    valuePropsStep1: resolved.valuePropsStep1,
    valuePropsLater: resolved.valuePropsLater,
    step3Fields: resolved.step3Fields
  };
}

export function parseJsonColumn(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(String(raw));
  } catch {
    return {};
  }
}

export function formatPriceCents(cents) {
  const n = Number(cents || 0);
  if (!n) return 'Free';
  return `$${(n / 100).toFixed(n % 100 === 0 ? 0 : 2)}`;
}

export function startOfWeekMondayYmd(ymd) {
  const d = new Date(`${ymd}T12:00:00`);
  const day = d.getDay(); // 0 Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export function addDaysYmd(ymd, days) {
  const d = new Date(`${ymd}T12:00:00`);
  d.setDate(d.getDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}
