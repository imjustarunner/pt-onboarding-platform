/**
 * Assistant capability catalog.
 *
 * Single source of truth for:
 * - role-aware "what can I do" UI prompts
 * - deterministic intent aliases for high-frequency asks
 * - semantic (TF–IDF) catalog routing for paraphrases after hard matchers
 * - acceptance/drift checks for visible prompts
 */

import {
  isUserProfileContext,
  resolveBestProfileSection
} from '../../../../frontend/src/navigation/profileSearchCatalog.js';
import {
  extractServiceCodes,
  looksLikeServiceCodeQuery
} from './assistantResearch.service.js';
import {
  pickBestCapabilityBySimilarity,
  rankCapabilitiesBySimilarity,
  SEMANTIC_MIN_SCORE,
  SEMANTIC_MARGIN
} from './assistantCapabilitySemanticRouter.service.js';
import {
  askAssistantGeminiRouterEnabled,
  verifyOrCorrectCapabilityRoute
} from './assistantCapabilityGeminiRouter.service.js';
import { getCachedPromotedSemanticExamples } from './assistantRouteFeedback.service.js';

const PROVIDER_LIKE_ROLES = new Set([
  'provider',
  'provider_plus',
  'intern',
  'intern_plus',
  'clinical_practice_assistant',
  'supervisor'
]);

const ADMIN_LIKE_ROLES = new Set(['admin', 'support', 'staff', 'super_admin', 'superadmin']);

function normalizeRole(role) {
  return String(role || '').toLowerCase().trim();
}

function roleAudience(role) {
  const r = normalizeRole(role);
  if (ADMIN_LIKE_ROLES.has(r)) return 'admin_like';
  if (PROVIDER_LIKE_ROLES.has(r)) return 'provider_like';
  return 'general';
}

function parseDateHintFromPrompt(promptLower) {
  const s = String(promptLower || '').toLowerCase();
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (/\btoday\b/.test(s)) return startOfDay.toISOString().slice(0, 10);
  if (/\btomorrow\b/.test(s)) {
    const t = new Date(startOfDay);
    t.setDate(t.getDate() + 1);
    return t.toISOString().slice(0, 10);
  }
  if (/\byesterday\b/.test(s)) {
    const t = new Date(startOfDay);
    t.setDate(t.getDate() - 1);
    return t.toISOString().slice(0, 10);
  }
  const iso = s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  return null;
}

/** Extract numeric user id from "who is user 516", "user id 516", etc. */
function parseUserIdFromPrompt(promptLower) {
  const s = String(promptLower || '').toLowerCase().trim();
  if (!s) return null;
  const patterns = [
    /\bwho\s+is\s+user\s*(?:id|#)?\s*(\d{1,10})\b/,
    /\b(?:lookup|find|show|open)\s+user\s*(?:id|#)?\s*(\d{1,10})\b/,
    /\buser\s*(?:id|#)\s*(\d{1,10})\b/,
    /^user\s+(\d{1,10})\s*$/
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m?.[1]) return String(m[1]);
  }
  return null;
}

/**
 * Extract a person name from presence follow-ups like
 * "how long has rachel been idle" / "is sarah away".
 */
function parsePresencePersonQueryFromPrompt(promptLower) {
  const s = String(promptLower || '').toLowerCase().trim();
  if (!s) return '';
  const howLong = s.match(
    /\bhow\s+long\s+has\s+([a-z][a-z'.-]{1,40}(?:\s+[a-z][a-z'.-]{1,40})?)\s+been\b/
  );
  if (howLong?.[1]) {
    const name = howLong[1].trim();
    if (!/^(she|he|they|someone|anyone|anybody)$/.test(name)) return name.slice(0, 80);
  }
  const isStatus = s.match(
    /\bis\s+([a-z][a-z'.-]{1,40}(?:\s+[a-z][a-z'.-]{1,40})?)\s+(?:still\s+)?(?:idle|away|online|active|offline|inactive|working)\b/
  );
  if (isStatus?.[1]) {
    const name = isStatus[1].trim();
    if (!/^(she|he|they|someone|anyone|anybody)$/.test(name)) return name.slice(0, 80);
  }
  const statusOf = s.match(
    /\b(?:status|presence)\s+(?:of|for)\s+([a-z][a-z'.-]{1,40}(?:\s+[a-z][a-z'.-]{1,40})?)\b/
  );
  if (statusOf?.[1]) return statusOf[1].trim().slice(0, 80);
  return '';
}

/**
 * Parse admin/payroll analytics questions into queryPayrollAnalytics args.
 * Returns null if the prompt is not a staff payroll analytics ask.
 */
function parsePayrollAnalyticsArgsFromPrompt(lower) {
  const s = String(lower || '').toLowerCase().trim();
  if (!s) return null;

  const extractPerson = () => {
    const patterns = [
      /\b(?:has|have|did|does)\s+([a-z][a-z'.-]{1,40}(?:\s+[a-z][a-z'.-]{1,40})?)\s+(?:had|have|get|got|make|made|earn|earned)\b/,
      /\b(?:for|about)\s+([a-z][a-z'.-]{1,40}(?:\s+[a-z][a-z'.-]{1,40})?)\b/,
      /\b([a-z][a-z'.-]{1,40}(?:\s+[a-z][a-z'.-]{1,40})?)(?:'s|’s)\s+(?:pay|payroll|pto|rate|rates|benefits|sessions|compensation)\b/,
      /\b(?:how\s+many|how\s+much).{0,40}?\b(?:has|have|did)\s+([a-z][a-z'.-]{1,40}(?:\s+[a-z][a-z'.-]{1,40})?)\b/,
      /\bwhat\s+(?:is|are)\s+([a-z][a-z'.-]{1,40}(?:\s+[a-z][a-z'.-]{1,40})?)(?:'s|’s)\b/
    ];
    for (const re of patterns) {
      const m = s.match(re);
      if (m?.[1]) {
        const name = m[1].trim();
        if (!/^(she|he|they|someone|anyone|anybody|staff|providers?|our|the|this|that|last|this|year|week)$/.test(name)) {
          return name.slice(0, 80);
        }
      }
    }
    return null;
  };

  const codeMatch = s.match(/\b(\d{5}|H\d{4}|[A-Z]\d{4}|908\d{2}|994\d{2})\b/i);
  const serviceCode = codeMatch ? String(codeMatch[1]).toUpperCase() : null;

  let timeframe = 'last_4_periods';
  let startDate;
  let endDate;
  if (/\b(ytd|year\s+to\s+date|this\s+year|calendar\s+year)\b/.test(s)) timeframe = 'ytd';
  else if (/\b(last\s+pay\s+period|prior\s+pay\s+period|previous\s+pay\s+period)\b/.test(s)) timeframe = 'last_period';
  else if (/\b(this\s+week|current\s+week)\b/.test(s)) timeframe = 'this_week';
  else if (/\b(from|between|since)\b/.test(s) && /\bto\b|\band\b/.test(s)) {
    const dates = [...s.matchAll(/\b(\d{4}-\d{2}-\d{2})\b/g)].map((m) => m[1]);
    if (dates.length >= 2) {
      timeframe = 'custom';
      startDate = dates[0];
      endDate = dates[1];
    } else if (dates.length === 1 && /\bsince\b/.test(s)) {
      timeframe = 'custom';
      startDate = dates[0];
      endDate = new Date().toISOString().slice(0, 10);
    } else {
      timeframe = 'custom';
    }
  } else if (/\bsince\b/.test(s)) {
    const d = s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (d) {
      timeframe = 'custom';
      startDate = d[1];
      endDate = new Date().toISOString().slice(0, 10);
    } else {
      timeframe = 'custom';
    }
  }

  const personName = extractPerson();
  const args = { timeframe };
  if (personName) args.personName = personName;
  if (serviceCode) args.serviceCode = serviceCode;
  if (startDate) args.startDate = startDate;
  if (endDate) args.endDate = endDate;

  if (/\b(top\s+5|top\s+five|highest\s+paid|paid\s+the\s+most|top\s+compensation|who\s+gets\s+paid\s+the\s+most)\b/.test(s)) {
    return { intent: 'top_pay', ...args, limit: /\bwho\s+gets\s+paid\s+the\s+most\b/.test(s) ? 1 : 5 };
  }
  if (/\b(most\s+clients|sees\s+the\s+most\s+clients|who\s+sees\s+the\s+most)\b/.test(s)) {
    return { intent: 'top_clients', ...args, limit: 5 };
  }
  if (/\b(top\s+5|top\s+five).{0,40}\bsessions?\b.{0,20}\b(this\s+week|week)\b|\bsessions?\b.{0,40}\bthis\s+week\b/.test(s)) {
    return { intent: 'top_sessions_week', ...args, limit: 5, timeframe: 'this_week' };
  }
  if (/\b(direct\s+and\s+indirect\s+rate|indirect\s+rate|direct\s+rate|compensation\s+rate|what\s+are\s+their\s+rates|per[- ]code\s+rate)\b/.test(s)
    || (/\brates?\b/.test(s) && (personName || serviceCode))) {
    return { intent: 'rates', ...args };
  }
  if (/\b(pto\s+hours|pto\s+balance|sick\s+hours|training\s+hours|how\s+many\s+pto)\b/.test(s)
    && (personName || /\b(as\s+of\s+today|do\s+they\s+have|does\s+.+\s+have)\b/.test(s))) {
    return { intent: 'pto', ...args };
  }
  if (/\b(what\s+benefits|benefits\s+does|benefit\s+enrollment|their\s+benefits)\b/.test(s)) {
    return { intent: 'benefits', ...args };
  }
  if (/\b(year\s+to\s+date|ytd).{0,30}\b(pay|earn|made|compensation)\b|\bhow\s+much\b.{0,40}\b(made|earned|paid)\b/.test(s)) {
    return { intent: 'ytd_pay', ...args, timeframe: timeframe === 'last_4_periods' ? 'ytd' : timeframe };
  }
  if (/\baverage\b.{0,20}\b(pay|earn|make)\b.{0,20}\bweek|\bavg\b.{0,20}\bpay\b.{0,20}\bweek|\bmake\s+on\s+average\s+per\s+week\b/.test(s)) {
    return { intent: 'avg_weekly_pay', ...args };
  }
  if (/\baverage\b.{0,20}\bsessions?\b.{0,20}\bweek|\bavg\b.{0,20}\bsessions?\b|\bsessions?\s+averaging\s+per\s+week\b/.test(s)) {
    return { intent: 'avg_weekly_sessions', ...args };
  }
  if (/\b(no[- ]?notes?|incomplete\s+notes?).{0,40}\blast\s+pay\s+period\b|\blast\s+pay\s+period.{0,40}\b(no[- ]?notes?|incomplete)\b/.test(s)) {
    return { intent: 'no_notes_last_period', ...args, timeframe: 'last_period' };
  }
  if (/\b(average|avg).{0,30}\b(no[- ]?notes?|incomplete\s+notes?)\b|\bhow\s+many\s+no[- ]?notes?\b.{0,40}\bon\s+average\b/.test(s)) {
    return { intent: 'no_notes_average', ...args };
  }
  if (/\b(incomplete\s+notes?|no[- ]?notes?|unpaid\s+notes?)\b/.test(s)) {
    return { intent: 'incomplete_notes', ...args };
  }
  if (/\b(sessions?|how\s+many\s+\d{5})\b/.test(s) && (personName || serviceCode)) {
    return { intent: 'sessions', ...args };
  }
  return null;
}

