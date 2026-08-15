export const JOIN_FONT_OPTIONS = [
  { id: 'great-vibes', label: 'Great Vibes', family: '"Great Vibes", cursive', kind: 'script' },
  { id: 'allura', label: 'Allura', family: '"Allura", cursive', kind: 'script' },
  { id: 'pacifico', label: 'Pacifico', family: '"Pacifico", cursive', kind: 'script' },
  { id: 'playfair', label: 'Playfair Display', family: '"Playfair Display", Georgia, serif', kind: 'serif' },
  { id: 'fraunces', label: 'Fraunces', family: '"Fraunces", Georgia, serif', kind: 'serif' },
  { id: 'cormorant', label: 'Cormorant Garamond', family: '"Cormorant Garamond", serif', kind: 'serif' },
  { id: 'dm-serif', label: 'DM Serif Display', family: '"DM Serif Display", serif', kind: 'serif' },
  { id: 'lora', label: 'Lora', family: '"Lora", serif', kind: 'serif' },
  { id: 'source-sans', label: 'Source Sans 3', family: '"Source Sans 3", sans-serif', kind: 'sans' },
  { id: 'nunito', label: 'Nunito', family: '"Nunito", sans-serif', kind: 'sans' },
  { id: 'outfit', label: 'Outfit', family: '"Outfit", sans-serif', kind: 'sans' }
];

export const JOIN_FONT_HREF =
  'https://fonts.googleapis.com/css2?family=Allura&family=Cormorant+Garamond:wght@500;600;700&family=DM+Serif+Display&family=Fraunces:opsz,wght@9..144,500;9..144,700&family=Great+Vibes&family=Lora:wght@500;600;700&family=Nunito:wght@500;700&family=Outfit:wght@500;700&family=Pacifico&family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@400;600;700&display=swap';

export const BLOCK_ALIGNMENTS = ['left', 'center', 'right'];

export function normalizeAlign(value, fallback = 'left') {
  const v = String(value || '').trim().toLowerCase();
  return BLOCK_ALIGNMENTS.includes(v) ? v : fallback;
}

/** Margin/text-align pair that positions a fit-content block the way a text editor would. */
export function alignBlockStyle(align, fallback = 'left') {
  const a = normalizeAlign(align, fallback);
  return {
    textAlign: a,
    marginLeft: a === 'left' ? '0' : 'auto',
    marginRight: a === 'right' ? '0' : 'auto'
  };
}

/**
 * Keep a dragged block inside its container.
 * If the block is taller/wider than the container, still allow movement so a
 * large card can be lifted — only keep a sliver on screen.
 */
export function clampOffsetValue({ value, base, size, min, max, pad = 8 }) {
  if (!Number.isFinite(value) || !Number.isFinite(base) || !Number.isFinite(size) || !Number.isFinite(min) || !Number.isFinite(max)) {
    return value;
  }
  const span = max - min;
  const keepVisible = Math.min(48, Math.max(24, size * 0.15));
  if (size >= span - pad * 2) {
    const lo = min + keepVisible - (base + size);
    const hi = max - keepVisible - base;
    if (hi < lo) return value;
    return Math.min(hi, Math.max(lo, value));
  }
  const lo = min + pad - base;
  const hi = max - pad - (base + size);
  if (hi < lo) return value;
  return Math.min(hi, Math.max(lo, value));
}

function looksBrokenPosition(pos = {}) {
  const x = Number(pos.x) || 0;
  const y = Number(pos.y) || 0;
  return x < -480 || x > 1400 || y < -400 || y > 1200;
}

/** Drop saved pixel offsets that were clamped off-canvas in earlier editor builds. */
export function sanitizeJoinPositions(positions = {}, fallback = {}) {
  const out = {};
  for (const key of Object.keys(fallback)) {
    const src = positions?.[key] && typeof positions[key] === 'object' ? positions[key] : fallback[key];
    out[key] = looksBrokenPosition(src) ? { ...fallback[key] } : {
      x: Number(src.x) || 0,
      y: Number(src.y) || 0
    };
  }
  return out;
}

