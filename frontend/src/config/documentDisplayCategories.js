/**
 * Employee-facing document hub categories (My Documents).
 * Admins override via employee_display_category; otherwise infer from type, title, and source.
 */

/** @typedef {{ accent: string, icon: string, iconBg: string, tagBg: string, tagColor: string, tagMutedBg: string, tagMutedColor: string }} CategoryTheme */

export const DOCUMENT_DISPLAY_CATEGORIES = [
  {
    id: 'onboarding',
    title: 'Onboarding',
    tag: 'All Providers',
    tagSecondary: 'New Hire',
    icon: 'folder',
    documentTypes: ['consent', 'disclosure', 'agreement', 'acknowledgment'],
    theme: {
      accent: '#16a34a',
      icon: '#15803d',
      iconBg: '#dcfce7',
      tagBg: '#ecfdf5',
      tagColor: '#166534',
      tagMutedBg: '#dbeafe',
      tagMutedColor: '#1d4ed8',
    },
  },
  {
    id: 'payroll_tax',
    title: 'Payroll & Tax',
    tag: 'All Providers',
    tagSecondary: 'Payroll / HR',
    icon: 'wallet',
    documentTypes: [],
    theme: {
      accent: '#0d9488',
      icon: '#0f766e',
      iconBg: '#ccfbf1',
      tagBg: '#f0fdfa',
      tagColor: '#115e59',
      tagMutedBg: '#e0f2fe',
      tagMutedColor: '#0369a1',
    },
  },
  {
    id: 'benefits',
    title: 'Benefits',
    tag: 'All Providers',
    tagSecondary: 'Enrollment',
    icon: 'heart',
    documentTypes: [],
    theme: {
      accent: '#2563eb',
      icon: '#1d4ed8',
      iconBg: '#dbeafe',
      tagBg: '#eff6ff',
      tagColor: '#1e40af',
      tagMutedBg: '#e0e7ff',
      tagMutedColor: '#4338ca',
    },
  },
  {
    id: 'policies',
    title: 'Policies & Handbook',
    tag: 'All Providers',
    tagSecondary: 'Policies',
    icon: 'book',
    documentTypes: ['administrative'],
    theme: {
      accent: '#4f46e5',
      icon: '#4338ca',
      iconBg: '#e0e7ff',
      tagBg: '#eef2ff',
      tagColor: '#3730a3',
      tagMutedBg: '#f1f5f9',
      tagMutedColor: '#475569',
    },
  },
  {
    id: 'licenses_credentials',
    title: 'Licenses & Credentials',
    tag: 'Per User',
    tagSecondary: 'Licenses / Certs',
    icon: 'award',
    documentTypes: [],
    theme: {
      accent: '#0891b2',
      icon: '#0e7490',
      iconBg: '#cffafe',
      tagBg: '#ecfeff',
      tagColor: '#155e75',
      tagMutedBg: '#e0f2fe',
      tagMutedColor: '#0369a1',
    },
  },
  {
    id: 'credentialing',
    title: 'Credentialing & Compliance',
    tag: 'Per User',
    tagSecondary: 'Regulatory',
    icon: 'shield',
    documentTypes: ['hipaa_security', 'compliance', 'authorization'],
    theme: {
      accent: '#d97706',
      icon: '#b45309',
      iconBg: '#fef3c7',
      tagBg: '#fffbeb',
      tagColor: '#92400e',
      tagMutedBg: '#ffedd5',
      tagMutedColor: '#c2410c',
    },
  },
  {
    id: 'safety',
    title: 'Safety & Workplace',
    tag: 'All Providers',
    tagSecondary: 'Safety',
    icon: 'hardhat',
    documentTypes: [],
    theme: {
      accent: '#ea580c',
      icon: '#c2410c',
      iconBg: '#ffedd5',
      tagBg: '#fff7ed',
      tagColor: '#9a3412',
      tagMutedBg: '#fef3c7',
      tagMutedColor: '#a16207',
    },
  },
  {
    id: 'training_ce',
    title: 'Training & CE',
    tag: 'All Providers',
    tagSecondary: 'Professional Dev',
    icon: 'graduation',
    documentTypes: ['school', 'school_roi'],
    theme: {
      accent: '#9333ea',
      icon: '#7e22ce',
      iconBg: '#f3e8ff',
      tagBg: '#faf5ff',
      tagColor: '#6b21a8',
      tagMutedBg: '#ede9fe',
      tagMutedColor: '#5b21b6',
    },
  },
  {
    id: 'client_participant',
    title: 'Client & Participant',
    tag: 'Per Case',
    tagSecondary: 'Consent / ROI',
    icon: 'users',
    documentTypes: ['audio_recording_consent'],
    theme: {
      accent: '#db2777',
      icon: '#be185d',
      iconBg: '#fce7f3',
      tagBg: '#fdf2f8',
      tagColor: '#9d174d',
      tagMutedBg: '#ffe4e6',
      tagMutedColor: '#be123c',
    },
  },
  {
    id: 'personal',
    title: 'Personal',
    tag: 'Per User',
    tagSecondary: 'HR / Profile',
    icon: 'user',
    documentTypes: [],
    theme: {
      accent: '#7c3aed',
      icon: '#6d28d9',
      iconBg: '#ede9fe',
      tagBg: '#f5f3ff',
      tagColor: '#5b21b6',
      tagMutedBg: '#faf5ff',
      tagMutedColor: '#7e22ce',
    },
  },
  {
    id: 'other',
    title: 'Other Documents',
    tag: 'General',
    tagSecondary: 'Uncategorized',
    icon: 'file',
    documentTypes: [],
    theme: {
      accent: '#64748b',
      icon: '#475569',
      iconBg: '#f1f5f9',
      tagBg: '#f8fafc',
      tagColor: '#334155',
      tagMutedBg: '#e2e8f0',
      tagMutedColor: '#475569',
    },
  },
];

