/**
 * Sanitize structured hiring job description sections.
 * Plain text + bullet arrays only (no HTML).
 *
 * Canonical responsibilities shape:
 *   responsibilitySets: [{ title, items: string[] }]
 * Flat `responsibilities: string[]` is still written for older readers.
 */

export const JOB_DESCRIPTION_ABOUT_MAX = 8000;
export const JOB_DESCRIPTION_BULLET_MAX = 40;
export const JOB_DESCRIPTION_BULLET_LEN_MAX = 800;
export const JOB_DESCRIPTION_SET_MAX = 12;
export const JOB_DESCRIPTION_SET_TITLE_MAX = 160;
export const JOB_DESCRIPTION_SET_BULLET_MAX = 40;

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

const looksLikeSet = (value) =>
  !!(value && typeof value === 'object' && !Array.isArray(value)
    && (value.title != null || value.name != null || value.items != null || value.bullets != null
      || value.responsibilities != null));

export function normalizeResponsibilitySets(raw) {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  let input = [];
  if (Array.isArray(source.responsibilitySets) && source.responsibilitySets.length) {
    input = source.responsibilitySets;
  } else if (Array.isArray(source.responsibilities) && source.responsibilities.length) {
    if (source.responsibilities.some(looksLikeSet)) {
      input = source.responsibilities;
    } else {
      input = [{ title: '', items: source.responsibilities }];
    }
  }

  const out = [];
  for (const set of input) {
    if (out.length >= JOB_DESCRIPTION_SET_MAX) break;
    if (typeof set === 'string') {
      const item = compactText(set.replace(/^[\s•\-\*]+/, ''), JOB_DESCRIPTION_BULLET_LEN_MAX);
      if (!item) continue;
      const last = out[out.length - 1];
      if (last && !last.title) {
        if (last.items.length < JOB_DESCRIPTION_SET_BULLET_MAX) last.items.push(item);
      } else {
        out.push({ title: '', items: [item] });
      }
      continue;
    }
    if (!looksLikeSet(set)) continue;
    const title = compactText(set.title || set.name || '', JOB_DESCRIPTION_SET_TITLE_MAX);
    const items = normalizeBullets(
      set.items || set.bullets || set.responsibilities || [],
      JOB_DESCRIPTION_SET_BULLET_MAX
    );
    if (!title && !items.length) continue;
    out.push({ title, items });
  }
  return out;
}

export function flattenResponsibilityItems(sets) {
  const list = Array.isArray(sets) ? sets : [];
  const out = [];
  for (const set of list) {
    const title = compactText(set?.title || '', JOB_DESCRIPTION_SET_TITLE_MAX);
    const items = Array.isArray(set?.items) ? set.items : [];
    for (const item of items) {
      const bullet = compactText(item, JOB_DESCRIPTION_BULLET_LEN_MAX);
      if (!bullet) continue;
      out.push(title ? `${title}: ${bullet}` : bullet);
      if (out.length >= JOB_DESCRIPTION_BULLET_MAX * JOB_DESCRIPTION_SET_MAX) break;
    }
  }
  return out;
}

export function blankJobDescriptionSections() {
  return {
    aboutTheRole: '',
    responsibilitySets: [],
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

  const responsibilitySets = normalizeResponsibilitySets(raw);
  const out = {
    aboutTheRole: compactText(raw.aboutTheRole || raw.about_the_role || '', JOB_DESCRIPTION_ABOUT_MAX),
    responsibilitySets,
    responsibilities: flattenResponsibilityItems(responsibilitySets),
    qualifications: normalizeBullets(raw.qualifications),
    benefits: normalizeBullets(raw.benefits)
  };

  const hasContent =
    !!out.aboutTheRole
    || out.responsibilitySets.length > 0
    || out.responsibilities.length > 0
    || out.qualifications.length > 0
    || out.benefits.length > 0;

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
