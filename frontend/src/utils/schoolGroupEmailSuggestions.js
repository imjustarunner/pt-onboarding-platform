const STOP_WORDS = new Set([
  'school',
  'schools',
  'of',
  'the',
  'and',
  '&',
  'k12',
  'k-12',
  'charter',
  'district',
  'center',
  'centre'
]);

const LEVEL_WORDS = new Set([
  'elementary',
  'middle',
  'high',
  'junior',
  'senior',
  'academy',
  'prep',
  'preparatory',
  'intermediate'
]);

export function tokenizeSchoolName(name) {
  return String(name || '')
    .replace(/[''`]/g, '')
    .split(/[\s\-–—/]+/)
    .map((word) => word.replace(/[^a-zA-Z0-9]/g, ''))
    .filter(Boolean);
}

function contentTokens(tokens) {
  return tokens.filter((token) => !STOP_WORDS.has(token.toLowerCase()));
}

function normalizePrefix(prefix) {
  return String(prefix || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export function resolveSchoolGroupEmailDomain(agency = {}) {
  const slug = String(agency.slug || agency.portalUrl || agency.portal_url || 'itsco')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  return slug ? `${slug}.health` : 'itsco.health';
}

export function resolveSchoolOnboardingSupportEmail(agency = {}) {
  const slug = String(agency.slug || agency.portalUrl || agency.portal_url || 'itsco')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '');
  if (slug) return `support@${slug}.health`;
  return agency.supportEmail || agency.onboarding_team_email || null;
}

export function buildSchoolGroupEmail(prefix, domain) {
  const local = normalizePrefix(prefix);
  const host = String(domain || '')
    .toLowerCase()
    .replace(/^@/, '');
  if (!local || !host) return '';
  return `${local}@${host}`;
}

export function parseSchoolGroupEmailLocal(email, domain) {
  const value = String(email || '').trim().toLowerCase();
  const host = String(domain || '')
    .toLowerCase()
    .replace(/^@/, '');
  if (!value) return '';
  if (!value.includes('@')) return normalizePrefix(value);
  const [local, emailDomain] = value.split('@');
  if (emailDomain === host) return normalizePrefix(local);
  return value;
}

/**
 * Suggest local-part prefixes for a school group email based on the school name.
 * Examples:
 * - Rudy Elementary School -> rudy
 * - Cheyenne Mountain Middle School -> cms
 * - Riverdale High School -> riverdale, rh, rhs
 */
export function suggestSchoolGroupEmailPrefixes(schoolName) {
  const tokens = tokenizeSchoolName(schoolName);
  const content = contentTokens(tokens);
  if (!content.length) return [];

  const suggestions = [];
  const add = (prefix, reason, priority) => {
    const normalized = normalizePrefix(prefix);
    if (!normalized || normalized.length < 2) return;
    if (suggestions.some((item) => item.prefix === normalized)) return;
    suggestions.push({ prefix: normalized, reason, priority });
  };

  add(content[0], 'Based on your school name', 1);

  if (content.length >= 2) {
    add(
      content.map((token) => token[0]).join(''),
      'Initials of each word in your school name',
      2
    );
  }

  const levelIndex = tokens.findIndex((token) => LEVEL_WORDS.has(token.toLowerCase()));
  const hasSchoolSuffix = tokens[tokens.length - 1]?.toLowerCase() === 'school';

  if (levelIndex >= 0) {
    const beforeLevel = contentTokens(tokens.slice(0, levelIndex));
    const levelInitial = tokens[levelIndex][0].toLowerCase();
    if (beforeLevel.length === 1) {
      add(beforeLevel[0][0] + levelInitial, 'School name + level', 3);
      if (hasSchoolSuffix) {
        add(beforeLevel[0][0] + levelInitial + 's', 'Common acronym for your school', 4);
      }
    } else if (hasSchoolSuffix && beforeLevel.length >= 2) {
      add(
        `${beforeLevel.map((token) => token[0]).join('')}s`,
        'Common acronym for your school',
        4
      );
    }
  }

  return suggestions.sort((a, b) => a.priority - b.priority || a.prefix.length - b.prefix.length);
}

export function suggestSchoolGroupEmails(schoolName, domain) {
  return suggestSchoolGroupEmailPrefixes(schoolName).map(({ prefix, reason }) => ({
    email: buildSchoolGroupEmail(prefix, domain),
    reason
  }));
}