/** Maps retired category ids from saved preferences / template overrides */
export const LEGACY_CATEGORY_ALIASES = {
  signatures: 'other',
  reviews: 'other',
  compliance: 'policies',
  professional: 'training_ce',
};

export const DEFAULT_DOCUMENT_CATEGORY_ORDER = DOCUMENT_DISPLAY_CATEGORIES.map((c) => c.id);

const BY_ID = Object.fromEntries(DOCUMENT_DISPLAY_CATEGORIES.map((c) => [c.id, c]));

const ALL_VALID_IDS = new Set(DOCUMENT_DISPLAY_CATEGORIES.map((c) => c.id));

export function normalizeLegacyCategoryId(id) {
  const s = String(id || '').trim();
  if (!s) return null;
  if (LEGACY_CATEGORY_ALIASES[s]) return LEGACY_CATEGORY_ALIASES[s];
  return s;
}

export function isValidCategoryId(id) {
  const normalized = normalizeLegacyCategoryId(id);
  return Boolean(normalized && ALL_VALID_IDS.has(normalized));
}

export function getDisplayCategoryMeta(categoryId) {
  const id = normalizeLegacyCategoryId(categoryId) || 'other';
  return BY_ID[id] || BY_ID.other;
}

/** CSS custom properties for a category section card */
export function getCategoryThemeStyle(categoryId) {
  const meta = getDisplayCategoryMeta(categoryId);
  const t = meta.theme || BY_ID.other.theme;
  return {
    '--cat-accent': t.accent,
    '--cat-icon': t.icon,
    '--cat-icon-bg': t.iconBg,
    '--cat-tag-bg': t.tagBg,
    '--cat-tag-color': t.tagColor,
    '--cat-tag-muted-bg': t.tagMutedBg,
    '--cat-tag-muted-color': t.tagMutedColor,
  };
}