export function defaultJoinLayout() {
  return {
    footerStyle: 'hidden',
    showSidebar: true,
    fonts: {
      welcome: 'great-vibes',
      script: 'great-vibes',
      body: 'source-sans',
      cardTitle: 'playfair'
    },
    sizes: {
      welcome: 4.2,
      glad: 1.25,
      lead: 0.91,
      cardTitle: 1.45,
      cards: 1,
      cardsWidth: 860,
      cardsMinHeight: 0,
      brandWidth: 298,
      helpWidth: 0,
      logoWidth: 218,
      tagline: 0.68,
      script: 2,
      values: 0.84
    },
    hidden: {
      welcome: false,
      glad: false,
      lead: false
    },
    align: {
      welcome: 'left',
      glad: 'left',
      lead: 'left',
      cards: 'left',
      brand: 'left',
      logo: 'left',
      tagline: 'left',
      script: 'left',
      values: 'left',
      help: 'left'
    },
    positions: {
      welcome: { x: 0, y: 0 },
      glad: { x: 28, y: -19 },
      lead: { x: 74, y: -31 },
      cards: { x: 156, y: 18 },
      brand: { x: 16, y: 71 },
      logo: { x: 18, y: 22 },
      tagline: { x: 57, y: 3 },
      script: { x: 20, y: 15 },
      values: { x: 27, y: 32 },
      help: { x: 18, y: -342 }
    }
  };
}

export function fontFamilyById(id) {
  return JOIN_FONT_OPTIONS.find((f) => f.id === id)?.family || '"Source Sans 3", sans-serif';
}

/** Public static files in frontend/public/assets/intake-themes (no auth). */
export const JOIN_BOOT_THEME_URL = '/assets/intake-themes/greenintakethemecounseling.jpg';
export const PUBLIC_SUPPORT_THEME_URL = '/assets/intake-themes/greenintakethemecounselingV2.jpg';
export const PUBLIC_INTAKE_THEME_URLS = Object.freeze({
  counseling: JOIN_BOOT_THEME_URL,
  counselingSupport: PUBLIC_SUPPORT_THEME_URL,
  counselingBlue: '/assets/intake-themes/blueintakethemecounseling.jpg',
  tutoring: '/assets/intake-themes/bluetutoringtheme.jpg',
  sidebarGreen: '/assets/intake-themes/backgroundsidegreen.jpg'
});

export const PUBLIC_SUPPORT_LAYOUT_KEYS = [
  'logo',
  'kicker',
  'title',
  'lead',
  'login',
  'join',
  'careers',
  'booking',
  'billing',
  'card'
];

export function defaultPublicSupportLayout() {
  return {
    positions: {
      logo: { x: 70, y: -190 },
      kicker: { x: 26, y: -182 },
      title: { x: 23, y: -196 },
      lead: { x: 26, y: -200 },
      login: { x: 21, y: -168 },
      join: { x: 22, y: -153 },
      careers: { x: 22, y: -136 },
      booking: { x: 0, y: 0 },
      billing: { x: 21, y: -115 },
      card: { x: 186, y: -24 }
    },
    sizes: {
      logoWidth: 180,
      kickerWidth: 280,
      titleWidth: 280,
      leadWidth: 280,
      loginWidth: 280,
      joinWidth: 280,
      careersWidth: 280,
      bookingWidth: 280,
      billingWidth: 280,
      title: 1.85,
      lead: 0.9,
      kicker: 0.74,
      cardWidth: 980
    }
  };
}

function mergeSupportPoint(saved, fallback) {
  return {
    x: Number.isFinite(Number(saved?.x)) ? Number(saved.x) : fallback.x,
    y: Number.isFinite(Number(saved?.y)) ? Number(saved.y) : fallback.y
  };
}