function looksLikeStaffPtoBalanceQuestion(lower) {
  const s = String(lower || '');
  if (!/\b(pto|sick|training)\b/.test(s)) return false;
  if (/\b(policy|handbook|company\s+policy|accrue|eligibility\s+policy)\b/.test(s)) return false;
  return (
    /\bhow\s+many\b.{0,40}\b(pto|sick|training)\b.{0,20}\bhours?\b/.test(s)
    || /\b(pto|sick|training)\s+(hours?|balance)\b/.test(s)
    || /\b(pto\s+balance|remaining\s+pto)\b/.test(s)
  );
}

/** Extract an office location name fragment from prompts like "in the Windchime office". */
function parseOfficeLocationQueryFromPrompt(promptLower) {
  const s = String(promptLower || '').toLowerCase();
  if (!s) return '';
  const inOffice = s.match(
    /\b(?:in|at|for|of)\s+(?:the\s+)?([a-z0-9][a-z0-9\s'-]{0,40}?)\s+office\b/
  );
  if (inOffice?.[1]) {
    const name = inOffice[1].trim();
    if (name && !/^(an|the|our|any|my|this|that|main)$/.test(name)) return name.slice(0, 100);
  }
  const bareOffice = s.match(/\b([a-z0-9][a-z0-9'-]{1,40})\s+office\b/);
  if (bareOffice?.[1]) {
    const name = bareOffice[1].trim();
    if (name && !/^(an|the|our|any|my|this|that|main|has|have|open|using)$/.test(name)) {
      return name.slice(0, 100);
    }
  }
  return '';
}

function parseTimeOfDay(text) {
  const s = String(text || '').toLowerCase().trim();
  if (!s) return null;
  if (s === 'noon') return '12:00';
  if (s === 'midnight') return '00:00';
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24 && !/(am|pm|a\.m|p\.m)/.test(s)) {
    const hh = Math.max(0, Math.min(23, parseInt(m24[1], 10)));
    const mm = Math.max(0, Math.min(59, parseInt(m24[2], 10)));
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)$/);
  if (!m12) return null;
  let hh = parseInt(m12[1], 10);
  const mm = m12[2] ? parseInt(m12[2], 10) : 0;
  const isPm = /^p/.test(m12[3]);
  if (hh < 1 || hh > 12) return null;
  if (hh === 12) hh = isPm ? 12 : 0;
  else if (isPm) hh += 12;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function guessEntityQueryFromPrompt(promptLower, extraStopwords = []) {
  const raw = String(promptLower || '').toLowerCase();
  if (!raw) return '';
  const extras = extraStopwords.length
    ? new RegExp(`\\b(${extraStopwords.join('|')})\\b`, 'g')
    : null;
  let s = raw
    .replace(/\b(take me to|go to|navigate to|navigate|open|visit|show me|find|search|look up|look for)\b/g, ' ')
    .replace(/\b(the|a|an|please|could you|can you|for me|some|any)\b/g, ' ');
  if (extras) s = s.replace(extras, ' ');
  return s
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** Optional channel adjectives before meeting/call nouns ("virtual meeting", "zoom call"). */
const MEETING_CHANNEL =
  '(?:virtual|video|online|remote|zoom|teams|google\\s*meet|facetime|skype|webex)\\s+';
/** Nouns that mean a 1:1 / huddle-style meeting. */
const MEETING_NOUN =
  `(?:${MEETING_CHANNEL})?(?:meeting|huddle|video\\s*chat|video\\s*call|call|chat|1\\s*[-:on]\\s*1)`;
/**
 * "start/schedule a (virtual) meeting with X", "let's meet with X", "hop on a call with X",
 * and bare natural phrasing: "chat with melissa", "meet with Bob", "talk to Sarah".
 * Kept broad so these never fall through to agency-document research.
 */
const START_MEETING_WITH_RE = new RegExp(
  String.raw`\b(?:(?:start|launch|begin|open|schedule|book|create|set\s*up)\s+(?:a |an )?${MEETING_NOUN}|let'?s meet|hop on (?:a )?${MEETING_NOUN}|jump on (?:a )?${MEETING_NOUN}|${MEETING_NOUN}|meet|talk)\s+(?:with|w\/|to)\s+`,
  'i'
);
const START_MEETING_TARGET_RE = new RegExp(
  String.raw`${START_MEETING_WITH_RE.source}(.+?)(?:\s+(?:now|today|please|pls|asap|right now))?[.?!]?$`,
  'i'
);

function extractStartMeetingTarget(promptLower) {
  const m = String(promptLower || '').match(START_MEETING_TARGET_RE);
  const target = (m?.[1] || '').trim().replace(/^(the\s+|a\s+|an\s+)/, '');
  if (!target || target.length < 2 || target.length > 80) return null;
  return target;
}

export function resolveNavigateRouteNameFromPrompt(promptLower) {
  const s = String(promptLower || '').toLowerCase();
  if (!s) return null;

  // Prefer more specific intents first.
  // Keep in sync with frontend `quickNavCatalog.js` account + app destinations.
  if (/\b(note ?aid|note generator|clinical note|generate note)\b/.test(s)) return 'NoteAid';
  if (/\b(compliance corner|compliance|hipaa)\b/.test(s)) return 'ComplianceCorner';
  if (/\b(presence|team board|who is in|who's in)\b/.test(s)) return 'PresenceTeamBoard';
  if (/\b(audit center|audit log|audit activity)\b/.test(s)) return 'AuditCenter';
  if (/\b(referral|referrals|referral directory)\b/.test(s)) return 'ReferralDirectory';
  if (/\b(client|clients|client management)\b/.test(s)) return 'ClientManagement';
  if (/\b(school portal|school portals|portals hub|school-portals)\b/.test(s)) return 'SchoolPortalsHub';
  if (/\b(program events|program event|skill builders|events)\b/.test(s)) return 'SkillBuildersProgramsEvents';
  if (/\b(provider directory|provider list)\b/.test(s)) return 'ProviderDirectory';
  if (/\b(gear|inventory|stock levels?|unique assets?)\b/.test(s)) return 'GearInventory';
  if (
    /\b(training\s+(knowledge\s+)?base|training\s+reference|reference\s+docs?|training\s+docs?|training\s+documents?)\b/.test(s) ||
    (
      /\b(handbook|polic(?:y|ies))\b/.test(s) &&
      /\b(add|link|upload|open|manage|edit|go\s+to|take\s+me)\b/.test(s)
    )
  ) {
    return 'TrainingKnowledgeBase';
  }
  if (/\b(module manager|training modules|admin modules)\b/.test(s)) return 'ModuleManager';
  if (/\b(hiring|candidates|hire)\b/.test(s)) return 'HiringCandidates';
  if (/\b(admin payroll|payroll management|payroll admin)\b/.test(s)) return 'AdminPayroll';
  if (/\b(my payroll|pay stubs?|paycheck|pay check|payroll)\b/.test(s)) return 'MyPayroll';
  if (/\b(compensation|pay rates?|my rates?)\b/.test(s)) return 'MyCompensation';
  if (/\b(benefits?|eligibility|benefit tier)\b/.test(s)) return 'MyBenefits';
  if (/\b(kudos|recognition)\b/.test(s)) return 'MyKudos';
  if (/\b(life balance|well-?being wheel)\b/.test(s)) return 'LifeBalance';
  if (/\b(my documents|documents to sign)\b/.test(s)) return 'MyDocuments';
  if (/\b(notification|notifications)\b/.test(s)) return 'Notifications';
  if (/\b(user manager|users)\b/.test(s)) return 'UserManager';
  if (/\b(credentials)\b/.test(s)) return 'Credentials';
  if (/\b(preferences)\b/.test(s)) return 'Preferences';
  if (/\b(account|profile|my account|account info)\b/.test(s)) return 'AccountInfo';
  if (/\b(schedule|calendar)\b/.test(s)) return 'Schedule';
  if (/\b(dashboard|home|overview)\b/.test(s)) return 'Dashboard';
  return null;
}

/**
 * Profile section jump (when Ask Assistant is used on a user profile page).
 * Uses the shared frontend profileSearchCatalog so aliases stay in sync.
 */
export function matchProfileSectionJumpIntent({ prompt, context }) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower) return null;
  if (!isUserProfileContext(context)) return null;

  // Explicit hub override: leave the profile for inventory management.
  if (/\b(gear inventory|inventory (page|hub|management)|stock levels?)\b/.test(lower)) {
    return null;
  }

  const best = resolveBestProfileSection(lower);
  if (!best) return null;

  return {
    intent: 'profile_section_jump',
    capabilityId: 'profile_section_jump',
    toolCalls: [],
    assistantText: `Opening ${best.label} on this profile…`,
    uiCommands: [
      {
        type: 'profileJump',
        tabId: best.tabId,
        sectionId: best.sectionId || '',
        clinicalSubTab: best.clinicalSubTab || ''
      }
    ]
  };
}

export function matchCatalogBackedPageNavigationIntent({ prompt, allowedToolNames }) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower || !allowedToolNames?.has?.('navigateTo')) return null;
  const hasAction = /\b(open|show|find|go to|take me to|navigate to|visit|search( for)?|look (up|for))\b/.test(lower);
  const routeName = resolveNavigateRouteNameFromPrompt(lower);
  if (!routeName) return null;
  // Allow bare destination keywords ("gear", "payroll") without action verbs when the
  // prompt is short — otherwise send conversational asks to the LLM.
  if (!hasAction) {
    const words = lower.split(/\s+/).filter(Boolean);
    if (words.length > 4) return null;
  }
  return {
    intent: 'page_navigate',
    capabilityId: 'page_navigation_generic',
    toolCalls: [{ name: 'navigateTo', args: { routeName } }]
  };
}

function canUseAll(requiredTools, allowedToolNames) {
  return requiredTools.every((t) => allowedToolNames.has(t));
}

function canUseAny(requiredTools, allowedToolNames) {
  return requiredTools.some((t) => allowedToolNames.has(t));
}

const HINT_STOPWORDS = new Set([
  'a', 'an', 'the', 'my', 'me', 'to', 'for', 'of', 'and', 'or', 'with', 'on', 'in', 'at',
  'is', 'are', 'what', 'who', 'how', 'show', 'open', 'find', 'go'
]);

/** Derive document hints from prompt, subtitle, and optional routeHints (also used by semantic docs). */
export function deriveCapabilityRouteHints(entry) {
  const hints = new Set();
  for (const h of entry?.routeHints || []) {
    const t = String(h || '').toLowerCase().trim();
    if (t.length >= 2) hints.add(t);
  }
  const tag = String(entry?.subtitleTag || '').toLowerCase().trim();
  if (tag.length >= 2) hints.add(tag);
  const prompt = String(entry?.prompt || '').toLowerCase();
  for (const tok of prompt.split(/\W+/)) {
    if (!tok || tok.length < 3) continue;
    if (HINT_STOPWORDS.has(tok)) continue;
    hints.add(tok);
  }
  const words = prompt.split(/\s+/).filter(Boolean);
  for (let n = 2; n <= 4; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const slice = words.slice(i, i + n);
      const contentful = slice.filter((w) => w.length >= 3 && !HINT_STOPWORDS.has(w));
      if (contentful.length < 1) continue;
      const phrase = slice.join(' ');
      if (phrase.length >= 8 && phrase.length <= 40) hints.add(phrase);
    }
  }
  return Array.from(hints);
}

function isSemanticRoutableEntry(entry, allowedToolNames) {
  if (!entry || entry.softRoute === false) return false;
  if (typeof entry.buildIntent !== 'function') return false;
  if (Array.isArray(entry.requiredToolsAll) && !canUseAll(entry.requiredToolsAll, allowedToolNames)) return false;
  if (Array.isArray(entry.requiredToolsAny) && !canUseAny(entry.requiredToolsAny, allowedToolNames)) return false;
  return true;
}

function isToolEligibleEntry(entry, allowedToolNames) {
  if (!entry) return false;
  if (typeof entry.buildIntent !== 'function') return false;
  if (Array.isArray(entry.requiredToolsAll) && !canUseAll(entry.requiredToolsAll, allowedToolNames)) return false;
  if (Array.isArray(entry.requiredToolsAny) && !canUseAny(entry.requiredToolsAny, allowedToolNames)) return false;
  return true;
}

function withPromotedExamples(entries, examplesById) {
  if (!examplesById?.size) return entries;
  return entries.map((entry) => {
    const extra = examplesById.get(entry.id);
    if (!extra?.length) return entry;
    return {
      ...entry,
      semanticExamples: [...(entry.semanticExamples || []), ...extra]
    };
  });
}

/**
 * Semantic catalog router after hard regexes fail.
 * TF–IDF proposes; Gemini verifies / course-corrects (unless disabled).
 * Skips write-action capabilities (softRoute === false) and service-code asks.
 *
 * @param {{ prompt: string, allowedToolNames: Set<string>, callGemini?: Function }} args
 */
export async function matchSemanticCapabilityIntent({ prompt, allowedToolNames, callGemini } = {}) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower) return null;
  if (looksLikeServiceCodeQuery(lower) || extractServiceCodes(lower).length) return null;

  let candidates = catalogEntries().filter((entry) => isSemanticRoutableEntry(entry, allowedToolNames));
  if (!candidates.length) return null;

  try {
    const promoted = await getCachedPromotedSemanticExamples();
    candidates = withPromotedExamples(candidates, promoted);
  } catch {
    /* ignore — route without learned examples */
  }

  const ranked = rankCapabilitiesBySimilarity({ prompt: lower, entries: candidates });
  const tfidfBest = pickBestCapabilityBySimilarity({
    prompt: lower,
    entries: candidates,
    minScore: SEMANTIC_MIN_SCORE,
    margin: SEMANTIC_MARGIN
  });

  const buildFromEntry = (entry, meta = {}) => {
    if (!entry || typeof entry.buildIntent !== 'function') return null;
    const intent = entry.buildIntent(lower, allowedToolNames);
    if (!intent) return null;
    return {
      ...intent,
      capabilityId: intent.capabilityId || entry.id,
      softRouted: true,
      semanticRouted: true,
      semanticScore: meta.semanticScore ?? null,
      geminiVerified: Boolean(meta.geminiVerified),
      geminiCorrected: Boolean(meta.geminiCorrected),
      geminiConfidence: meta.geminiConfidence || null,
      geminiRouterError: meta.geminiRouterError || null,
      tfidfTopId: meta.tfidfTopId || null
    };
  };

  if (!askAssistantGeminiRouterEnabled()) {
    if (!tfidfBest?.entry) return null;
    return buildFromEntry(tfidfBest.entry, {
      semanticScore: tfidfBest.score,
      tfidfTopId: tfidfBest.capabilityId
    });
  }

  const gemini = await verifyOrCorrectCapabilityRoute({
    prompt: lower,
    ranked,
    eligibleEntries: candidates,
    callGemini
  });

  if (gemini.capabilityId) {
    const entry = candidates.find((e) => e.id === gemini.capabilityId);
    const built = buildFromEntry(entry, {
      semanticScore: ranked.find((r) => r.capabilityId === gemini.capabilityId)?.score ?? null,
      geminiVerified: gemini.geminiVerified,
      geminiCorrected: gemini.geminiCorrected,
      geminiConfidence: gemini.confidence,
      tfidfTopId: gemini.tfidfTopId
    });
    if (built) return built;
  }

  // Gemini down / null / invalid → clear TF–IDF winner if any.
  if (gemini.error && tfidfBest?.entry) {
    return buildFromEntry(tfidfBest.entry, {
      semanticScore: tfidfBest.score,
      tfidfTopId: tfidfBest.capabilityId,
      geminiRouterError: gemini.error
    });
  }

  return null;
}

