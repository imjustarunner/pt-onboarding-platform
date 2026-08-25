/**
 * Sanitize structured hiring job description sections.
 * Plain text + bullet arrays only (no HTML).
 */

export const JOB_DESCRIPTION_ABOUT_MAX = 8000;
export const JOB_DESCRIPTION_BULLET_MAX = 40;
export const JOB_DESCRIPTION_BULLET_LEN_MAX = 800;

const compactText = (value, max = JOB_DESCRIPTION_ABOUT_MAX) => {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
};

const normalizeBullets = (
  items,
  maxItems = JOB_DESCRIPTION_BULLET_MAX,
  maxLen = JOB_DESCRIPTION_BULLET_LEN_MAX
) => {
  if (!Array.isArray(items)) {
    // Allow paste as newline-separated string
    if (typeof items === 'string') {
      items = items.split('\n');
    } else {
      return [];
    }
  }
  return items
    .map((b) => compactText(String(b || '').replace(/^[\s•\-\*]+/, ''), maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
};

export function blankJobDescriptionSections() {
  return {
    aboutTheRole: '',
    responsibilities: [],
    qualifications: [],
    benefits: []
  };
}

export function sanitizeJobDescriptionSections(raw) {
  if (raw === undefined) return undefined;
  if (raw === null) return null;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const out = {
    aboutTheRole: compactText(raw.aboutTheRole || raw.about_the_role || '', JOB_DESCRIPTION_ABOUT_MAX),
    responsibilities: normalizeBullets(raw.responsibilities),
    qualifications: normalizeBullets(raw.qualifications),
    benefits: normalizeBullets(raw.benefits)
  };

  const hasContent =
    !!out.aboutTheRole ||
    out.responsibilities.length > 0 ||
    out.qualifications.length > 0 ||
    out.benefits.length > 0;

  return hasContent ? out : null;
}

export function parseJobDescriptionSections(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return sanitizeJobDescriptionSections(raw);
  }
  if (typeof raw === 'string') {
    try {
      return sanitizeJobDescriptionSections(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  return null;
}

export function jobDescriptionSectionsHaveContent(sections) {
  const s = sanitizeJobDescriptionSections(sections);
  return !!s;
}