export function mergePublicSupportLayout(saved) {
  const base = defaultPublicSupportLayout();
  if (!saved || typeof saved !== 'object') return base;
  const positions = { ...base.positions };
  for (const key of PUBLIC_SUPPORT_LAYOUT_KEYS) {
    const next = mergeSupportPoint(saved.positions?.[key] || saved[key], base.positions[key]);
    positions[key] = looksBrokenPosition(next) ? { ...base.positions[key] } : next;
  }
  const sizes = { ...base.sizes };
  const incoming = saved.sizes && typeof saved.sizes === 'object' ? saved.sizes : {};
  for (const key of Object.keys(sizes)) {
    const n = Number(incoming[key]);
    if (Number.isFinite(n)) sizes[key] = n;
  }
  return { positions, sizes };
}

export function restoreJoinWelcomeCopy(copy, agencyName) {
  const org = String(agencyName || 'our team').trim() || 'our team';
  const c = copy && typeof copy === 'object' ? { ...copy } : {};
  if (!String(c.welcomeTitle || '').trim()) c.welcomeTitle = `Welcome to ${org}!`;
  if (!String(c.welcomeGlad || '').trim()) c.welcomeGlad = "We're so glad you're here.";
  if (!String(c.welcomeLead || '').trim()) {
    c.welcomeLead = `Let's find the right place to start. Choose the type of intake that works best for you with ${org}. You can always add more details later or reach out if you need help.`;
  }
  return c;
}

export function joinLandingCacheKey(slug, serviceType) {
  return `ajl-boot:${String(slug || '').toLowerCase()}:${String(serviceType || 'counseling').toLowerCase()}`;
}

