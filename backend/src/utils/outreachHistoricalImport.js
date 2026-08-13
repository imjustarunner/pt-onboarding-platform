import { normalizeOutreachName } from '../data/coloradoOutreachSchools.js';

const TITLE_RE =
  /\b(principal|assistant principal|\ba\.?p\.?\b|office manager|social worker|school social worker|school psych(?:ologist)?|psychologist|school counselor|counselor|dean of culture|mental health(?: person)?|dps mental health coordinator|coordinator|executive director)\b/i;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b/;

/** Spreadsheet school names we will not import (crossed out, missing from directory, or ambiguous). */
export const SKIP_IMPORT_SCHOOLS = new Set([
  'whittier elementary',
  'mckinley elementary',
  'mckinley thatcher elementary',
  'park hill academy',
  'palmer ece',
  'palmer ece 3 5yo',
  'palmer elementary',
  'palmer elementary ece only',
  'vive',
  'swigert international',
  'dora moore ece 8',
  'dora moore ece-8',
  'valverde elementary',
  'montebello middle school',
  'brown middle school',
  'montview middle school',
  'denver school of arts',
  'denver school of the arts',
  'schools to visit for 2026 2027 school year',
  'schools to visit for 2026-2027 school year'
]);

/**
 * Explicit DPS spreadsheet → directory name. Only aliases that are unique in the hub.
 * Do not add a mapping unless the spreadsheet name can only mean that one school.
 */
export const DPS_IMPORT_ALIASES = {
  'howell elementary': 'Howell Elementary School',
  'ashley elementary': 'Ashley Elementary School',
  'garden place academy': 'Garden Place Elementary School',
  'garden place elementary': 'Garden Place Elementary School',
  'green valley elementary': 'Green Valley Elementary School',
  'mcglone academy': 'McGlone Academy',
  'cole academy': 'Cole Arts and Science Academy',
  'lincoln elementary': 'Lincoln Elementary School',
  'john amesse': 'Amesse Elementary School',
  'amesse elementary': 'Amesse Elementary School',
  'montbello high school': 'Montbello High School',
  'hallet academy': 'Hallett Fundamental Academy',
  'hallett academy': 'Hallett Fundamental Academy',
  'denver east high school': 'East High School',
  'east high school': 'East High School',
  'manuel high school': 'Manual High School',
  'manual high school': 'Manual High School',
  'manuel middle school': 'McAuliffe Manual Middle School',
  'manual middle school': 'McAuliffe Manual Middle School',
  'wyatt academy': 'Wyatt Academy',
  'steele elementary': 'Steele Elementary School',
  'dsst cole': 'DSST: Cole Middle School',
  'polaris elementary': 'Polaris at Ebert Elementary School',
  'escuela valdez elementary': 'Valdez Elementary School',
  'valdez elementary': 'Valdez Elementary School',
  'montview high school': 'DSST: Montview High School',
  'odyssey school of denver': 'Odyssey School of Denver',
  'carson elementary': 'Carson Elementary School',
  'hill campus of arts science': 'Hill Campus of Arts and Sciences',
  'hill campus of arts and science': 'Hill Campus of Arts and Sciences',
  'hill campus of arts and sciences': 'Hill Campus of Arts and Sciences',
  'bear valley middle school': 'Bear Valley International School',
  'steck elementary': 'Steck Elementary School',
  'denver green southeast': 'Denver Green School Southeast',
  'lake middle school': 'Lake International School',
  'grant beacon middle school': 'Grant Beacon Middle School',
  'skinner middle school': 'Skinner Middle School',
  'sabin world elementary': 'Sabin World School',
  'sabin world school': 'Sabin World School'
};

export function importSchoolKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[()]/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseYesNo(value) {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v || v === 'false' || v === 'no' || v === 'n' || v === '0') return false;
  if (v === 'true' || v === 'yes' || v === 'y' || v === '1' || v === 'x' || v === '✓' || v === 'checked') return true;
  return false;
}

