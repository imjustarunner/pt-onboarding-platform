/**
 * Infers work vs personal and reason_for_travel using rules learned from historical
 * company car trips plus agency DB history.
 */

const HOME_OFFICE_BEFORE_APRIL_2026 = ['masters', 'windchime'];
const HOME_OFFICE_FROM_APRIL_2026 = ['larkspur'];

const STORE_TOKENS = ['target', 'walmart', 'sams', 'home_depot', 'costco', 'goodwill', 'hobby lobby'];

const SCHOOL_RE = /school|academy|elementary|high school|middle school|\bhs\b|\bms\b|twain|carver|swigert|orton/i;

export function tokenizeDestinations(text) {
  const raw = String(text || '');
  const parts = raw.split(/[,;]+|\s+to\s+|\s+and\s+back|\s+then\s+/i);
  const tokens = [];
  const keys = new Set();

  for (const part of parts) {
    const key = canonicalToken(part);
    if (!key || keys.has(key)) continue;
    keys.add(key);
    tokens.push(key);
  }

  return tokens;
}

function canonicalToken(label) {
  const s = String(label || '').toLowerCase().trim();
  if (!s || s === 'none') return '';
  if (/windchime|437/.test(s)) return 'windchime';
  if (/masters|master's/.test(s)) return 'masters';
  if (/crest/.test(s)) return 'crest';
  if (/larkspur/.test(s)) return 'larkspur';
  if (/denver/.test(s)) return 'denver';
  if (/tesla/.test(s)) return 'tesla';
  if (/target/.test(s)) return 'target';
  if (/walmart/.test(s)) return 'walmart';
  if (/sam's|sams\b/.test(s)) return 'sams';
  if (/home depot/.test(s)) return 'home_depot';
  if (/goodwill/.test(s)) return 'goodwill';
  if (/car wash|super star|superstar|super carwash/.test(s)) return 'car_wash';
  if (/charge|supercharger|charging station/.test(s)) return 'charge';
  if (/oliver|deli|lunch|tacos|chipotle|snooze|fuji/.test(s)) return 'lunch';
  if (/client/.test(s)) return 'client';
  if (SCHOOL_RE.test(s)) return 'school';
  if (/d11|d12|dps|public schools/.test(s)) return 'school';
  if (/airport|dia\b/.test(s)) return 'airport';
  if (/dmv/.test(s)) return 'dmv';
  if (/arc\b/.test(s)) return 'arc';
  return s.replace(/\s+/g, ' ').slice(0, 60);
}

function tokenProfile(tokens, rawText = '') {
  const set = new Set(tokens);
  return {
    tokens,
    set,
    raw: String(rawText).toLowerCase(),
    has: (k) => set.has(k),
    count: (k) => tokens.filter((t) => t === k).length,
    hasStore: () => STORE_TOKENS.some((s) => set.has(s)),
    hasOfficeRoundTrip: () => {
      const offices = ['masters', 'windchime', 'crest', 'larkspur'];
      const officeHits = offices.filter((o) => set.has(o));
      return officeHits.length >= 2 || (set.has('masters') && tokens.filter((t) => t === 'masters').length >= 2);
    }
  };
}

function homeOfficeTokens(driveDate) {
  const d = String(driveDate || '').slice(0, 10);
  if (!d || d < '2026-04-01') return HOME_OFFICE_BEFORE_APRIL_2026;
  return [...HOME_OFFICE_FROM_APRIL_2026, 'windchime', 'crest'];
}

/** Rules distilled from company-car-trips historical CSV */
function inferFromRules(profile, driveDate) {
  const rules = [
    {
      priority: 100,
      match: (p) => p.has('denver') && p.has('school'),
      reason: 'Visit Denver schools'
    },
    {
      priority: 98,
      match: (p) => p.has('denver') && p.raw.includes('school'),
      reason: 'Visit multiple Denver schools'
    },
    {
      priority: 95,
      match: (p) => p.has('masters') && p.has('crest') && p.has('denver'),
      reason: 'Visit multiple Denver schools'
    },
    {
      priority: 94,
      match: (p) => p.has('larkspur') && p.has('windchime') && !p.has('school'),
      reason: 'Client care'
    },
    {
      priority: 93,
      match: (p) => p.has('masters') && p.has('windchime') && p.count('masters') >= 2 && !p.has('denver') && !p.hasStore(),
      reason: 'Client care'
    },
    {
      priority: 92,
      match: (p) => p.has('masters') && p.has('windchime') && p.has('client'),
      reason: 'Clients and client travel during session'
    },
    {
      priority: 91,
      match: (p) => p.has('windchime') && p.count('masters') >= 2 && !p.has('denver'),
      reason: 'Office clients'
    },
    {
      priority: 90,
      match: (p) => p.has('windchime') && p.has('masters') && p.tokens.length <= 4 && !p.hasStore(),
      reason: 'Client care'
    },
    {
      priority: 88,
      match: (p) => p.has('crest') && p.has('windchime') && !p.has('denver'),
      reason: 'Sessions at Windchime'
    },
    {
      priority: 87,
      match: (p) => p.has('masters') && p.has('crest') && !p.has('windchime') && !p.has('denver'),
      reason: 'Transporting car'
    },
    {
      priority: 86,
      match: (p) => p.has('crest') && p.has('masters') && p.tokens.length <= 3,
      reason: 'Car exchange'
    },
    {
      priority: 85,
      match: (p) => p.raw.includes('skills group') || (p.has('school') && p.raw.includes('skills')),
      reason: 'Skills Group'
    },
    {
      priority: 84,
      match: (p) => p.has('school') && !p.has('denver'),
      reason: 'School visit'
    },
    {
      priority: 82,
      match: (p) => p.has('car_wash'),
      reason: 'Car wash'
    },
    {
      priority: 81,
      match: (p) => p.has('charge') || p.has('tesla'),
      reason: 'Charging'
    },
    {
      priority: 80,
      match: (p) => p.has('lunch'),
      reason: 'Working lunch'
    },
    {
      priority: 78,
      match: (p) => p.has('windchime') && p.hasStore() && p.has('masters'),
      reason: 'Office supplies'
    },
    {
      priority: 77,
      match: (p) => p.has('windchime') && p.hasStore(),
      reason: 'Materials and office supplies'
    },
    {
      priority: 76,
      match: (p) => p.has('windchime') && p.tokens.length <= 2,
      reason: 'Office clients'
    },
    {
      priority: 75,
      match: (p) => p.has('denver') && !p.has('school'),
      reason: 'Denver office visit'
    },
    {
      priority: 70,
      match: (p) => p.hasStore() && !p.has('windchime') && !p.has('masters'),
      reason: 'Personal errands'
    },
    {
      priority: 65,
      match: (p) => p.hasOfficeRoundTrip() && p.hasStore(),
      reason: 'Office supplies'
    },
    {
      priority: 60,
      match: (p) => p.hasOfficeRoundTrip(),
      reason: 'Business errands'
    }
  ];

  let best = null;
  for (const rule of rules) {
    if (rule.match(profile)) {
      if (!best || rule.priority > best.priority) {
        best = { reason: rule.reason, priority: rule.priority, source: 'rule' };
      }
    }
  }
  return best;
}

function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

export function buildHistoricalPatternsFromTrips(trips = []) {
  const patterns = [];

  for (const trip of trips) {
    let destText = '';
    try {
      const arr = typeof trip.destinations_json === 'string'
        ? JSON.parse(trip.destinations_json)
        : trip.destinations_json;
      if (Array.isArray(arr)) destText = arr.join(', ');
    } catch {
      destText = '';
    }
    if (!destText && trip.destinations) destText = String(trip.destinations);
    const reason = String(trip.reason_for_travel || '').trim();
    if (!destText || !reason || reason === 'Imported' || reason === 'Business travel') continue;

    const tokens = tokenizeDestinations(destText);
    if (!tokens.length) continue;

    patterns.push({
      destinationsText: destText,
      reason,
      tokens,
      tokenSet: new Set(tokens)
    });
  }

  return patterns;
}

function inferFromHistorical(profile, historicalPatterns = []) {
  let best = null;

  for (const hist of historicalPatterns) {
    const score = jaccard(profile.set, hist.tokenSet);
    if (score < 0.45) continue;

    const lengthPenalty = Math.abs(profile.tokens.length - hist.tokens.length) * 0.05;
    const adjusted = score - lengthPenalty;

    if (!best || adjusted > best.score) {
      best = {
        reason: hist.reason,
        score: adjusted,
        source: 'historical',
        priority: 50 + adjusted * 50
      };
    }
  }

  return best;
}

function schoolDefaultReason(text, schoolOptions = []) {
  const lower = String(text).toLowerCase();
  for (const s of schoolOptions) {
    const name = String(s.name || '').trim().toLowerCase();
    if (!name || !lower.includes(name)) continue;
    return s.defaultReason || `School visit — ${s.name}`;
  }
  return null;
}

export function inferTripClassification({
  origin = '',
  destination = '',
  destinations = [],
  destinationsText = '',
  driveDate = null,
  schoolOptions = [],
  historicalPatterns = []
}) {
  const destList = destinationsText
    ? destinationsText.split(',').map((s) => s.trim()).filter(Boolean)
    : [...(Array.isArray(destinations) ? destinations : []), destination].filter(Boolean);

  const fullText = [origin, ...destList].filter(Boolean).join(', ');
  const tokens = tokenizeDestinations(fullText);
  const profile = tokenProfile(tokens, fullText);

  const ruleMatch = inferFromRules(profile, driveDate);
  const histMatch = inferFromHistorical(profile, historicalPatterns);

  let chosen = null;
  if (ruleMatch && histMatch) {
    chosen = ruleMatch.priority >= histMatch.priority ? ruleMatch : histMatch;
  } else {
    chosen = ruleMatch || histMatch;
  }

  const schoolReason = schoolDefaultReason(fullText, schoolOptions);
  if (schoolReason && (profile.has('school') || profile.has('denver'))) {
    chosen = { reason: schoolReason, priority: 96, source: 'school' };
  }

  let isWork = true;
  let confidence = 'low';
  let reason = 'Business travel';

  if (chosen) {
    reason = chosen.reason;
    confidence = chosen.source === 'historical' ? 'high' : 'medium';
    if (chosen.priority >= 70) confidence = 'high';
    isWork = !/^personal/i.test(reason);
  } else if (profile.hasStore() && !profile.has('windchime') && !profile.has('masters') && !profile.has('crest')) {
    isWork = false;
    reason = 'Personal errands';
    confidence = 'medium';
  } else if (tokens.length > 0) {
    isWork = true;
    reason = 'Business errands';
    confidence = 'low';
  } else {
    isWork = false;
    reason = 'Personal';
    confidence = 'low';
  }

  const homeOffices = homeOfficeTokens(driveDate).join(' / ');

  return {
    isWork,
    confidence,
    reasonForTravel: reason,
    inferenceSource: chosen?.source || 'default',
    homeOfficeNote: String(driveDate || '').slice(0, 10) < '2026-04-01'
      ? `Home office: Masters / Windchime (pre-April 2026)`
      : `Home office: Larkspur (${homeOffices})`
  };
}

export function applyClassificationToCandidate(candidate, schoolOptions = [], historicalPatterns = []) {
  const destinationsText = candidate.destinationsText
    || (Array.isArray(candidate.destinations) ? candidate.destinations.join(', ') : '')
    || candidate.destinationLabel
    || candidate.destination
    || '';

  const classification = inferTripClassification({
    origin: candidate.originLabel || candidate.origin,
    destination: candidate.destinationLabel || candidate.destination,
    destinations: candidate.destinations,
    destinationsText,
    driveDate: candidate.driveDate,
    schoolOptions,
    historicalPatterns
  });

  return {
    ...candidate,
    destinationsText,
    isWork: classification.isWork,
    inferenceConfidence: classification.confidence,
    inferenceSource: classification.inferenceSource,
    reasonForTravel: classification.reasonForTravel,
    homeOfficeNote: classification.homeOfficeNote,
    include: classification.isWork
  };
}