export function readJoinLandingCache(slug, serviceType) {
  try {
    const raw = sessionStorage.getItem(joinLandingCacheKey(slug, serviceType));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeJoinLandingCache(slug, serviceType, payload) {
  if (!slug || !payload) return;
  try {
    sessionStorage.setItem(joinLandingCacheKey(slug, serviceType), JSON.stringify(payload));
  } catch {
    /* ignore quota / private mode */
  }
}

function mergeStartPoint(saved, fallback = { x: 0, y: 0 }) {
  const src = saved && typeof saved === 'object' ? saved : {};
  const x = Number(src.x);
  const y = Number(src.y);
  return {
    x: Number.isFinite(x) ? x : fallback.x,
    y: Number.isFinite(y) ? y : fallback.y
  };
}

export function defaultIntakeStartLayout() {
  return {
    x: 0,
    y: 8,
    width: 1080,
    welcome: { x: 0, y: 0 },
    glad: { x: 0, y: 0 },
    brand: { x: 0, y: 0 },
    logo: { x: 0, y: 0 },
    tagline: { x: 0, y: 0 },
    script: { x: 0, y: 0 },
    values: { x: 0, y: 0 },
    help: { x: 0, y: 0 },
    sizes: {
      welcome: 3.2,
      glad: 1.15,
      script: 1.9,
      tagline: 0.68,
      values: 0.84,
      logoWidth: 150,
      brandWidth: 0,
      helpWidth: 0
    },
    align: {
      welcome: 'center',
      glad: 'center',
      card: 'center',
      brand: 'left',
      logo: 'left',
      tagline: 'left',
      script: 'left',
      values: 'left',
      help: 'left'
    },
    hidden: {
      welcome: false,
      glad: false
    }
  };
}

export const DEFAULT_QUICK_SIDEBAR_STEPS = [
  { id: 'about', label: 'About You' },
  { id: 'needs', label: 'What support?' },
  { id: 'prefs', label: 'Preferences' },
  { id: 'providers', label: 'Provider preview' },
  { id: 'consent', label: 'Authorization' },
  { id: 'review', label: 'Review & Submit' }
];

export function mergeQuickSidebarSteps(saved) {
  const base = DEFAULT_QUICK_SIDEBAR_STEPS.map((step) => ({ ...step }));
  let list = Array.isArray(saved) ? saved.filter((step) => step && typeof step === 'object') : [];
  if (list.length === 7 && (list[0]?.id === 'who' || String(list[0]?.label || '').toLowerCase().includes('who'))) {
    list = [{ id: 'about', label: String(list[1]?.label || 'About You').trim() || 'About You' }, ...list.slice(2)];
  }
  if (!list.length) return base;
  return base.map((step, i) => {
    const src = list[i] && typeof list[i] === 'object' ? list[i] : {};
    const label = String(src.label || '').trim();
    return { ...step, label: label || step.label };
  });
}

function mergeStartSizes(saved, base) {
  const src = saved && typeof saved === 'object' ? saved : {};
  const out = { ...base };
  for (const key of Object.keys(base)) {
    const n = Number(src[key]);
    if (Number.isFinite(n)) out[key] = n;
  }
  out.welcome = Math.min(7, Math.max(0.8, out.welcome));
  out.glad = Math.min(3, Math.max(0.7, out.glad));
  out.script = Math.min(4, Math.max(0.8, out.script));
  out.tagline = Math.min(1.4, Math.max(0.5, out.tagline || 0.68));
  out.values = Math.min(1.4, Math.max(0.65, out.values || 0.84));
  out.logoWidth = Math.min(360, Math.max(48, out.logoWidth));
  return out;
}

function mergeStartAlign(saved, base) {
  const src = saved && typeof saved === 'object' ? saved : {};
  const out = { ...base };
  for (const key of Object.keys(base)) {
    out[key] = normalizeAlign(src[key], base[key]);
  }
  return out;
}

export function mergeIntakeStartLayout(saved) {
  const base = defaultIntakeStartLayout();
  if (!saved || typeof saved !== 'object') return base;
  const width = Number(saved.width);
  const x = Number(saved.x) || 0;
  const y = Number.isFinite(Number(saved.y)) ? Number(saved.y) : base.y;
  const broken = looksBrokenPosition({ x, y });
  return {
    x: broken ? base.x : x,
    y: broken ? base.y : y,
    width: Number.isFinite(width)
      ? Math.min(1200, Math.max(420, width === 860 ? base.width : width))
      : base.width,
    welcome: looksBrokenPosition(saved.welcome) ? { ...base.welcome } : mergeStartPoint(saved.welcome, base.welcome),
    glad: looksBrokenPosition(saved.glad) ? { ...base.glad } : mergeStartPoint(saved.glad, base.glad),
    brand: looksBrokenPosition(saved.brand) ? { ...base.brand } : mergeStartPoint(saved.brand, base.brand),
    logo: looksBrokenPosition(saved.logo) ? { ...base.logo } : mergeStartPoint(saved.logo, base.logo),
    tagline: looksBrokenPosition(saved.tagline) ? { ...base.tagline } : mergeStartPoint(saved.tagline, base.tagline),
    script: looksBrokenPosition(saved.script) ? { ...base.script } : mergeStartPoint(saved.script, base.script),
    values: looksBrokenPosition(saved.values) ? { ...base.values } : mergeStartPoint(saved.values, base.values),
    help: looksBrokenPosition(saved.help) ? { ...base.help } : mergeStartPoint(saved.help, base.help),
    sizes: mergeStartSizes(saved.sizes, base.sizes),
    align: mergeStartAlign(saved.align, base.align),
    hidden: {
      welcome: saved.hidden?.welcome === true,
      glad: saved.hidden?.glad === true
    }
  };
}

export const OFFICE_START_COPY_EN = {
  sidebarTagline: 'HEAL • GROW • THRIVE',
  sidebarScript: "You're Not Alone.",
  value1: 'Supportive & Welcoming',
  value2: 'Personalized to Your Needs',
  value3: 'Focused on Growth & Well-Being',
  helpTitle: 'Need Help?',
  helpBody: "We're here for you.",
  sendMessage: 'Send Us a Message',
  startTitle: "Let's get your intake started",
  startLead: 'This secure intake packet helps our care team understand your needs and prepare the best support for you. You can save your progress anytime.'
};

export const OFFICE_START_COPY_ES = {
  sidebarTagline: 'SANAR • CRECER • PROSPERAR',
  sidebarScript: 'No está solo.',
  value1: 'Apoyo y bienvenida',
  value2: 'Personalizado a sus necesidades',
  value3: 'Enfocado en el crecimiento y el bienestar',
  helpTitle: '¿Necesita ayuda?',
  helpBody: 'Estamos aquí para usted.',
  sendMessage: 'Envíenos un mensaje',
  startTitle: 'Empecemos su admisión',
  startLead: 'Este paquete seguro de admisión ayuda a nuestro equipo a entender sus necesidades y preparar el mejor apoyo. Puede guardar su progreso en cualquier momento.'
};

const OFFICE_START_COPY_KEYS = Object.keys(OFFICE_START_COPY_EN);

export function localizeOfficeStartCopy(copy, locale) {
  const src = copy && typeof copy === 'object' ? copy : {};
  if (String(locale || '').toLowerCase().startsWith('es')) {
    const out = { ...src };
    for (const key of OFFICE_START_COPY_KEYS) {
      const current = String(src[key] || '').trim();
      if (!current || current === OFFICE_START_COPY_EN[key]) {
        out[key] = OFFICE_START_COPY_ES[key];
      }
    }
    return out;
  }
  return src;
}

export function mergeJoinLayout(saved) {
  const base = defaultJoinLayout();
  if (!saved || typeof saved !== 'object') return base;
  const hiddenSrc = saved.hidden && typeof saved.hidden === 'object' ? saved.hidden : {};
  const savedPos = saved.positions && typeof saved.positions === 'object' ? saved.positions : {};
  const brandPos = { ...base.positions.brand, ...(savedPos.brand || {}) };
  const hasSplitRail = ['logo', 'tagline', 'script', 'values'].some(
    (key) => savedPos[key] && typeof savedPos[key] === 'object'
  );
  const inheritedRail = hasSplitRail ? { x: 0, y: 0 } : brandPos;
  const sizes = { ...base.sizes, ...(saved.sizes || {}) };
  const logoWidth = Number(sizes.logoWidth);
  const tagline = Number(sizes.tagline);
  const script = Number(sizes.script);
  const values = Number(sizes.values);
  sizes.logoWidth = Number.isFinite(logoWidth) ? Math.min(360, Math.max(48, logoWidth)) : base.sizes.logoWidth;
  sizes.tagline = Number.isFinite(tagline) ? Math.min(1.4, Math.max(0.5, tagline)) : base.sizes.tagline;
  sizes.script = Number.isFinite(script) ? Math.min(4, Math.max(0.8, script)) : base.sizes.script;
  sizes.values = Number.isFinite(values) ? Math.min(1.4, Math.max(0.65, values)) : base.sizes.values;
  return {
    footerStyle: saved.footerStyle === 'frost' || !saved.footerStyle
      ? 'hidden'
      : ['hidden', 'white', 'clear', 'dark'].includes(saved.footerStyle)
        ? saved.footerStyle
        : base.footerStyle,
    showSidebar: saved.showSidebar !== false,
    fonts: { ...base.fonts, ...(saved.fonts || {}) },
    sizes,
    align: mergeStartAlign(saved.align, base.align),
    hidden: {
      welcome: hiddenSrc.welcome === true,
      glad: hiddenSrc.glad === true,
      lead: hiddenSrc.lead === true
    },
    positions: sanitizeJoinPositions(
      {
        ...Object.fromEntries(
          Object.keys(base.positions).map((key) => [
            key,
            { ...base.positions[key], ...(savedPos[key] || {}) }
          ])
        ),
        brand: brandPos,
        logo: savedPos.logo || inheritedRail,
        tagline: savedPos.tagline || inheritedRail,
        script: savedPos.script || inheritedRail,
        values: savedPos.values || inheritedRail
      },
      base.positions
    )
  };
}