function titleFromEmailLocal(local) {
  return String(local || '')
    .split(/[._-]+/)
    .filter((p) => p && !/^\d+$/.test(p) && !/^apri$/i.test(p))
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

function extractTitle(text) {
  const m = String(text || '').match(TITLE_RE);
  if (!m) return null;
  const raw = m[0].replace(/\s+/g, ' ').trim();
  if (/^a\.?p\.?$/i.test(raw)) return 'Assistant Principal';
  if (/psych/i.test(raw)) return 'School Psychologist';
  if (/social worker/i.test(raw)) return 'Social Worker';
  if (/counselor/i.test(raw)) return 'School Counselor';
  if (/executive director/i.test(raw)) return 'Executive Director';
  if (/mental health/i.test(raw)) return 'Mental Health';
  return raw.replace(/\b\w/g, (c) => c.toUpperCase());
}

function cleanName(text) {
  let t = String(text || '')
    .replace(EMAIL_RE, ' ')
    .replace(PHONE_RE, ' ')
    .replace(/\bemail\s*:/ig, ' ')
    .replace(/\bphone(?:\s*ext)?\s*:/ig, ' ')
    .replace(TITLE_RE, ' ')
    .replace(/[-–—:,]/g, ' ')
    .replace(/\b(contacts?|location|this year is there on wed.*)$/i, ' ')
    .replace(/\?/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length < 2) return null;
  if (/^(brook|rosa)$/i.test(t)) {
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
  }
  const words = t.split(' ').filter(Boolean);
  if (words.length === 1 && words[0].length < 4) return null;
  if (/^(oversees|transferring|moving|from|kids|staff|try|get|services|started|new)$/i.test(words[0])) return null;
  return words
    .filter((w) => !/^(the|and|from|at|of)$/i.test(w))
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
    .trim() || null;
}

/**
 * Parse messy "POC & INFO" cells into { full_name, email, phone, title } rows.
 * Drops first-name-only guesses with no email (e.g. "Brook?").
 */
export function parsePocInfo(raw) {
  const text = String(raw || '').replace(/\r/g, '').trim();
  if (!text) return [];
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const contacts = [];

  const pushOrMerge = (partial) => {
    const email = partial.email ? String(partial.email).toLowerCase() : null;
    const phone = partial.phone || null;
    const title = partial.title || null;
    let fullName = partial.full_name || (email ? titleFromEmailLocal(email.split('@')[0]) : null);
    if (!fullName && !email) return;
    if (fullName && /^(Brook)$/i.test(fullName) && !email) return;

    const existing = email
      ? contacts.find((c) => c.email === email)
      : contacts.find((c) => c.full_name && fullName && c.full_name.toLowerCase() === fullName.toLowerCase());
    if (existing) {
      if (!existing.full_name && fullName) existing.full_name = fullName;
      if (!existing.email && email) existing.email = email;
      if (!existing.phone && phone) existing.phone = phone;
      if (!existing.title && title) existing.title = title;
      return;
    }
    contacts.push({
      full_name: fullName || titleFromEmailLocal((email || 'contact').split('@')[0]),
      email,
      phone,
      title
    });
  };

  for (const line of lines) {
    const emails = line.match(EMAIL_RE) || [];
    const phoneM = line.match(PHONE_RE);
    const phone = phoneM ? phoneM[0].replace(/\s+/g, '-') : null;
    const title = extractTitle(line);
    const name = cleanName(line);

    if (emails.length) {
      if (!name && contacts.length && !contacts[contacts.length - 1].email) {
        contacts[contacts.length - 1].email = String(emails[0]).toLowerCase();
        if (phone && !contacts[contacts.length - 1].phone) contacts[contacts.length - 1].phone = phone;
        if (title && !contacts[contacts.length - 1].title) contacts[contacts.length - 1].title = title;
        continue;
      }
      emails.forEach((em, i) => {
        pushOrMerge({
          full_name: i === 0 ? name : null,
          email: em,
          phone: i === 0 ? phone : null,
          title: i === 0 ? title : null
        });
      });
    } else if (name || title || phone) {
      pushOrMerge({ full_name: name, email: null, phone, title });
    }
  }

  return contacts.filter((c) => {
    if (!c.full_name) return false;
    if (c.email) return true;
    if (c.full_name.split(' ').length >= 2) return true;
    return Boolean(c.title);
  });
}

export function isConfidentSchoolNameMatch(directoryName, otherName) {
  const a = normalizeOutreachName(directoryName);
  const b = normalizeOutreachName(otherName);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.replace(/\s+/g, '') === b.replace(/\s+/g, '')) return true;
  const aParts = a.split(' ').filter(Boolean);
  const bParts = b.split(' ').filter(Boolean);
  const [longer, shorter] = aParts.length >= bParts.length ? [aParts, bParts] : [bParts, aParts];
  if (!shorter.length) return false;
  return shorter.every((p, i) => longer[i] === p) && shorter.length === longer.length;
}

