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
 * `base` is the block's untranslated edge, `size` its length on that axis.
 */
export function clampOffsetValue({ value, base, size, min, max, pad = 8 }) {
  const lo = min + pad - base;
  const hi = max - pad - (base + size);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return value;
  if (hi < lo) return lo;
  return Math.min(hi, Math.max(lo, value));
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
      lead: 1,
      cardTitle: 1.45,
      cards: 1,
      cardsWidth: 860,
      cardsMinHeight: 0,
      brandWidth: 0,
      helpWidth: 0,
      logoWidth: 150,
      script: 2
    },
    align: {
      welcome: 'left',
      glad: 'left',
      lead: 'left',
      cards: 'left',
      brand: 'left',
      help: 'left'
    },
    positions: {
      welcome: { x: 0, y: 0 },
      glad: { x: 0, y: 0 },
      lead: { x: 0, y: 0 },
      cards: { x: 0, y: 0 },
      brand: { x: 0, y: 0 },
      help: { x: 0, y: 0 }
    }
  };
}

export function fontFamilyById(id) {
  return JOIN_FONT_OPTIONS.find((f) => f.id === id)?.family || '"Source Sans 3", sans-serif';
}

export const JOIN_BOOT_THEME_URL = '/assets/intake-themes/greenintakethemecounseling.jpg';

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
    width: 860,
    welcome: { x: 0, y: 0 },
    glad: { x: 0, y: 0 },
    brand: { x: 0, y: 0 },
    help: { x: 0, y: 0 },
    sizes: {
      welcome: 3.2,
      glad: 1.15,
      script: 1.9,
      logoWidth: 150,
      brandWidth: 0,
      helpWidth: 0
    },
    align: {
      welcome: 'center',
      glad: 'center',
      card: 'center',
      brand: 'left',
      help: 'left'
    }
  };
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
  return {
    x: Number(saved.x) || 0,
    y: Number.isFinite(Number(saved.y)) ? Number(saved.y) : base.y,
    width: Number.isFinite(width) ? Math.min(1200, Math.max(420, width)) : base.width,
    welcome: mergeStartPoint(saved.welcome, base.welcome),
    glad: mergeStartPoint(saved.glad, base.glad),
    brand: mergeStartPoint(saved.brand, base.brand),
    help: mergeStartPoint(saved.help, base.help),
    sizes: mergeStartSizes(saved.sizes, base.sizes),
    align: mergeStartAlign(saved.align, base.align)
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
  return {
    footerStyle: saved.footerStyle === 'frost' || !saved.footerStyle
      ? 'hidden'
      : ['hidden', 'white', 'clear', 'dark'].includes(saved.footerStyle)
        ? saved.footerStyle
        : base.footerStyle,
    showSidebar: saved.showSidebar !== false,
    fonts: { ...base.fonts, ...(saved.fonts || {}) },
    sizes: { ...base.sizes, ...(saved.sizes || {}) },
    align: mergeStartAlign(saved.align, base.align),
    positions: Object.fromEntries(
      Object.keys(base.positions).map((key) => [
        key,
        { ...base.positions[key], ...(saved.positions?.[key] || {}) }
      ])
    )
  };
}
