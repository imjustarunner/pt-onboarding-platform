/**
 * Assistant capability catalog.
 *
 * Single source of truth for:
 * - role-aware "what can I do" UI prompts
 * - deterministic intent aliases for high-frequency asks
 * - acceptance/drift checks for visible prompts
 */

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

export function matchCatalogBackedPageNavigationIntent({ prompt, allowedToolNames }) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower || !allowedToolNames?.has?.('navigateTo')) return null;
  const hasAction = /\b(open|show|find|go to|take me to|navigate to|visit|search( for)?|look (up|for))\b/.test(lower);
  if (!hasAction) return null;
  const routeName = resolveNavigateRouteNameFromPrompt(lower);
  if (!routeName) return null;
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

function catalogEntries() {
  return [
    {
      id: 'workspace_open',
      audience: ['provider_like', 'admin_like'],
      group: 'Schedule and meetings',
      prompt: 'Open my workspace for today',
      requiredToolsAll: ['openTodaysWorkspace'],
      subtitleTag: 'workspace',
      matcher: (lower, allowedTools) =>
        allowedTools.has('openTodaysWorkspace') &&
        (
          /\b(workspace|active events?|what.*(?:active|going on|happening) (?:now|today|right now))\b/.test(lower) ||
          (/\bopen.*today/.test(lower) && /\b(events?|sessions?|meetings?)\b/.test(lower))
        ),
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
      id: 'meeting_start',
      audience: ['provider_like', 'admin_like'],
      group: 'Schedule and meetings',
      prompt: 'Start a meeting with Sarah',
      requiredToolsAll: ['startMeeting', 'searchUsers'],
      subtitleTag: 'meetings',
      matcher: (lower, allowedTools) =>
        allowedTools.has('startMeeting') &&
        allowedTools.has('searchUsers') &&
        /\b(?:start (?:a |an )?(?:meeting|video chat|video call|call|chat|1\s*[-:on]\s*1)|let'?s meet)\s+(?:with|w\/)\s+/.test(lower),
      buildIntent: (lower) => {
        const m = lower.match(
          /\b(?:start (?:a |an )?(?:meeting|video chat|video call|call|chat|1\s*[-:on]\s*1)|let'?s meet)\s+(?:with|w\/)\s+(.+?)(?:\s+(?:now|today|please|pls|asap|right now))?[.?!]?$/
        );
        const target = (m?.[1] || '').trim().replace(/^(the\s+|a\s+)/, '');
        if (!target || target.length < 2 || target.length > 80) return null;
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
      id: 'intake_openings',
      audience: ['provider_like', 'admin_like'],
      group: 'Coverage and referrals',
      prompt: 'Who has an intake opening today?',
      requiredToolsAll: ['findIntakeOpenings'],
      subtitleTag: 'intake openings',
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
      id: 'providers_by_approach',
      audience: ['provider_like', 'admin_like'],
      group: 'Coverage and referrals',
      prompt: 'Who uses CBT?',
      requiredToolsAll: ['findProvidersByApproach'],
      subtitleTag: 'provider search',
      matcher: (lower, allowedTools) =>
        allowedTools.has('findProvidersByApproach') &&
        (
          /\bwho\b.*\b(use|uses|does)\b.*\b(cbt|dbt|emdr|act|ifs|trauma|adhd|play therapy)\b/.test(lower) ||
          /\bfind\b.*\b(provider|therapist)\b.*\b(cbt|dbt|emdr|act|ifs|trauma|adhd|play therapy)\b/.test(lower)
        ),
      buildIntent: (lower) => {
        const approachMatch =
          lower.match(/\b(?:who|anyone|which\s+providers?)\s+(?:use|uses|does|do)\s+([a-zA-Z][\w\s&\-/().'+]{1,40})\??$/) ||
          lower.match(/\bfind\s+(?:a\s+|me\s+)?([a-zA-Z][\w\s&\-/().'+]{1,40})\s+(?:provider|therapist|specialist)/);
        const approach = String(approachMatch?.[1] || '').trim();
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
      id: 'school_portal_lookup',
      audience: ['admin_like'],
      group: 'Navigation and lookup',
      prompt: 'Open Twain school portal',
      requiredToolsAll: ['searchSchools'],
      subtitleTag: 'schools',
      matcher: (lower, allowedTools) =>
        allowedTools.has('searchSchools') &&
        /\b(school|portal|portals)\b/.test(lower) &&
        /\b(open|show|find|search|take me to|go to|navigate)\b/.test(lower),
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
      id: 'payroll_summary',
      audience: ['admin_like', 'provider_like'],
      group: 'Navigation and lookup',
      prompt: 'Open payroll summary',
      requiredToolsAll: ['getMyPayrollSummary'],
      subtitleTag: 'payroll',
      matcher: (lower, allowedTools) =>
        allowedTools.has('getMyPayrollSummary') &&
        /\bpayroll|paycheck|pay check|my pay|my payroll|pay summary\b/.test(lower),
      buildIntent: () => ({
        intent: 'my_payroll_summary',
        capabilityId: 'payroll_summary',
        toolCalls: [{ name: 'getMyPayrollSummary', args: {} }]
      })
    },
    {
      id: 'office_schedule',
      audience: ['admin_like', 'provider_like'],
      group: 'Operations',
      prompt: 'What offices are open today?',
      requiredToolsAll: ['getOfficeSchedule'],
      subtitleTag: 'offices',
      matcher: (lower, allowedTools) =>
        allowedTools.has('getOfficeSchedule') &&
        /\boffice(s)?\b/.test(lower) &&
        /\b(open|sessions?|booked|scheduled|today|tomorrow|this|next)\b/.test(lower),
      buildIntent: (lower) => {
        const dateHint = parseDateHintFromPrompt(lower);
        const today = new Date().toISOString().slice(0, 10);
        return {
          intent: 'office_schedule',
          capabilityId: 'office_schedule',
          toolCalls: [{ name: 'getOfficeSchedule', args: { dateYmd: dateHint || today, locationQuery: '' } }]
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
      matcher: (lower, allowedTools) =>
        allowedTools.has('listMyRecentActivity') &&
        /\b(what i did|my activity|last log(?:in)?|when did i last log in|show me what i did)\b/.test(lower),
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
      : 'I can help with navigation and common workflows.';

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
    capabilityIds: entries.map((e) => e.id)
  };
}

export function matchDeterministicCapabilityIntent({ prompt, allowedToolNames }) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower) return null;
  for (const entry of catalogEntries()) {
    if (Array.isArray(entry.requiredToolsAll) && !canUseAll(entry.requiredToolsAll, allowedToolNames)) continue;
    if (Array.isArray(entry.requiredToolsAny) && !canUseAny(entry.requiredToolsAny, allowedToolNames)) continue;
    if (typeof entry.matcher !== 'function') continue;
    if (!entry.matcher(lower, allowedToolNames)) continue;
    if (typeof entry.buildIntent !== 'function') return null;
    const intent = entry.buildIntent(lower, allowedToolNames);
    if (intent) return intent;
  }
  return null;
}

export function getCapabilityCatalogForTests() {
  return catalogEntries().map((e) => ({
    id: e.id,
    prompt: e.prompt,
    requiredToolsAll: e.requiredToolsAll || [],
    requiredToolsAny: e.requiredToolsAny || []
  }));
}

