/**
 * Infers work vs personal classification and reason_for_travel for company car trips.
 * Home office shifts from Masters/Windchime to Larkspur starting April 2026.
 */

const HOME_OFFICE_BEFORE_APRIL_2026 = [
  { pattern: /masters/i, label: 'Masters' },
  { pattern: /windchime/i, label: 'Windchime' },
  { pattern: /437\s*windchime/i, label: 'Windchime' }
];

const HOME_OFFICE_FROM_APRIL_2026 = [
  { pattern: /larkspur/i, label: 'Larkspur' }
];

const OFFICE_PATTERNS = [
  { pattern: /crest/i, label: 'Crest' },
  ...HOME_OFFICE_BEFORE_APRIL_2026,
  ...HOME_OFFICE_FROM_APRIL_2026
];

const SCHOOL_PATTERNS = [
  /school/i,
  /academy/i,
  /elementary/i,
  /middle school/i,
  /high school/i,
  /\bhs\b/i,
  /\bms\b/i
];

const PERSONAL_PATTERNS = [
  /target\b/i,
  /walmart/i,
  /grocery/i,
  /costco/i,
  /home depot/i,
  /lowes/i,
  /gas station/i,
  /shell\b/i,
  /chevron/i
];

const WORK_LUNCH_PATTERNS = [
  /lunch/i,
  /deli/i,
  /restaurant/i,
  /cafe/i,
  /coffee/i,
  /oliver/i
];

function normalizeText(parts) {
  return (Array.isArray(parts) ? parts : [parts])
    .map((p) => String(p || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesAny(text, patterns) {
  return patterns.some((p) => p.test(text));
}

function getHomeOfficePatterns(driveDate) {
  const d = String(driveDate || '').slice(0, 10);
  const beforeApril = !d || d < '2026-04-01';
  if (beforeApril) return HOME_OFFICE_BEFORE_APRIL_2026;
  return [...HOME_OFFICE_FROM_APRIL_2026, ...HOME_OFFICE_BEFORE_APRIL_2026.filter((o) => o.label !== 'Masters')];
}

function isHomeOffice(text, driveDate) {
  const patterns = getHomeOfficePatterns(driveDate);
  return patterns.some((o) => o.pattern.test(text));
}

function isAnyOffice(text) {
  return OFFICE_PATTERNS.some((o) => o.pattern.test(text));
}

function isSchool(text) {
  return matchesAny(text, SCHOOL_PATTERNS);
}

function schoolDefaultReasonFromOptions(text, schoolOptions = []) {
  const lower = text.toLowerCase();
  for (const s of schoolOptions) {
    const name = String(s.name || '').trim().toLowerCase();
    if (!name) continue;
    if (lower.includes(name)) {
      return s.defaultReason || `School visit — ${s.name}`;
    }
  }
  return null;
}

export function inferTripClassification({
  origin = '',
  destination = '',
  destinations = [],
  driveDate = null,
  schoolOptions = []
}) {
  const destList = [...(Array.isArray(destinations) ? destinations : []), destination].filter(Boolean);
  const text = normalizeText([origin, ...destList]);
  const originText = normalizeText(origin);
  const destText = normalizeText(destList);

  const atHomeOfficeOrigin = isHomeOffice(originText, driveDate);
  const atHomeOfficeDest = isHomeOffice(destText, driveDate);
  const involvesOffice = isAnyOffice(text);
  const involvesSchool = isSchool(text);
  const involvesPersonalStore = matchesAny(text, PERSONAL_PATTERNS);
  const involvesLunch = matchesAny(text, WORK_LUNCH_PATTERNS);
  const involvesDenver = /denver/i.test(text);

  let isWork = false;
  let confidence = 'low';
  let reason = 'Business travel';

  if (involvesSchool) {
    isWork = true;
    confidence = 'high';
    const schoolReason = schoolDefaultReasonFromOptions(text, schoolOptions);
    if (schoolReason) {
      reason = schoolReason;
    } else if (involvesDenver) {
      reason = 'Visit Denver schools';
    } else {
      reason = 'School visit';
    }
  } else if (/client/i.test(text) || /office client/i.test(text)) {
    isWork = true;
    confidence = 'high';
    reason = 'Office clients';
  } else if (involvesLunch && involvesOffice) {
    isWork = true;
    confidence = 'medium';
    reason = 'Working lunch';
  } else if (involvesOffice && !involvesPersonalStore) {
    isWork = true;
    confidence = 'high';
    if (atHomeOfficeOrigin && atHomeOfficeDest) {
      reason = 'Transporting car';
    } else if (involvesDenver) {
      reason = 'Denver office visit';
    } else {
      const homePatterns = getHomeOfficePatterns(driveDate);
      const homeLabel = homePatterns.find((o) => o.pattern.test(text))?.label || 'Office';
      reason = `${homeLabel} office`;
    }
  } else if (involvesPersonalStore && !involvesSchool && !involvesOffice) {
    isWork = false;
    confidence = 'medium';
    reason = 'Personal errands';
  } else if (/home/i.test(originText) && /home/i.test(destText)) {
    isWork = false;
    confidence = 'low';
    reason = 'Personal';
  } else if (involvesPersonalStore) {
    isWork = false;
    confidence = 'medium';
    reason = 'Personal errands';
  }

  return {
    isWork,
    confidence,
    reasonForTravel: reason,
    homeOfficeNote: driveDate && String(driveDate).slice(0, 10) < '2026-04-01'
      ? 'Home office: Masters / Windchime (pre-April 2026)'
      : 'Home office: Larkspur (April 2026+)'
  };
}

export function applyClassificationToCandidate(candidate, schoolOptions = []) {
  const classification = inferTripClassification({
    origin: candidate.originLabel || candidate.origin,
    destination: candidate.destinationLabel || candidate.destination,
    destinations: candidate.destinations,
    driveDate: candidate.driveDate,
    schoolOptions
  });

  return {
    ...candidate,
    isWork: classification.isWork,
    inferenceConfidence: classification.confidence,
    reasonForTravel: classification.reasonForTravel,
    homeOfficeNote: classification.homeOfficeNote,
    include: classification.isWork
  };
}