/** @deprecated Use matchSemanticCapabilityIntent — kept as alias for older imports/tests. */
export async function matchSoftCapabilityIntent(args) {
  return matchSemanticCapabilityIntent(args);
}

/** Test helper: rank without committing to an intent. */
export function rankSemanticCapabilityMatches({ prompt, allowedToolNames }) {
  const lower = String(prompt || '').toLowerCase().trim();
  const candidates = catalogEntries().filter((entry) => isSemanticRoutableEntry(entry, allowedToolNames));
  return rankCapabilitiesBySimilarity({ prompt: lower, entries: candidates }).map((r) => ({
    capabilityId: r.capabilityId,
    score: r.score
  }));
}

/**
 * Hard matchers first, then TF–IDF + Gemini catalog router.
 * Async because Gemini verify may run after hard matchers miss.
 */
export async function matchDeterministicCapabilityIntent({
  prompt,
  allowedToolNames,
  callGemini,
  forceCapabilityId
} = {}) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower) return null;

  const forcedId = String(forceCapabilityId || '').trim();
  if (forcedId) {
    const entry = catalogEntries().find((e) => e.id === forcedId);
    if (entry && isToolEligibleEntry(entry, allowedToolNames)) {
      const intent = entry.buildIntent(lower, allowedToolNames);
      if (intent) {
        return {
          ...intent,
          capabilityId: intent.capabilityId || entry.id,
          forcedCapability: true
        };
      }
    }
  }

  // Staff payroll analytics (sessions-by-code for a person, etc.) before service-code research.
  if (allowedToolNames?.has?.('queryPayrollAnalytics')) {
    const payrollArgs = parsePayrollAnalyticsArgsFromPrompt(lower);
    if (payrollArgs) {
      return {
        intent: 'payroll_analytics',
        capabilityId: 'payroll_analytics',
        toolCalls: [{ name: 'queryPayrollAnalytics', args: payrollArgs }]
      };
    }
  }

  // Service codes first — never let soft/fuzzy English steal "what is H2014".
  if (looksLikeServiceCodeQuery(lower) || extractServiceCodes(lower).length) {
    return {
      intent: 'agency_research',
      capabilityId: 'service_code_research',
      followUpAgencyResearch: true,
      researchQuery: lower,
      toolCalls: []
    };
  }

  for (const entry of catalogEntries()) {
    if (Array.isArray(entry.requiredToolsAll) && !canUseAll(entry.requiredToolsAll, allowedToolNames)) continue;
    if (Array.isArray(entry.requiredToolsAny) && !canUseAny(entry.requiredToolsAny, allowedToolNames)) continue;
    if (typeof entry.matcher !== 'function') continue;
    if (!entry.matcher(lower, allowedToolNames)) continue;
    if (typeof entry.buildIntent !== 'function') return null;
    const intent = entry.buildIntent(lower, allowedToolNames);
    if (intent) return intent;
  }
  // Semantic catalog routing for read/nav capabilities only.
  return matchSemanticCapabilityIntent({ prompt: lower, allowedToolNames, callGemini });
}

