/**
 * Static catalog for Tools & Aids hub + top-nav Tools mega-menu.
 * Games stay dynamic from the activity registry; assessments and AI tools are listed here.
 *
 * Clinical vs Non-Clinical:
 * - clinical — counseling / therapy / family systems oriented
 * - non_clinical — lifestyle, performance, coaching, or workplace aids
 */

export const TOOLS_TABS = [
  { id: 'assessments', label: 'Assessments & Evaluations' },
  { id: 'games', label: 'Games and Activities' },
  { id: 'ai', label: 'AI Tools' }
];

export const TOOLS_CATEGORIES = [
  {
    id: 'games',
    label: 'Games and Activities',
    tab: 'games',
    description: 'Interactive games and session activities for practice and counseling.'
  },
  {
    id: 'assessments',
    label: 'Assessments & Evaluations',
    tab: 'assessments',
    description: 'Guest and assigned assessments for discovery and progress tracking.'
  },
  {
    id: 'ai',
    label: 'AI Tools',
    tab: 'ai',
    description: 'Documentation and coaching aids powered by AI.'
  }
];

/**
 * @typedef {'clinical' | 'non_clinical'} ClinicalKind
 * @typedef {'client_token' | 'public_link'} AssignMode
 *
 * @typedef {Object} AssessmentTool
 * @property {string} id
 * @property {string} path - Guest route path (e.g. /life-balance)
 * @property {string} title
 * @property {string} [littleName] - Short subtitle / tagline
 * @property {string} description
 * @property {ClinicalKind} clinicalKind
 * @property {string} durationEstimate
 * @property {string} population
 * @property {AssignMode} assignMode
 * @property {string[]} [tags]
 */