/** Unique prefix: org "Cole" → Cole Arts, but not Lincoln → Abraham Lincoln High. */
export function isUniquePrefixSchoolMatch(school, orgName, siblingSchools = []) {
  if (isConfidentSchoolNameMatch(school.name, orgName)) return true;
  const orgParts = normalizeOutreachName(orgName).split(' ').filter(Boolean);
  const schoolParts = normalizeOutreachName(school.name).split(' ').filter(Boolean);
  if (!orgParts.length || orgParts.length > schoolParts.length) return false;
  if (!orgParts.every((p, i) => schoolParts[i] === p)) return false;
  const city = String(school.city || '').trim().toLowerCase();
  const conflicts = (siblingSchools || []).filter((s) => {
    if (Number(s.id) === Number(school.id)) return false;
    if (city && s.city && String(s.city).trim().toLowerCase() !== city) return false;
    const parts = normalizeOutreachName(s.name).split(' ').filter(Boolean);
    return orgParts.every((p, i) => parts[i] === p);
  });
  return conflicts.length === 0;
}

/**
 * Match a spreadsheet school name to exactly one directory school, or skip.
 */
export function matchImportSchool(spreadsheetName, directorySchools, { districtIncludes = 'denver public' } = {}) {
  const key = importSchoolKey(spreadsheetName);
  if (!key) return { status: 'skip', reason: 'empty_name' };
  if (SKIP_IMPORT_SCHOOLS.has(key) || [...SKIP_IMPORT_SCHOOLS].some((s) => key.startsWith(s))) {
    return { status: 'skip', reason: 'excluded' };
  }

  const scoped = (directorySchools || []).filter((s) =>
    String(s.district_name || '').toLowerCase().includes(districtIncludes)
  );

  const aliasTarget = DPS_IMPORT_ALIASES[key];
  if (aliasTarget) {
    const hits = scoped.filter((s) => s.name === aliasTarget);
    if (hits.length === 1) return { status: 'match', school: hits[0], reason: 'alias' };
    return { status: 'skip', reason: 'alias_not_unique' };
  }

  const exact = scoped.filter((s) => importSchoolKey(s.name) === key);
  if (exact.length === 1) return { status: 'match', school: exact[0], reason: 'exact' };

  const confident = scoped.filter((s) => isConfidentSchoolNameMatch(s.name, spreadsheetName));
  if (confident.length === 1) return { status: 'match', school: confident[0], reason: 'confident' };

  return { status: 'skip', reason: 'not_unique_or_unknown' };
}

export function mapHistoricalRow(row = {}) {
  const school = row.school || row.SCHOOL || row.B || '';
  const pocInfo = row.pocInfo || row.poc || row['POC & INFO'] || row.C || '';
  const notes = row.notes || row.NOTES || row.D || '';
  const extraNotes = row.extraNotes || row.comment || row.I || '';
  const date = row.date || row.DATE || row.A || '';
  const visitCount = row.visitCount ?? row['VIST #'] ?? row['VISIT #'] ?? row.E;
  const followUpEmail = parseYesNo(row.followUpEmail ?? row['follow upemail'] ?? row.F);
  const meeting = parseYesNo(row.meeting ?? row.Meeting ?? row.G);
  const servicesStarted = parseYesNo(row.servicesStarted ?? row['services started'] ?? row.H);
  const noteParts = [String(notes || '').trim(), String(extraNotes || '').trim()].filter(Boolean);
  return {
    school: String(school || '').trim(),
    pocInfo: String(pocInfo || '').trim(),
    date: String(date || '').trim() || null,
    visitCount: visitCount === '' || visitCount == null ? null : Number(visitCount),
    followUpEmail,
    meeting,
    servicesStarted,
    combinedNotes: noteParts.join('\n')
  };
}