function catalogEntries() {
  return [
    {
      id: 'workspace_open',
      audience: ['provider_like', 'admin_like', 'general'],
      group: 'Schedule and meetings',
      prompt: 'Open my workspace for today',
      requiredToolsAll: ['openTodaysWorkspace'],
      subtitleTag: 'workspace',
      semanticExamples: [
        'what is going on today',
        'show todays active sessions',
        'open my events for today',
        'whats happening right now in my workspace',
        'what my day',
        "what's on my agenda",
        'whats on my schedule today'
      ],
      matcher: (lower, allowedTools) => {
        if (!allowedTools.has('openTodaysWorkspace')) return false;
        if (/\b(cancel|clear|wipe|kill)\b/.test(lower) && /\b(day|meetings?)\b/.test(lower)) return false;
        if (/\b(handbook|polic(?:y|ies)|document|pdf)\b/.test(lower)) return false;
        // Telegraphic: "what my day", "my agenda", "todays schedule"
        if (/^(what(?:'?s|s)?\s+)?(is\s+)?(on\s+)?(my\s+)?(day|agenda|schedule|calendar)\??$/.test(lower)) {
          return true;
        }
        if (/\b(what(?:'?s|s)?\s+(on\s+)?)?(my\s+)?(day|agenda)\b/.test(lower)) return true;
        if (
          /\b(what|whats|what's|show|open|list)\b/.test(lower) &&
          /\b(my\s+)?(day|agenda|schedule|calendar|workspace)\b/.test(lower)
        ) {
          return true;
        }
        if (/\b(today'?s?\s+(agenda|schedule|events?|meetings?|workspace)|schedule\s+for\s+today)\b/.test(lower)) {
          return true;
        }
        return (
          /\b(workspace|active events?|what.*(?:active|going on|happening) (?:now|today|right now))\b/.test(lower) ||
          (/\bopen.*today/.test(lower) && /\b(events?|sessions?|meetings?)\b/.test(lower))
        );
      },
      buildIntent: (lower) => {
        const dateHint = parseDateHintFromPrompt(lower);
        const today = new Date().toISOString().slice(0, 10);
        const activeOnly = /\b(now|right now|currently|active)\b/.test(lower);
        return {
          intent: 'todays_workspace',
          capabilityId: 'workspace_open',
          toolCalls: [{ name: 'openTodaysWorkspace', args: { dateYmd: dateHint || today, activeOnly } }]
        };
      }
    },
    {
      id: 'user_lookup',
      audience: ['admin_like'],
      group: 'Navigation and lookup',
      prompt: 'Who is user 516?',
      requiredToolsAll: ['searchUsers'],
      subtitleTag: 'user lookup',
      semanticExamples: [
        'lookup user id 516',
        'find user 516',
        'show me user number 516',
        'who is user id 516'
      ],
      matcher: (lower, allowedTools) => {
        if (!allowedTools.has('searchUsers')) return false;
        if (/\b(online|idle|away|available|working|team\s+presence)\b/.test(lower)) return false;
        return Boolean(parseUserIdFromPrompt(lower));
      },
      buildIntent: (lower) => {
        const userId = parseUserIdFromPrompt(lower);
        if (!userId) return null;
        return {
          intent: 'user_lookup',
          capabilityId: 'user_lookup',
          suppressUserAutoOpen: true,
          toolCalls: [{ name: 'searchUsers', args: { query: userId, limit: 5 } }]
        };
      }
    },
    {
      id: 'meeting_start',
      audience: ['provider_like', 'admin_like'],
      group: 'Schedule and meetings',
      prompt: 'Start a meeting with Sarah',
      requiredToolsAll: ['startMeeting', 'searchUsers'],
      subtitleTag: 'meetings',
      softRoute: false,
      matcher: (lower, allowedTools) =>
        allowedTools.has('startMeeting') &&
        allowedTools.has('searchUsers') &&
        // Bare "meeting/chat with X" is allowed, but never steal cancel/reschedule phrasing.
        !/\b(cancel|reschedule|move|push|shift|delay|bump)\b/.test(lower) &&
        START_MEETING_WITH_RE.test(lower),
      buildIntent: (lower) => {
        const target = extractStartMeetingTarget(lower);
        if (!target) return null;
        return {
          intent: 'start_meeting',
          capabilityId: 'meeting_start',
          followUpStartMeeting: true,
          toolCalls: [{ name: 'searchUsers', args: { query: target, limit: 5 } }]
        };
      }
    },
    {
      id: 'meeting_reschedule',
      audience: ['provider_like', 'admin_like'],
      group: 'Schedule and meetings',
      prompt: 'Move my 3pm to 4pm',
      requiredToolsAll: ['rescheduleMeeting', 'findMyMeetings'],
      subtitleTag: 'meetings',
      softRoute: false,
      matcher: (lower, allowedTools) =>
        allowedTools.has('rescheduleMeeting') &&
        allowedTools.has('findMyMeetings') &&
        /\b(?:move|reschedule|push|shift|change)\s+/.test(lower) &&
        /\b(?:to|->|→)\b/.test(lower),
      buildIntent: (lower) => {
        const m = lower.match(
          /\b(?:move|reschedule|push|shift|change)\s+(?:my\s+|the\s+)?(?:meeting\s+at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)\s*(?:meeting|huddle|video chat|1\s*[-:on]\s*1)?\s+(?:to|→|->)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/
        );
        if (!m) return null;
        const fromHm = parseTimeOfDay(m[1]);
        const toHm = parseTimeOfDay(m[2]);
        if (!fromHm || !toHm) return null;
        return {
          intent: 'reschedule_meeting_by_time',
          capabilityId: 'meeting_reschedule',
          followUpRescheduleByTime: true,
          fromTimeHm: fromHm,
          toTimeHm: toHm,
          toolCalls: [{ name: 'findMyMeetings', args: { atTimeHm: fromHm } }]
        };
      }
    },
    {
      id: 'meeting_push_remaining',
      audience: ['provider_like', 'admin_like'],
      group: 'Schedule and meetings',
      prompt: 'Push everything 30 minutes',
      requiredToolsAll: ['pushTodaysRemainingMeetings'],
      subtitleTag: 'meetings',
      softRoute: false,
      matcher: (lower, allowedTools) =>
        allowedTools.has('pushTodaysRemainingMeetings') &&
        (
          /\b(?:push|move|shift|delay|bump)\s+(?:all|every|everything|the\s+rest(?:\s+of\s+(?:the|my)\s+day)?|my\s+(?:remaining\s+)?meetings?|today'?s?\s+meetings?)\b/.test(lower) ||
          /\bpush\s+everyone\s+(?:back|forward|out|up)\b/.test(lower)
        ),
      buildIntent: (lower) => {
        const pushMatch =
          lower.match(/\b(?:push|move|shift|delay|bump)\s+(?:all|every|everything|the\s+rest(?:\s+of\s+(?:the|my)\s+day)?|my\s+(?:remaining\s+)?meetings?|today'?s?\s+meetings?)\b[^0-9-]*?(-?\d{1,3})\s*(min(?:ute)?s?|m\b|hours?|hrs?|h\b)/) ||
          lower.match(/\bpush\s+everyone\s+(?:back|forward|out|up)\s+(\d{1,3})\s*(min(?:ute)?s?|m\b|hours?|hrs?|h\b)/);
        if (!pushMatch) return null;
        let n = parseInt(pushMatch[1], 10);
        const unit = (pushMatch[2] || '').toLowerCase();
        if (/hour|hrs?|^h$/.test(unit)) n *= 60;
        if (/\b(earlier|sooner|forward|up)\b/.test(lower) && n > 0) n = -n;
        if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 600) return null;
        return {
          intent: 'push_todays_remaining',
          capabilityId: 'meeting_push_remaining',
          followUpPushTodaysRemaining: true,
          shiftMinutes: n,
          toolCalls: []
        };
      }
    },
    {
      id: 'meeting_cancel_with_person',
      audience: ['provider_like', 'admin_like'],
      group: 'Schedule and meetings',
      prompt: 'Cancel the meeting with Sarah',
      requiredToolsAll: ['cancelMeeting', 'findMyMeetings'],
      subtitleTag: 'meetings',
      softRoute: false,
      matcher: (lower, allowedTools) =>
        allowedTools.has('cancelMeeting') &&
        allowedTools.has('findMyMeetings') &&
        /\b(cancel|kill|skip)\b/.test(lower) &&
        /\b(?:with|w\/)\s+[a-z]/.test(lower),
      buildIntent: (lower) => {
        const cancelWithMatch =
          lower.match(/\bcancel\s+(?:my\s+|the\s+)?(?:meeting|huddle|1\s*[-:on]\s*1|video chat|chat|call)?\s*(?:with|w\/)\s+(.+?)(?:\s+(?:please|today|now))?[.?!]?$/);
        const target = (cancelWithMatch?.[1] || '').trim().replace(/^(the\s+|a\s+)/, '');
        if (!target || target.length < 2 || target.length > 80) return null;
        let reason = null;
        const reasonMatch = lower.match(/\b(?:because|reason[:\s]|since|due to)\s+(.{3,160})$/);
        if (reasonMatch) reason = reasonMatch[1].replace(/[.?!]+$/, '').trim();
        return {
          intent: 'cancel_meeting_with_person',
          capabilityId: 'meeting_cancel_with_person',
          followUpCancelMeetingWithPerson: true,
          withName: target,
          cancelReason: reason,
          toolCalls: [{ name: 'findMyMeetings', args: { withName: target } }]
        };
      }
    },
    {
      id: 'meeting_cancel_rest_day',
      audience: ['provider_like', 'admin_like'],
      group: 'Schedule and meetings',
      prompt: 'Cancel the rest of my day',
      requiredToolsAll: ['cancelTodaysRemainingMeetings'],
      subtitleTag: 'meetings',
      softRoute: false,
      matcher: (lower, allowedTools) =>
        allowedTools.has('cancelTodaysRemainingMeetings') &&
        /\b(cancel|clear|wipe|kill)\b/.test(lower) &&
        (
          /\b(rest of (?:the |my )?day|remaining meetings?|all (?:my )?(?:meetings?|remaining meetings?)|everything (?:today|for today)|the day|my day)\b/.test(lower) ||
          /\b(?:i'?m sick|i am sick|going home|leaving early)\b/.test(lower)
        ),
      buildIntent: (lower) => {
        let reason = null;
        const reasonMatch = lower.match(/\b(?:because|reason[:\s]|since|due to)\s+(.{3,160})$/);
        if (reasonMatch) reason = reasonMatch[1].replace(/[.?!]+$/, '').trim();
        else if (/\b(?:i'?m sick|i am sick)\b/.test(lower)) reason = 'Out sick';
        return {
          intent: 'cancel_rest_of_day',
          capabilityId: 'meeting_cancel_rest_day',
          followUpCancelRestOfDay: true,
          cancelReason: reason,
          toolCalls: []
        };
      }
    },
    {
      id: 'meeting_cancel_next',
      audience: ['provider_like', 'admin_like'],
      group: 'Schedule and meetings',
      prompt: 'Cancel my next meeting',
      requiredToolsAll: ['cancelMeeting', 'findNextMeeting'],
      subtitleTag: 'meetings',
      softRoute: false,
      matcher: (lower, allowedTools) =>
        allowedTools.has('cancelMeeting') &&
        allowedTools.has('findNextMeeting') &&
        /\b(cancel|kill)\b/.test(lower) &&
        /\b(meeting|huddle|1\s*[-:on]\s*1|video chat)\b/.test(lower) &&
        !/\b(rest of (?:the |my )?day|remaining|all (?:my )?meetings?)\b/.test(lower),
      buildIntent: () => ({
        intent: 'cancel_next_meeting',
        capabilityId: 'meeting_cancel_next',
        followUpCancelNextMeeting: true,
        toolCalls: [{ name: 'findNextMeeting', args: {} }]
      })
    },
    {
      id: 'training_kb_open',
      audience: ['admin_like'],
      group: 'Handbook and policies',
      prompt: 'Open Training Knowledge Base',
      requiredToolsAll: ['navigateTo'],
      subtitleTag: 'handbook',
      routeHints: [
        'training knowledge base',
        'training reference',
        'reference docs',
        'handbook link',
        'google doc',
        'upload handbook',
        'add handbook'
      ],
      semanticExamples: [
        'upload handbook google doc please',
        'paste handbook link',
        'manage training reference docs',
        'open handbook upload settings'
      ],
      matcher: (lower, allowedTools) =>
        allowedTools.has('navigateTo') &&
        (
          /\b(training\s+(knowledge\s+)?base|training\s+reference|reference\s+docs?|training\s+docs?|training\s+documents?)\b/.test(lower) ||
          (
            /\b(handbook|polic(?:y|ies)|google\s+doc)\b/.test(lower) &&
            /\b(add|link|upload|open|manage|edit|go\s+to|take\s+me|set\s*up)\b/.test(lower)
          )
        ),
      buildIntent: () => ({
        intent: 'page_navigate',
        capabilityId: 'training_kb_open',
        assistantText:
          'Opening Training Reference Docs — paste your public Google Docs handbook link there (Anyone with the link → Viewer).',
        toolCalls: [{ name: 'navigateTo', args: { routeName: 'TrainingKnowledgeBase' } }]
      })
    },
    {
      id: 'training_kb_search',
      audience: ['provider_like', 'admin_like', 'general'],
      group: 'Handbook and policies',
      prompt: "What's the company policy on PTO?",
      requiredToolsAll: ['searchTrainingKnowledgeBase'],
      subtitleTag: 'handbook',
      routeHints: [
        'pto',
        'paid time off',
        'sick leave',
        'vacation',
        'company policy',
        'employee handbook',
        'dress code',
        'remote work',
        'fmla'
      ],
      semanticExamples: [
        'what does the handbook say about sick leave',
        'look up remote work policy',
        'company policy on vacation days',
        'explain dress code from handbook',
        'hr policy for bereavement'
      ],
      matcher: (lower, allowedTools) => {
        if (!allowedTools.has('searchTrainingKnowledgeBase')) return false;
        // Staff PTO *balances* belong to payroll analytics when that tool is available.
        if (allowedTools.has('queryPayrollAnalytics') && looksLikeStaffPtoBalanceQuestion(lower)) {
          return false;
        }
        // Manage/open/add flows belong to training_kb_open (navigate), not search.
        if (
          /\b(training\s+(knowledge\s+)?base|training\s+reference|reference\s+docs?|training\s+docs?|training\s+documents?)\b/.test(lower) ||
          (
            /\b(handbook|polic(?:y|ies)|google\s+doc)\b/.test(lower) &&
            /\b(add|link|upload|open|manage|edit|go\s+to|take\s+me|set\s*up)\b/.test(lower)
          )
        ) {
          return false;
        }
        return (
          /\b(handbook|workplace\s+polic(?:y|ies)|company\s+polic(?:y|ies)|employee\s+handbook|hr\s+polic(?:y|ies)|code\s+of\s+conduct|dress\s+code)\b/.test(lower) ||
          /\b(pto|paid\s+time\s+off|vacation|sick\s+(?:leave|time|days?)|bereavement|parental\s+leave|maternity|paternity|fmla|holiday\s+pay|remote\s+work|work\s+from\s+home|time\s+off)\b/.test(lower) ||
          (
            /\b(polic(?:y|ies)|benefit(?:s)?)\b/.test(lower) &&
            /\b(what|whats|what's|where|how|explain|tell|find|look\s*up|company|our|the|on|about)\b/.test(lower)
          )
        );
      },
      buildIntent: (lower) => ({
        intent: 'training_kb_search',
        capabilityId: 'training_kb_search',
        toolCalls: [{ name: 'searchTrainingKnowledgeBase', args: { query: lower.slice(0, 200), limit: 5 } }]
      })
    },
    {
      id: 'team_presence',
      audience: ['provider_like', 'admin_like', 'general'],
      group: 'Availability',
      prompt: 'Who is available on my team right now?',
      requiredToolsAll: ['listTeamPresence'],
      subtitleTag: 'live presence',
      semanticExamples: [
        'who is online',
        'anyone available right now',
        'who is around on the team',
        'show me team presence',
        'who is free right now',
        'whos working right now',
        'how long has rachel been idle',
        'how long has she been away',
        'is sarah idle'
      ],
      matcher: (lower, allowedTools) => {
        if (!allowedTools.has('listTeamPresence')) return false;
        if (/\bintake\b/.test(lower)) return false;
        if (/\b(handbook|polic(?:y|ies)|document|pdf)\b/.test(lower)) return false;
        if (/\b(who'?s\s+online|who\s+is\s+online|team\s+presence)\b/.test(lower)) return true;
        if (/\b(who'?s|whos|who\s+is)\s+working\b/.test(lower)) return true;
        // "how long has Rachel been idle/away" / "is Rachel idle"
        if (
          /\b(idle|away)\b/.test(lower) &&
          /\b(how\s+long|been|since|is|status)\b/.test(lower)
        ) {
          return true;
        }
        if (
          /\b(who|who'?s|whos|anyone|anybody)\b/.test(lower) &&
          /\b(available|online|idle|away|around|free|here|reachable|working)\b/.test(lower)
        ) {
          return true;
        }
        return (
          /\b(available|online)\b/.test(lower) &&
          /\b(team|staff|people|colleagues|right\s+now|currently)\b/.test(lower)
        );
      },
      buildIntent: (lower) => {
        const nameQuery = parsePresencePersonQueryFromPrompt(lower);
        return {
          intent: 'list_team_presence',
          capabilityId: 'team_presence',
          toolCalls: [{
            name: 'listTeamPresence',
            args: {
              includeOffline: Boolean(nameQuery),
              nameQuery: nameQuery || ''
            }
          }]
        };
      }
    },
    {
      id: 'intake_openings',
      audience: ['provider_like', 'admin_like'],
      group: 'Coverage and referrals',
      prompt: 'Who has an intake opening today?',
      requiredToolsAll: ['findIntakeOpenings'],
      subtitleTag: 'intake openings',
      semanticExamples: [
        'any intake slots available today',
        'who is free for a new intake',
        'intake availability this week'
      ],
      matcher: (lower, allowedTools) =>
        allowedTools.has('findIntakeOpenings') &&
        /\bintake\b/.test(lower) &&
        /\b(open|opening|openings|availab(le|ility)|free|slot|spot)\b/.test(lower),
      buildIntent: (lower) => {
        const dateHint = parseDateHintFromPrompt(lower);
        const today = new Date().toISOString().slice(0, 10);
        let modality = 'ALL';
        if (/\bvirtual\b|\bonline\b|\btelehealth\b/.test(lower)) modality = 'VIRTUAL';
        else if (/\bin[- ]?person\b|\boffice\b/.test(lower)) modality = 'IN_PERSON';
        return {
          intent: 'find_intake_openings',
          capabilityId: 'intake_openings',
          toolCalls: [{ name: 'findIntakeOpenings', args: { dateYmd: dateHint || today, modality } }]
        };
      }
    },
    {
      id: 'provider_availability_at_location',
      audience: ['admin_like', 'provider_like'],
      group: 'Coverage and referrals',
      prompt: 'What provider has availability at Green Valley?',
      requiredToolsAll: ['searchProviders'],
      subtitleTag: 'availability',
      semanticExamples: [
        'what provider has availability at Green Valley',
        'who has openings at twain',
        'find me a clinician at the main office',
        'which therapist is free at roosevelt'
      ],
      matcher: (lower, allowedTools) => {
        if (!allowedTools.has('searchProviders')) return false;
        if (!/\b(provider|therapist|clinician)s?\b/.test(lower)) return false;
        if (!/\b(availab|openings?|free|open slots?)\b/.test(lower)) return false;
        if (!/\b(at|in|near)\b/.test(lower)) return false;
        return true;
      },
      buildIntent: (lower) => {
        const atMatch = lower.match(/\b(?:at|in|near)\s+(?:the\s+)?([a-z0-9][a-z0-9\s'-]{2,60}?)(?:\s+office|\s+school|\s*\?|$)/i);
        const locationQuery = atMatch ? atMatch[1].trim() : null;
        return {
          intent: 'provider_availability_at_location',
          capabilityId: 'provider_availability_at_location',
          toolCalls: [{
            name: 'searchProviders',
            args: {
              query: locationQuery || '',
              limit: 5,
              filters: [{ fieldKey: 'accepting_clients', op: 'eq', value: true }]
            }
          }]
        };
      }
    },
    {
      id: 'providers_by_approach',
      audience: ['provider_like', 'admin_like'],
      group: 'Coverage and referrals',
      prompt: 'Who uses CBT?',
      requiredToolsAll: ['findProvidersByApproach'],
      subtitleTag: 'provider search',
      semanticExamples: [
        'find a therapist who does DBT',
        'which providers use EMDR',
        'anyone who does trauma therapy'
      ],
      matcher: (lower, allowedTools) =>
        allowedTools.has('findProvidersByApproach') &&
        (
          /\bwho\b.*\b(use|uses|does)\b.*\b(cbt|dbt|emdr|act|ifs|trauma|adhd|play therapy)\b/.test(lower) ||
          /\bfind\b.*\b(provider|therapist)\b.*\b(cbt|dbt|emdr|act|ifs|trauma|adhd|play therapy)\b/.test(lower) ||
          /\b(?:which|any)\s+providers?\b.*\b(cbt|dbt|emdr|act|ifs|trauma|adhd|play therapy)\b/.test(lower) ||
          /\b(?:cbt|dbt|emdr|act|ifs|trauma|adhd|play therapy)\b.*\b(provider|therapist|clinician)s?\b/.test(lower)
        ),
      buildIntent: (lower) => {
        const approachMatch =
          lower.match(/\b(?:who|anyone|which\s+providers?)\s+(?:use|uses|does|do)\s+([a-zA-Z][\w\s&\-/().'+]{1,40})\??$/) ||
          lower.match(/\bfind\s+(?:a\s+|me\s+)?([a-zA-Z][\w\s&\-/().'+]{1,40})\s+(?:provider|therapist|specialist)/) ||
          lower.match(/\b(?:cbt|dbt|emdr|act|ifs|trauma(?:\s+therapy)?|adhd|play\s+therapy)\b/);
        const approach = String(approachMatch?.[1] || approachMatch?.[0] || '').trim();
        if (!approach) return null;
        return {
          intent: 'find_providers_by_approach',
          capabilityId: 'providers_by_approach',
          toolCalls: [{ name: 'findProvidersByApproach', args: { approach, limit: 25 } }]
        };
      }
    },
    {
      id: 'referral_search',
      audience: ['provider_like', 'admin_like', 'general'],
      group: 'Coverage and referrals',
      prompt: 'Find pediatric psychiatry referrals',
      requiredToolsAll: ['searchReferralDirectory'],
      subtitleTag: 'referrals',
      semanticExamples: [
        'need a pediatric psychiatry referral',
        'referral directory for speech therapy',
        'who can I refer to for OT'
      ],
      matcher: (lower, allowedTools) =>
        allowedTools.has('searchReferralDirectory') &&
        /\breferral|referrals|psychiatry|pediatric(s)?\b/.test(lower),
      buildIntent: (lower) => ({
        intent: 'referral_search',
        capabilityId: 'referral_search',
        toolCalls: [{ name: 'searchReferralDirectory', args: { query: lower.slice(0, 120) } }]
      })
    },
    {
      id: 'school_client_counts',
      audience: ['admin_like'],
      group: 'Navigation and lookup',
      prompt: 'How many clients are active at Rudy Elementary?',
      requiredToolsAll: ['getSchoolClientStats'],
      subtitleTag: 'schools',
      softRoute: false,
      semanticExamples: [
        'how many students at this school affiliate',
        'active client count for an elementary school',
        'caseload size at a school portal'
      ],
      matcher: (lower, allowedTools) => {
        if (!allowedTools.has('getSchoolClientStats')) return false;
        const countAsk =
          /\b(how many|count|number of|# of)\b/.test(lower) &&
          /\b(client|clients|student|students|kids|caseload|roster)\b/.test(lower);
        const activeAtAsk =
          /\b(active|current)\b/.test(lower) &&
          /\b(client|clients|student|students)\b/.test(lower) &&
          /\b(at|for|in|with)\b/.test(lower);
        const rosterAsk =
          /\b(roster|caseload)\b/.test(lower) &&
          /\b(school|elementary|middle|high|academy|program)\b/.test(lower);
        return countAsk || activeAtAsk || rosterAsk;
      },
      buildIntent: (lower) => {
        const query = guessEntityQueryFromPrompt(lower, [
          'how',
          'many',
          'count',
          'number',
          'of',
          'client',
          'clients',
          'student',
          'students',
          'kids',
          'caseload',
          'roster',
          'active',
          'current',
          'are',
          'is',
          'at',
          'for',
          'in',
          'with',
          'school',
          'schools',
          'elementary',
          'middle',
          'high',
          'academy',
          'program',
          'affiliate',
          'affiliates'
        ]);
        if (!query || query.length < 2) return null;
        return {
          intent: 'school_client_stats',
          capabilityId: 'school_client_counts',
          toolCalls: [{ name: 'getSchoolClientStats', args: { query, limit: 10 } }]
        };
      }
    },
    {
      id: 'school_portal_lookup',
      audience: ['admin_like'],
      group: 'Navigation and lookup',
      prompt: 'Open Twain school portal',
      requiredToolsAll: ['searchSchools'],
      subtitleTag: 'schools',
      semanticExamples: [
        'find the school portal for Twain',
        'take me to an elementary school portal',
        'search affiliated schools by name'
      ],
      matcher: (lower, allowedTools) =>
        allowedTools.has('searchSchools') &&
        /\b(school|portal|portals|elementary|middle|high|academy)\b/.test(lower) &&
        /\b(open|show|find|search|take me to|go to|navigate)\b/.test(lower) &&
        // Count / caseload asks belong to getSchoolClientStats, not portal search.
        !(
          /\b(how many|count|number of|# of|caseload|roster)\b/.test(lower) &&
          /\b(client|clients|student|students|kids)\b/.test(lower)
        ),
      buildIntent: (lower) => {
        const query = guessEntityQueryFromPrompt(lower, ['school', 'schools', 'portal', 'portals', 'hub']);
        if (!query) return null;
        return {
          intent: 'school_search',
          capabilityId: 'school_portal_lookup',
          toolCalls: [{ name: 'searchSchools', args: { query, limit: 10 } }]
        };
      }
    },
    {
      id: 'events_lookup',
      audience: ['admin_like', 'provider_like'],
      group: 'Navigation and lookup',
      prompt: 'Open upcoming events',
      requiredToolsAny: ['searchEvents', 'navigateTo'],
      subtitleTag: 'events',
      semanticExamples: [
        'show program events',
        'find skill builders events',
        'upcoming company events'
      ],
      matcher: (lower, allowedTools) =>
        /\bevents?\b/.test(lower) &&
        /\b(open|show|upcoming|program)\b/.test(lower) &&
        (allowedTools.has('searchEvents') || allowedTools.has('navigateTo')),
      buildIntent: (lower, allowedTools) => {
        if (allowedTools.has('navigateTo')) {
          return {
            intent: 'page_navigate',
            capabilityId: 'events_lookup',
            toolCalls: [{ name: 'navigateTo', args: { routeName: 'SkillBuildersProgramsEvents' } }]
          };
        }
        const query = guessEntityQueryFromPrompt(lower, ['event', 'events', 'program', 'programs', 'session', 'sessions']);
        if (!query) return null;
        return {
          intent: 'event_search',
          capabilityId: 'events_lookup',
          toolCalls: [{ name: 'searchEvents', args: { query, limit: 10 } }]
        };
      }
    },
    {
      id: 'payroll_analytics',
      audience: ['admin_like'],
      group: 'Payroll analytics',
      prompt: 'How many 90837 sessions has Alex had this year?',
      requiredToolsAll: ['queryPayrollAnalytics'],
      subtitleTag: 'payroll analytics',
      routeHints: [
        'sessions',
        '90837',
        'no notes',
        'incomplete notes',
        'year to date pay',
        'pto hours',
        'compensation rate',
        'top earners',
        'most clients'
      ],
      semanticExamples: [
        'how many 90837 sessions has jordan had year to date',
        'how many incomplete notes did sam have last pay period',
        'how much has alex made year to date',
        'what is their direct and indirect rate',
        'how many pto hours does taylor have as of today',
        'show me the top five compensations',
        'who sees the most clients',
        'how many sessions are the top 5 people having this week',
        'who gets paid the most',
        'what benefits does this person have'
      ],
      matcher: (lower, allowedTools) => {
        if (!allowedTools.has('queryPayrollAnalytics')) return false;
        if (/\bmy\s+(pay|paycheck|payroll)\b/.test(lower)) return false;
        return !!parsePayrollAnalyticsArgsFromPrompt(lower);
      },
      buildIntent: (lower) => {
        const parsed = parsePayrollAnalyticsArgsFromPrompt(lower) || { intent: 'sessions', timeframe: 'last_4_periods' };
        return {
          intent: 'payroll_analytics',
          capabilityId: 'payroll_analytics',
          toolCalls: [{ name: 'queryPayrollAnalytics', args: parsed }]
        };
      }
    },
    {
      id: 'payroll_summary',
      audience: ['admin_like', 'provider_like'],
      group: 'Navigation and lookup',
      prompt: 'Open payroll summary',
      requiredToolsAll: ['getMyPayrollSummary'],
      subtitleTag: 'payroll',
      semanticExamples: [
        'show my paycheck summary',
        'how much was my last paycheck',
        'payroll unpaid documentation summary'
      ],
      matcher: (lower, allowedTools) => {
        if (!allowedTools.has('getMyPayrollSummary')) return false;
        // Self paycheck questions always route here.
        if (/\b(my\s+pay|my\s+paycheck|my\s+payroll|last\s+paycheck|pay\s+summary|open\s+payroll\s+summary)\b/.test(lower)) {
          return true;
        }
        // When payroll analytics is available, leave cross-person payroll asks to that capability.
        if (allowedTools.has('queryPayrollAnalytics')) return false;
        return /\bpayroll|paycheck|pay check|my pay|my payroll|pay summary\b/.test(lower);
      },
      buildIntent: () => ({
        intent: 'my_payroll_summary',
        capabilityId: 'payroll_summary',
        toolCalls: [{ name: 'getMyPayrollSummary', args: {} }]
      })
    },
    {
      id: 'office_roster',
      audience: ['admin_like', 'provider_like'],
      group: 'Operations',
      prompt: 'Who is booked in the office today?',
      requiredToolsAll: ['listOfficeRoster'],
      subtitleTag: 'office roster',
      semanticExamples: [
        'who has an office today',
        'who is booked in windchime today',
        'who is in the office today',
        'show me who is scheduled at the office',
        'office roster today',
        'which providers are booked in office'
      ],
      matcher: (lower, allowedTools) => {
        if (!allowedTools.has('listOfficeRoster')) return false;
        if (/\bintake\b/.test(lower)) return false;
        if (!/\boffice(s)?\b/.test(lower)) return false;
        if (/\b(who|who's|whos|whom)\b/.test(lower)) return true;
        return /\b(roster|staffed|providers?\s+booked|booked\s+providers?)\b/.test(lower);
      },
      buildIntent: (lower) => {
        const dateHint = parseDateHintFromPrompt(lower);
        const today = new Date().toISOString().slice(0, 10);
        return {
          intent: 'office_roster',
          capabilityId: 'office_roster',
          toolCalls: [{
            name: 'listOfficeRoster',
            args: {
              dateYmd: dateHint || today,
              locationQuery: parseOfficeLocationQueryFromPrompt(lower)
            }
          }]
        };
      }
    },
    {
      id: 'office_schedule',
      audience: ['admin_like', 'provider_like'],
      group: 'Operations',
      prompt: 'What offices are open today?',
      requiredToolsAll: ['getOfficeSchedule'],
      subtitleTag: 'offices',
      semanticExamples: [
        'which offices are open',
        'office hours today',
        'is the main office open',
        'any sessions at the boca office tomorrow'
      ],
      matcher: (lower, allowedTools) =>
        allowedTools.has('getOfficeSchedule') &&
        /\boffice(s)?\b/.test(lower) &&
        !/\b(who|who's|whos|whom)\b/.test(lower) &&
        /\b(open|hours|sessions?|scheduled|active|using)\b/.test(lower),
      buildIntent: (lower) => {
        const dateHint = parseDateHintFromPrompt(lower);
        const today = new Date().toISOString().slice(0, 10);
        return {
          intent: 'office_schedule',
          capabilityId: 'office_schedule',
          toolCalls: [{
            name: 'getOfficeSchedule',
            args: {
              dateYmd: dateHint || today,
              locationQuery: parseOfficeLocationQueryFromPrompt(lower)
            }
          }]
        };
      }
    },
    {
      id: 'event_rsvps',
      audience: ['admin_like', 'provider_like'],
      group: 'Operations',
      prompt: 'Who RSVP for this Friday event?',
      requiredToolsAll: ['getEventResponses'],
      subtitleTag: 'event responses',
      semanticExamples: [
        'who responded to the friday event',
        'event RSVP list',
        'show RSVPs for this weeks event'
      ],
      matcher: (lower, allowedTools) =>
        allowedTools.has('getEventResponses') &&
        /\b(rsvp|rsvp'?d|responded|said yes|attending|attendance)\b/.test(lower),
      buildIntent: (lower) => {
        const dateHint = parseDateHintFromPrompt(lower);
        const eventQueryMatch = lower.match(/\b(?:for|to)\s+(?:the\s+)?([a-z][a-z0-9\s-]{2,60}?)(?:\s+event|\s+meeting|\s*\?|$)/);
        const eventQuery = (eventQueryMatch?.[1] || '').trim();
        return {
          intent: 'event_responses',
          capabilityId: 'event_rsvps',
          toolCalls: [{ name: 'getEventResponses', args: { eventQuery, dateYmd: dateHint || undefined } }]
        };
      }
    },
    {
      id: 'agency_activity',
      audience: ['admin_like'],
      group: 'Operations',
      prompt: 'What activity happened in my agency this week?',
      requiredToolsAny: ['searchAgencyActivity', 'getAgencyActivityStats'],
      subtitleTag: 'audit activity',
      semanticExamples: [
        'agency audit log this week',
        'what did the team do in the last 7 days',
        'show agency activity stats'
      ],
      matcher: (lower, allowedTools) =>
        (allowedTools.has('searchAgencyActivity') || allowedTools.has('getAgencyActivityStats')) &&
        /\b(activity|audit|who did|happened)\b/.test(lower) &&
        /\bagency|team|this week|last 7 days\b/.test(lower),
      buildIntent: (lower, allowedTools) => {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - 7);
        const startDate = start.toISOString().slice(0, 10);
        const endDate = end.toISOString().slice(0, 10);
        if (allowedTools.has('searchAgencyActivity')) {
          return {
            intent: 'agency_activity',
            capabilityId: 'agency_activity',
            toolCalls: [{ name: 'searchAgencyActivity', args: { startDate, endDate, limit: 25 } }]
          };
        }
        return {
          intent: 'agency_activity_stats',
          capabilityId: 'agency_activity',
          toolCalls: [{ name: 'getAgencyActivityStats', args: { startDate, endDate, limit: 10 } }]
        };
      }
    },
    {
      id: 'my_activity',
      audience: ['provider_like', 'admin_like', 'general'],
      group: 'My activity',
      prompt: 'Show me what I did today',
      requiredToolsAll: ['listMyRecentActivity'],
      subtitleTag: 'recent activity',
      softRoute: false,
      matcher: (lower, allowedTools) =>
        allowedTools.has('listMyRecentActivity') &&
        /\b(what i did|my activity|last log(?:in)?|when did i last log in|show me what i did)\b/.test(lower) &&
        !looksLikeServiceCodeQuery(lower),
      buildIntent: (lower) => {
        const since = /\btoday\b/.test(lower) ? new Date().toISOString().slice(0, 10) : undefined;
        const actionType = /\blog(?:in)?\b/.test(lower) ? 'login' : undefined;
        return {
          intent: 'my_recent_activity',
          capabilityId: 'my_activity',
          toolCalls: [{ name: 'listMyRecentActivity', args: { limit: 15, since, actionType } }]
        };
      }
    }
  ];
}

function visibleEntriesForRoleAndTools(role, allowedToolNames) {
  const audience = roleAudience(role);
  const entries = catalogEntries().filter((entry) => {
    if (!entry.audience.includes(audience) && !entry.audience.includes('general')) return false;
    if (Array.isArray(entry.requiredToolsAll) && !canUseAll(entry.requiredToolsAll, allowedToolNames)) return false;
    if (Array.isArray(entry.requiredToolsAny) && !canUseAny(entry.requiredToolsAny, allowedToolNames)) return false;
    return true;
  });
  return entries;
}

/**
 * Rank "What did you mean?" chips by similarity to the failed prompt.
 * Excludes the capability that already ran; pads with catalog order if needed.
 */
export function rankCorrectionChoices({
  prompt,
  role,
  allowedToolNames,
  excludeCapabilityId = null,
  limit = 6
} = {}) {
  const max = Math.min(Math.max(1, Number(limit) || 6), 12);
  const exclude = excludeCapabilityId ? String(excludeCapabilityId) : '';
  const entries = visibleEntriesForRoleAndTools(role, allowedToolNames).filter(
    (e) => String(e.id || '') !== exclude
  );
  if (!entries.length) return [];

  const ranked = rankCapabilitiesBySimilarity({ prompt, entries });
  const out = [];
  const seen = new Set();
  for (const r of ranked) {
    const id = String(r.entry?.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: String(r.entry.prompt || id),
      tag: String(r.entry.subtitleTag || '')
    });
    if (out.length >= max) return out;
  }
  for (const e of entries) {
    const id = String(e.id || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      label: String(e.prompt || id),
      tag: String(e.subtitleTag || '')
    });
    if (out.length >= max) break;
  }
  return out;
}

export function buildCapabilityUiPayload({ role, allowedToolNames }) {
  const entries = visibleEntriesForRoleAndTools(role, allowedToolNames);
  const audience = roleAudience(role);

  const subtitleParts = Array.from(
    new Set(
      entries
        .map((e) => e.subtitleTag)
        .filter(Boolean)
    )
  );
  const subtitle =
    subtitleParts.length > 0
      ? `I can help with ${subtitleParts.slice(0, 5).join(', ')}.`
      : 'I look up agency tools and documents — not free-form AI chat.';

  const groupedMap = new Map();
  for (const e of entries) {
    if (!groupedMap.has(e.group)) groupedMap.set(e.group, []);
    groupedMap.get(e.group).push(e.prompt);
  }

  const groups = Array.from(groupedMap.entries()).map(([title, prompts]) => ({
    title,
    prompts: Array.from(new Set(prompts)).slice(0, 3)
  })).slice(0, 4);

  const suggestions = entries.map((e) => e.prompt).slice(0, 6);
  const promptToCapabilityId = Object.fromEntries(entries.map((e) => [e.prompt, e.id]));

  const inChatAction = audience === 'admin_like'
    ? 'What can you do for my role right now?'
    : 'What can you do for me right now?';

  return {
    subtitle,
    groups,
    suggestions,
    inChatAction,
    promptToCapabilityId,
    capabilityIds: entries.map((e) => e.id),
    // Static catalog fallback only — assist responses attach prompt-ranked choices.
    correctionChoices: entries.map((e) => ({
      id: e.id,
      label: e.prompt,
      tag: e.subtitleTag || ''
    }))
  };
}

export function getCapabilityCatalogForTests() {
  return catalogEntries().map((e) => ({
    id: e.id,
    prompt: e.prompt,
    requiredToolsAll: e.requiredToolsAll || [],
    requiredToolsAny: e.requiredToolsAny || []
  }));
}