export function resolveCategoryIdFromDocumentType(documentType, { userSpecific = false } = {}) {
  const type = String(documentType || '').toLowerCase();
  if (!type) {
    return userSpecific ? 'personal' : null;
  }
  for (const cat of DOCUMENT_DISPLAY_CATEGORIES) {
    if (cat.documentTypes?.includes(type)) return cat.id;
  }
  if (userSpecific) return null;
  return null;
}

const KEYWORD_RULES = [
  { id: 'payroll_tax', re: /\b(w-?9|direct deposit|i-?9|withholding|payroll|tax form|w4|w-?4)\b/i },
  { id: 'benefits', re: /\b(benefits?|401\s*k|health (plan|insurance)|dental|enrollment|cobra|fsa|hsa)\b/i },
  { id: 'policies', re: /\b(handbook|policy|code of conduct|acceptable use|employee agreement)\b/i },
  {
    id: 'licenses_credentials',
    re: /\b(license|credential|malpractice|liability insurance|npi|cpr|certification|tb test|background check)\b/i,
  },
  { id: 'safety', re: /\b(osha|workplace safety|injury report|safety training|hazard)\b/i },
  { id: 'training_ce', re: /\b(training|continuing education|\bce\b|competency|ceu|in-service)\b/i },
  {
    id: 'client_participant',
    re: /\b(intake|client consent|patient consent|participant|release of information|\broi\b|recording consent)\b/i,
  },
  { id: 'onboarding', re: /\b(onboard(ing)?|new hire|orientation|welcome packet)\b/i },
];

export function resolveCategoryIdFromContext(task) {
  const title = String(task?.title || '');
  const meta = task?.metadata && typeof task.metadata === 'object' ? task.metadata : {};
  const source = [
    task?.task_list_name,
    meta.moduleName,
    meta.trainingFocusName,
    meta.source,
  ]
    .filter(Boolean)
    .join(' ');
  const blob = `${title} ${source}`;
  if (!blob.trim()) return null;

  for (const { id, re } of KEYWORD_RULES) {
    if (re.test(blob)) return id;
  }

  if (/school|roi|module/i.test(blob)) return 'training_ce';
  if (/credential|compliance|hipaa/i.test(blob)) return 'credentialing';

  return null;
}

export function resolveCategoryIdForTask(task) {
  const explicit =
    task?.employee_display_category ||
    task?.metadata?.displayCategory ||
    task?.metadata?.display_category;
  if (explicit) {
    const normalized = normalizeLegacyCategoryId(explicit);
    if (normalized && ALL_VALID_IDS.has(normalized)) return normalized;
  }

  const docType = task?.metadata?.documentType || task?.metadata?.document_type || task?.document_type;
  const userSpecific = Boolean(task?.is_user_specific || task?.metadata?.userSpecific);

  const fromContext = resolveCategoryIdFromContext(task);
  if (fromContext) return fromContext;

  const fromType = resolveCategoryIdFromDocumentType(docType, { userSpecific: false });
  if (fromType) return fromType;

  if (userSpecific) {
    const cred = KEYWORD_RULES.find((r) => r.id === 'licenses_credentials');
    if (cred?.re.test(String(task?.title || ''))) return 'licenses_credentials';
    return 'personal';
  }

  return 'other';
}

export function sanitizeCategoryOrder(order) {
  const fallback = [...DEFAULT_DOCUMENT_CATEGORY_ORDER];
  if (!Array.isArray(order)) return fallback;
  const seen = new Set();
  const merged = [];
  for (const raw of order) {
    const id = normalizeLegacyCategoryId(raw);
    if (typeof id === 'string' && ALL_VALID_IDS.has(id) && !seen.has(id)) {
      merged.push(id);
      seen.add(id);
    }
  }
  for (const id of fallback) {
    if (!seen.has(id)) merged.push(id);
  }
  return merged;
}

/** Admin template editor: override hub section (empty = infer automatically). */
export const EMPLOYEE_DISPLAY_CATEGORY_OPTIONS = [
  { value: '', label: 'Automatic (from document type & context)' },
  ...DOCUMENT_DISPLAY_CATEGORIES.map((c) => ({ value: c.id, label: c.title })),
];