/** @type {AssessmentTool[]} */
export const ASSESSMENT_TOOLS = [
  {
    id: 'life-balance',
    path: '/life-balance',
    title: 'Life Balance',
    littleName: 'Wheel of life check-in',
    description: 'Wheel-of-life style check-in across key life domains.',
    clinicalKind: 'non_clinical',
    durationEstimate: '10–15 min',
    population: 'Adults',
    assignMode: 'client_token',
    tags: ['Life coaching', 'Discovery']
  },
  {
    id: 'values-alignment',
    path: '/values-alignment',
    title: 'Values Alignment',
    littleName: 'Values & daily choices',
    description: 'Clarify personal values and how daily choices line up with them.',
    clinicalKind: 'clinical',
    durationEstimate: '12–18 min',
    population: 'Adults',
    assignMode: 'client_token',
    tags: ['Values', 'Insight']
  },
  {
    id: 'teen-wellbeing',
    path: '/teen-wellbeing',
    title: 'Teen Well-Being',
    littleName: 'Adolescent check-in',
    description: 'Well-being check-in designed for adolescents.',
    clinicalKind: 'clinical',
    durationEstimate: '10–15 min',
    population: 'Teens',
    assignMode: 'client_token',
    tags: ['Youth', 'Well-being']
  },
  {
    id: 'personal-fulfillment',
    path: '/personal-fulfillment',
    title: 'Personal Fulfillment',
    littleName: 'Meaning & growth',
    description: 'Explore meaning, satisfaction, and growth across life areas.',
    clinicalKind: 'non_clinical',
    durationEstimate: '12–18 min',
    population: 'Adults',
    assignMode: 'client_token',
    tags: ['Lifestyle', 'Growth']
  },
  {
    id: 'digital-wellness',
    path: '/digital-wellness',
    title: 'Digital Wellness',
    littleName: 'Healthy tech habits',
    description: 'Screen time, attention, and healthy tech habits assessment.',
    clinicalKind: 'non_clinical',
    durationEstimate: '8–12 min',
    population: 'Teens & Adults',
    assignMode: 'client_token',
    tags: ['Lifestyle', 'Tech']
  },
  {
    id: 'mens-life',
    path: '/mens-life',
    title: "Men's Life",
    littleName: 'Identity & well-being',
    description: 'Life domains, identity, and well-being framed for men.',
    clinicalKind: 'non_clinical',
    durationEstimate: '12–18 min',
    population: 'Men',
    assignMode: 'client_token',
    tags: ['Lifestyle', 'Identity']
  },
  {
    id: 'marriage-alignment',
    path: '/marriage-alignment',
    title: 'Marriage Alignment',
    littleName: 'Partnership snapshot',
    description: 'Partnership strengths, friction points, and shared direction.',
    clinicalKind: 'clinical',
    durationEstimate: '15–20 min',
    population: 'Couples',
    assignMode: 'client_token',
    tags: ['Couples', 'Relationships']
  },
  {
    id: 'parenting-confidence',
    path: '/parenting-confidence',
    title: 'Parenting Confidence',
    littleName: 'Skills & consistency',
    description: 'Parenting skills, consistency, and confidence check-in.',
    clinicalKind: 'clinical',
    durationEstimate: '12–18 min',
    population: 'Parents',
    assignMode: 'client_token',
    tags: ['Family', 'Parenting']
  },
  {
    id: 'burden-purpose',
    path: '/burden-purpose',
    title: 'Burden & Purpose',
    littleName: 'Load vs meaning',
    description: 'Balance between load, meaning, and sense of purpose.',
    clinicalKind: 'clinical',
    durationEstimate: '12–18 min',
    population: 'Adults',
    assignMode: 'client_token',
    tags: ['Insight', 'Meaning']
  },
  {
    id: 'family-functioning',
    path: '/family-functioning',
    title: 'Family Functioning',
    littleName: 'Roles & communication',
    description: 'Family roles, communication, and household functioning.',
    clinicalKind: 'clinical',
    durationEstimate: '15–20 min',
    population: 'Families',
    assignMode: 'client_token',
    tags: ['Family', 'Systems']
  },
  {
    id: 'savage-blueprint',
    path: '/savage-blueprint',
    title: 'Savage Blueprint',
    littleName: 'Performance identity',
    description: 'High-performance identity and habit blueprint assessment.',
    clinicalKind: 'non_clinical',
    durationEstimate: '15–20 min',
    population: 'Adults',
    assignMode: 'client_token',
    tags: ['Performance', 'Habits']
  },
  {
    id: 'reward-regulation',
    path: '/reward-regulation',
    title: 'Reward Regulation',
    littleName: 'Impulse & regulation',
    description: 'Impulse, reward patterns, and self-regulation insight.',
    clinicalKind: 'clinical',
    durationEstimate: '12–18 min',
    population: 'Adults',
    assignMode: 'client_token',
    tags: ['Behavioral', 'Regulation']
  },
  {
    id: 'athlete-readiness',
    path: '/athlete-readiness',
    title: 'Athlete Readiness',
    littleName: 'Mental game ready',
    description: 'Mental and lifestyle readiness for athletic performance.',
    clinicalKind: 'non_clinical',
    durationEstimate: '10–15 min',
    population: 'Athletes',
    assignMode: 'client_token',
    tags: ['Performance', 'Sports']
  },
  {
    id: 'student-success',
    path: '/student-success',
    title: 'Student Success',
    littleName: 'Study & focus',
    description: 'Study habits, focus, and school-life balance check-in.',
    clinicalKind: 'non_clinical',
    durationEstimate: '10–15 min',
    population: 'Students',
    assignMode: 'client_token',
    tags: ['Education', 'Habits']
  },
  {
    id: 'college-readiness',
    path: '/college-readiness',
    title: 'College Readiness',
    littleName: 'Campus preparedness',
    description: 'Preparedness for college academics, life, and independence.',
    clinicalKind: 'non_clinical',
    durationEstimate: '12–18 min',
    population: 'Students',
    assignMode: 'client_token',
    tags: ['Education', 'Transition']
  },
  {
    id: 'relationship-health',
    path: '/relationship-health',
    title: 'Relationship Health',
    littleName: 'Trust & connection',
    description: 'Communication, trust, and relationship well-being snapshot.',
    clinicalKind: 'clinical',
    durationEstimate: '12–18 min',
    population: 'Adults & Couples',
    assignMode: 'client_token',
    tags: ['Relationships', 'Insight']
  }
];

/**
 * @typedef {Object} AiTool
 * @property {string} id
 * @property {string} title
 * @property {string} [littleName]
 * @property {string} description
 * @property {ClinicalKind} clinicalKind
 * @property {'live' | 'coming_soon' | 'workspace'} status
 * @property {string|null} routePath - Admin route path, or null if launcher-only
 * @property {boolean} showInNavFlyout
 * @property {string[]} [tags]
 */

