/**
 * Sanitize structured hiring job description sections.
 * Plain text + bullet arrays only (no HTML).
 */

const compactText = (value, max = 4000) => {
  const text = String(value ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return '';
  return text.length > max ? text.slice(0, max) : text;
};

const normalizeBullets = (items, maxItems = 12, maxLen = 400) => {
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
    aboutTheRole: compactText(raw.aboutTheRole || raw.about_the_role || '', 4000),
    responsibilities: normalizeBullets(raw.responsibilities, 12, 400),
    qualifications: normalizeBullets(raw.qualifications, 12, 400),
    benefits: normalizeBullets(raw.benefits, 12, 400)
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