/** @type {AiTool[]} */
export const AI_TOOLS = [
  {
    id: 'note-aid',
    title: 'Note Aid',
    littleName: 'Clinical documentation',
    description: 'Generate structured clinical notes from text or audio and keep a short Active / Archived shelf.',
    clinicalKind: 'clinical',
    status: 'live',
    routePath: '/admin/note-aid',
    showInNavFlyout: true,
    tags: ['Documentation', 'AI']
  },
  {
    id: 'clinical-coach',
    title: 'Clinical Coach',
    littleName: 'Guidance workflows',
    description: 'Coaching workflows and clinical guidance (planned).',
    clinicalKind: 'clinical',
    status: 'coming_soon',
    routePath: null,
    showInNavFlyout: true,
    tags: ['Guidance', 'AI']
  },
  {
    id: 'ask-assistant',
    title: 'Ask Assistant',
    littleName: 'Portal helper',
    description: 'Workspace assistant for navigation, quick answers, and portal help.',
    clinicalKind: 'non_clinical',
    status: 'workspace',
    routePath: null,
    showInNavFlyout: false,
    tags: ['Workspace', 'Assistant']
  },
  {
    id: 'momentum',
    title: 'Momentum',
    littleName: 'Sticky capture',
    description: 'Sticky notes and lightweight workspace capture for session follow-ups.',
    clinicalKind: 'non_clinical',
    status: 'workspace',
    routePath: null,
    showInNavFlyout: false,
    tags: ['Workspace', 'Notes']
  }
];

export const CLINICAL_KIND_LABELS = {
  clinical: 'Clinical',
  non_clinical: 'Non-Clinical'
};

export function getAssessmentById(id) {
  return ASSESSMENT_TOOLS.find((a) => a.id === id) || null;
}

export function getAiToolById(id) {
  return AI_TOOLS.find((t) => t.id === id) || null;
}

export function getAiToolsForNav() {
  return AI_TOOLS.filter((t) => t.showInNavFlyout);
}

/**
 * Build a public/guest assessment URL.
 * @param {string} origin - window.location.origin
 * @param {string} path - guest path like /life-balance
 * @param {string} [orgSlug]
 */
export function getAssessmentPublicUrl(origin, path, orgSlug = '') {
  const base = String(origin || '').replace(/\/$/, '');
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  const slug = String(orgSlug || '').trim();
  if (slug) return `${base}/${slug}${cleanPath}`;
  return `${base}${cleanPath}`;
}

/** Build assigned token URL (branded or short). */
export function getAssessmentTokenUrl(origin, path, accessToken, orgSlug = '') {
  const base = String(origin || '').replace(/\/$/, '');
  const cleanPath = String(path || '').replace(/^\//, '');
  const token = String(accessToken || '').trim();
  const slug = String(orgSlug || '').trim();
  if (!token) return getAssessmentPublicUrl(origin, '/' + cleanPath, orgSlug);
  if (slug) return `${base}/${slug}/${cleanPath}/${encodeURIComponent(token)}`;
  return `${base}/${cleanPath}/${encodeURIComponent(token)}`;
}

export function assessmentFamilyKey(catalogId) {
  return String(catalogId || '').trim().replace(/-/g, '_');
}

/**
 * Tools & Aids hub path with optional tab query.
 * @param {string} [tab]
 * @param {(path: string) => string} [orgTo] - org path prefixer
 */
export function toolsAidsHubPath(tab, orgTo = (p) => p) {
  const base = orgTo('/admin/tools-aids');
  const t = parseToolsTab(tab);
  if (t === 'assessments') return base;
  return `${base}?tab=${encodeURIComponent(t)}`;
}

/**
 * Router location object for the Tools & Aids hub (avoids string-query pitfalls).
 * @param {string} [tab]
 * @param {(path: string) => string} [orgTo]
 */
export function toolsAidsHubLocation(tab, orgTo = (p) => p) {
  const path = orgTo('/admin/tools-aids');
  const t = parseToolsTab(tab);
  if (t === 'assessments') return { path };
  return { path, query: { tab: t } };
}

export function parseToolsTab(queryTab) {
  const raw = Array.isArray(queryTab) ? queryTab[0] : queryTab;
  const t = String(raw || '').trim().toLowerCase();
  // Ignore dashboard rail tabs (e.g. tools_aids) when this parser is reused.
  if (t === 'games' || t === 'ai' || t === 'assessments') return t;
  return 'assessments';
}

export function clinicalKindLabel(kind) {
  return CLINICAL_KIND_LABELS[kind] || kind || '';
}

export function uniqueAssessmentPopulations() {
  const set = new Set(ASSESSMENT_TOOLS.map((a) => a.population).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

const FAVORITES_PREFIX = 'tools-aids-favorites:';

export function favoritesStorageKey(userId) {
  return `${FAVORITES_PREFIX}${userId || 'anon'}`;
}

export function loadFavoriteIds(userId) {
  try {
    const raw = localStorage.getItem(favoritesStorageKey(userId));
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr.map(String) : []);
  } catch {
    return new Set();
  }
}

export function saveFavoriteIds(userId, ids) {
  try {
    localStorage.setItem(favoritesStorageKey(userId), JSON.stringify([...ids]));
  } catch {
    // ignore quota / private mode
  }
}
