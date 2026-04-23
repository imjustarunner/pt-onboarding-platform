import ActivityLogService from '../services/activityLog.service.js';
import { runAgentAssist, safeParseAgentJson } from '../services/agents/agentRuntime.service.js';
import { executeToolCall, getToolSchemasForUser } from '../services/agents/toolRegistry.service.js';

function normalizeUiCommands(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((c) => {
      const type = String(c?.type || '').trim();
      if (!type) return null;
      if (type === 'navigate') return { type, to: String(c?.to || '').trim() };
      if (type === 'highlight') return { type, selector: String(c?.selector || '').trim() };
      if (type === 'openHelper') return { type };
      if (type === 'closeHelper') return { type };
      return null;
    })
    .filter(Boolean);
}

/** One tool-call entry from various LLM / API shapes → { name, args }. */
function toolCallEntryToNormalized(t) {
  if (!t || typeof t !== 'object') return null;
  const fn = t.function && typeof t.function === 'object' ? t.function : null;
  const name = String(t?.name || t?.tool || fn?.name || '').trim();
  let args = {};
  if (t.args && typeof t.args === 'object') args = { ...t.args };
  else if (typeof t.arguments === 'string') {
    try {
      const o = JSON.parse(t.arguments);
      if (o && typeof o === 'object') args = o;
    } catch {
      /* noop */
    }
  } else if (fn && typeof fn.arguments === 'string') {
    try {
      const o = JSON.parse(fn.arguments);
      if (o && typeof o === 'object') args = o;
    } catch {
      /* noop */
    }
  }
  if (!name) return null;
  return { name, args };
}

function normalizeToolCalls(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map(toolCallEntryToNormalized).filter(Boolean).slice(0, 8);
}

function dedupeToolCalls(list) {
  const seen = new Set();
  const out = [];
  for (const tc of list || []) {
    const k = `${tc.name}:${JSON.stringify(tc.args)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(tc);
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Models often return snake_case keys, wrap JSON in markdown fences, or put
 * tool JSON in assistantText. Normalize so executeToolCall always receives
 * camelCase toolCalls with real args.
 */
function mergeAssistParsedModelShape(parsed) {
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  const collected = [];

  const ingestToolArray = (arr) => {
    for (const tc of normalizeToolCalls(arr)) collected.push(tc);
  };

  ingestToolArray(p.toolCalls);
  ingestToolArray(p.tool_calls);

  let assistantText = String(p.assistantText ?? '').trim();

  if (assistantText.startsWith('{')) {
    try {
      const o = JSON.parse(assistantText);
      ingestToolArray(o.toolCalls);
      ingestToolArray(o.tool_calls);
      if (typeof o.assistantText === 'string' && o.assistantText.trim()) assistantText = o.assistantText.trim();
      else if (o.tool_calls || o.toolCalls) assistantText = '';
    } catch {
      /* leave assistantText */
    }
  }

  assistantText = assistantText.replace(/```(?:\w*)\s*([\s\S]*?)```/g, (_, inner) => {
    const s = String(inner || '').trim();
    if (s.startsWith('{')) {
      try {
        const o = JSON.parse(s);
        ingestToolArray(o.toolCalls);
        ingestToolArray(o.tool_calls);
      } catch {
        /* noop */
      }
    }
    return '';
  });
  assistantText = assistantText.replace(/\n{3,}/g, '\n\n').trim();

  const uiCommands = normalizeUiCommands(p.uiCommands || p.ui_commands || []);

  return {
    assistantText,
    toolCalls: dedupeToolCalls(collected),
    uiCommands
  };
}

function assistantTextLooksLikeToolDump(t) {
  const s = String(t || '').trim();
  if (!s) return true;
  if (/^```/.test(s)) return true;
  if (/\{"tool_calls"\s*:/i.test(s) || /\{"toolCalls"\s*:/i.test(s)) return true;
  if (s === '(No response)') return true;
  return false;
}

function resolveNavigateRouteNameFromPrompt(promptLower) {
  const s = String(promptLower || '').toLowerCase();
  if (!s) return null;

  // Prefer more specific intents first.
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
  if (/\b(notification|notifications)\b/.test(s)) return 'Notifications';
  if (/\b(user manager|users)\b/.test(s)) return 'UserManager';
  if (/\b(credentials)\b/.test(s)) return 'Credentials';
  if (/\b(preferences)\b/.test(s)) return 'Preferences';
  if (/\b(account|profile|my account|account info)\b/.test(s)) return 'AccountInfo';
  if (/\b(schedule|calendar)\b/.test(s)) return 'Schedule';
  if (/\b(dashboard|home)\b/.test(s)) return 'Dashboard';

  return null;
}

function guessSchoolQueryFromPrompt(promptLower) {
  const raw = String(promptLower || '').toLowerCase();
  if (!raw) return '';
  return raw
    .replace(/\b(take me to|go to|navigate to|navigate|open|visit|show me|find)\b/g, ' ')
    .replace(/\b(the|a|an|please|could you|can you|for me)\b/g, ' ')
    .replace(/\b(school|schools|portal|portals|hub)\b/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * Parse natural-language date references in a prompt → YYYY-MM-DD.
 * Returns null if no date hint is present.
 */
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

  const days = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const m = s.match(/\b(this|next|on)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b|\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) {
    const dayName = (m[2] || m[3] || '').toLowerCase();
    const target = days[dayName];
    if (target != null) {
      const cur = startOfDay.getDay();
      let delta = (target - cur + 7) % 7;
      if (m[1] === 'next') delta = delta === 0 ? 7 : delta + 7;
      // "this monday" when today is wednesday → 5 days forward (next monday).
      // Spec: "this <day>" = nearest upcoming occurrence (or today if it matches).
      if (m[1] === 'this' && delta === 0) delta = 0;
      const t = new Date(startOfDay);
      t.setDate(t.getDate() + delta);
      return t.toISOString().slice(0, 10);
    }
  }

  // ISO date directly in prompt
  const iso = s.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];

  return null;
}

/**
 * Parse a casual time-of-day expression ("3pm", "9:30 am", "noon", "midnight",
 * "15:00") into "HH:MM" 24h. Returns null if it can't.
 */
function parseTimeOfDay(text) {
  const s = String(text || '').toLowerCase().trim();
  if (!s) return null;
  if (/^noon$/.test(s)) return '12:00';
  if (/^midnight$/.test(s)) return '00:00';
  // 24h "15:00" or "9:30"
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const hh = Math.min(23, Math.max(0, parseInt(m24[1], 10)));
    const mm = Math.min(59, Math.max(0, parseInt(m24[2], 10)));
    if (!s.match(/(am|pm|a\.m|p\.m)/)) {
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }
  }
  // 12h "3pm", "3:30pm", "9 am", "9:30 a.m."
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)$/);
  if (m12) {
    let hh = parseInt(m12[1], 10);
    const mm = m12[2] ? parseInt(m12[2], 10) : 0;
    const isPm = /^p/.test(m12[3]);
    if (hh < 1 || hh > 12) return null;
    if (hh === 12) hh = isPm ? 12 : 0;
    else if (isPm) hh += 12;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  return null;
}

/**
 * Convert "HH:MM" 24h to a Date object set to today (server local time).
 */
function todayWithLocalTime(hm) {
  const m = String(hm || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hh = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const mm = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  const d = new Date();
  d.setHours(hh, mm, 0, 0);
  return d;
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

/**
 * Find the most recent assistant turn in history that has cards attached.
 * Used to detect "we're in disambiguation mode and the user is selecting".
 */
function findLastAssistantCardsInHistory(history) {
  if (!Array.isArray(history)) return null;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h?.role === 'assistant' && Array.isArray(h.cards) && h.cards.length) {
      return h.cards;
    }
  }
  return null;
}

/**
 * If the previous assistant turn showed a list of cards, try to interpret
 * the current prompt as a selection or a "show them again" request.
 *
 * Returns:
 *   - { kind: 'select', toolCall }        → run openEntity for the chosen card
 *   - { kind: 'reshow', cards }           → re-display the same cards (no tool call)
 *   - null                                → not a disambiguation follow-up
 */
function tryDisambiguationFollowUp(prompt, history) {
  const cards = findLastAssistantCardsInHistory(history);
  if (!cards || !cards.length) return null;

  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower) return null;

  // Generic "show me/which/list them" follow-ups → re-show the same cards.
  if (/^(show( me|them| the (two|three|four|five|list|options?))?|list( them| the options?)?|which( are (they|the (two|three|four|five|options?))| ones?)?|what( are (they|the options?))?|options\??|\?+|huh\??|the (two|three|four|five|options?))$/i.test(lower)) {
    return { kind: 'reshow', cards };
  }

  // Numeric / ordinal selection: "1", "#2", "the first one", "second", "third"
  const ordMap = { first: 1, '1st': 1, one: 1, second: 2, '2nd': 2, two: 2, third: 3, '3rd': 3, three: 3, fourth: 4, '4th': 4, four: 4, fifth: 5, '5th': 5, five: 5 };
  const numMatch = lower.match(/^#?(\d+)$/) || lower.match(/^(?:the\s+)?(first|second|third|fourth|fifth|1st|2nd|3rd|4th|5th|one|two|three|four|five)(?:\s+one)?$/);
  if (numMatch) {
    const idx = (numMatch[1] && /^\d+$/.test(numMatch[1])) ? parseInt(numMatch[1], 10) : ordMap[numMatch[1]];
    if (idx && idx >= 1 && idx <= cards.length) {
      const card = cards[idx - 1];
      const openAction = (card.actions || []).find((a) => a?.toolCall?.name === 'openEntity');
      if (openAction?.toolCall) return { kind: 'select', toolCall: openAction.toolCall };
    }
  }

  // Token-overlap fuzzy match against card titles. Strip generic words first
  // so "twain elementary school" still uniquely picks "Twain Elementary".
  const GENERIC = new Set([
    'open', 'go', 'to', 'show', 'me', 'the', 'a', 'an', 'please', 'now',
    'school', 'schools', 'portal', 'portals', 'hub', 'elementary', 'middle',
    'high', 'upper', 'lower', 'academy', 'charter', 'institute', 'event',
    'events', 'program', 'programs', 'session', 'sessions', 'workshop',
    'workshops', 'profile', 'user', 'page', 'one'
  ]);
  const promptTokens = lower
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 2 && !GENERIC.has(t));

  if (!promptTokens.length) return null;

  const scored = cards.map((c, i) => {
    const title = String(c.title || '').toLowerCase();
    const titleTokens = new Set(
      title.replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean)
    );
    let hits = 0;
    for (const t of promptTokens) {
      if (titleTokens.has(t) || title.includes(t)) hits++;
    }
    return { idx: i, card: c, hits };
  });

  scored.sort((a, b) => b.hits - a.hits);
  const best = scored[0];
  const second = scored[1];

  // Require a clear winner: at least one matching distinctive token, and
  // strictly more matches than any other card.
  if (best.hits > 0 && (!second || best.hits > second.hits)) {
    const openAction = (best.card.actions || []).find((a) => a?.toolCall?.name === 'openEntity');
    if (openAction?.toolCall) return { kind: 'select', toolCall: openAction.toolCall };
  }

  return null;
}

/**
 * Pure deterministic intent router. Runs BEFORE the LLM. If it returns a list
 * of toolCalls, we skip the LLM entirely and execute them.
 *
 * Handles:
 *   - Explicit entity searches ("open X portal", "find Y event")
 *   - Generic page navigation ("take me to schedule")
 *
 * Returns null when the prompt is genuinely conversational and needs an LLM.
 */
function detectExplicitIntent({ prompt, allowedToolNames }) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower) return null;

  const hasAction = /\b(open|show|find|go to|take me to|navigate to|visit|search( for)?|look (up|for))\b/.test(lower);
  const dateHint = parseDateHintFromPrompt(lower);
  const today = new Date().toISOString().slice(0, 10);

  // ---- "Who uses CBT" / "who does EMDR" / "anyone who does play therapy" ----
  // Routes to findProvidersByApproach. The "approach" can be a known modality
  // (CBT, DBT, EMDR, ACT, IFS, etc.), a free-text specialty (trauma, ADHD), or
  // a longer phrase (cognitive behavioral therapy).
  if (allowedToolNames.has('findProvidersByApproach')) {
    const approachMatch =
      lower.match(/\b(?:who|anyone|any\s+providers?|any\s+staff|which\s+providers?|find\s+(?:a\s+|me\s+)?(?:provider|providers|therapist|therapists))\s+(?:that\s+|who\s+|do(?:es)?\s+|use[sd]?\s+|specializ(?:es|ing)\s+(?:in\s+)?|trained\s+in\s+|practice[sd]?\s+|offer[s]?\s+|with\s+(?:experience\s+(?:in|with)\s+)?)([a-zA-Z][\w\s&\-/().'+]{1,60}?)\??$/) ||
      lower.match(/\b(?:find|show|list|search\s+for)\s+(?:a\s+|me\s+a?\s*|all\s+|the\s+)?([a-zA-Z][\w\s&\-/().'+]{1,40})\s+(?:provider|providers|therapist|therapists|specialist|specialists)\b/);
    if (approachMatch) {
      let approach = approachMatch[1].trim()
        .replace(/^(the\s+|some\s+|any\s+)/, '')
        .replace(/\s+(?:therapy|approach|techniques?|methods?|modality|specialist|provider|therapist)$/i, '')
        .replace(/[.?!]+$/, '')
        .trim();
      if (approach.length >= 2 && approach.length <= 60) {
        return {
          intent: 'find_providers_by_approach',
          toolCalls: [{ name: 'findProvidersByApproach', args: { approach, limit: 25 } }]
        };
      }
    }
  }

  // ---- "Move my 3pm to 4pm" / "reschedule my 9:30am meeting to 10am" ----
  // More specific than the bulk push below — runs first.
  // Resolves the meeting via findMyMeetings({ atTimeHm }), then reschedules.
  if (allowedToolNames.has('rescheduleMeeting')) {
    const moveMatch =
      lower.match(/\b(?:move|reschedule|push|shift|change)\s+(?:my\s+|the\s+)?(?:meeting\s+at\s+)?(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)\s*(?:meeting|huddle|video chat|1\s*[-:on]\s*1)?\s+(?:to|→|->)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm|a\.m\.|p\.m\.)?)/);
    if (moveMatch) {
      const fromHm = parseTimeOfDay(moveMatch[1]);
      const toHm = parseTimeOfDay(moveMatch[2]);
      if (fromHm && toHm) {
        return {
          intent: 'reschedule_meeting_by_time',
          followUpRescheduleByTime: true,
          fromTimeHm: fromHm,
          toTimeHm: toHm,
          toolCalls: [{ name: 'findMyMeetings', args: { atTimeHm: fromHm } }]
        };
      }
    }
  }

  // ---- "Push everything 30 minutes" / "delay all my meetings 15 min" ----
  // Bulk shift everything remaining today. Requires an explicit time unit
  // (min/hour) so single-meeting moves like "move my 3pm to 4pm" don't match.
  // Positive = later, negative = earlier.
  if (allowedToolNames.has('pushTodaysRemainingMeetings')) {
    const pushMatch =
      lower.match(/\b(?:push|move|shift|delay|bump)\s+(?:all|every|everything|the\s+rest(?:\s+of\s+(?:the|my)\s+day)?|my\s+(?:remaining\s+)?meetings?|today'?s?\s+meetings?)\b[^0-9-]*?(-?\d{1,3})\s*(min(?:ute)?s?|m\b|hours?|hrs?|h\b)/) ||
      lower.match(/\bpush\s+everyone\s+(?:back|forward|out|up)\s+(\d{1,3})\s*(min(?:ute)?s?|m\b|hours?|hrs?|h\b)/);
    if (pushMatch) {
      let n = parseInt(pushMatch[1], 10);
      const unit = (pushMatch[2] || '').toLowerCase();
      if (/hour|hrs?|^h$/.test(unit)) n *= 60;
      if (/\b(earlier|sooner|forward|up)\b/.test(lower) && n > 0) n = -n;
      if (Number.isFinite(n) && n !== 0 && Math.abs(n) <= 600) {
        return {
          intent: 'push_todays_remaining',
          followUpPushTodaysRemaining: true,
          shiftMinutes: n,
          toolCalls: []
        };
      }
    }
  }

  // ---- "Cancel the meeting with Sarah" / "cancel my meeting w/ John" ----
  // Resolves the meeting via findMyMeetings({ withName }), then cancels via
  // the WRITE_ACTION confirmation card.
  if (
    allowedToolNames.has('cancelMeeting') &&
    allowedToolNames.has('findMyMeetings') &&
    /\b(cancel|kill|skip)\b/.test(lower)
  ) {
    const cancelWithMatch =
      lower.match(/\bcancel\s+(?:my\s+|the\s+)?(?:meeting|huddle|1\s*[-:on]\s*1|video chat|chat|call)?\s*(?:with|w\/)\s+(.+?)(?:\s+(?:please|today|now))?[.?!]?$/);
    if (cancelWithMatch) {
      const target = cancelWithMatch[1].trim().replace(/^(the\s+|a\s+)/, '');
      if (target && target.length >= 2 && target.length <= 80) {
        let reason = null;
        const reasonMatch = lower.match(/\b(?:because|reason[:\s]|since|due to)\s+(.{3,160})$/);
        if (reasonMatch) reason = reasonMatch[1].replace(/[.?!]+$/, '').trim();
        return {
          intent: 'cancel_meeting_with_person',
          followUpCancelMeetingWithPerson: true,
          withName: target,
          cancelReason: reason,
          toolCalls: [{ name: 'findMyMeetings', args: { withName: target } }]
        };
      }
    }
  }

  // ---- "Cancel the rest of my day" / "cancel all my remaining meetings" ----
  if (
    allowedToolNames.has('cancelTodaysRemainingMeetings') &&
    /\b(cancel|clear|wipe|kill)\b/.test(lower) &&
    (
      /\b(rest of (?:the |my )?day|remaining meetings?|all (?:my )?(?:meetings?|remaining meetings?)|everything (?:today|for today)|the day|my day)\b/.test(lower) ||
      /\b(?:i'?m sick|i am sick|going home|leaving early)\b/.test(lower)
    )
  ) {
    let reason = null;
    const reasonMatch = lower.match(/\b(?:because|reason[:\s]|since|due to)\s+(.{3,160})$/);
    if (reasonMatch) {
      reason = reasonMatch[1].replace(/[.?!]+$/, '').trim();
    } else if (/\b(?:i'?m sick|i am sick)\b/.test(lower)) {
      reason = 'Out sick';
    }
    return {
      intent: 'cancel_rest_of_day',
      followUpCancelRestOfDay: true,
      cancelReason: reason,
      toolCalls: []
    };
  }

  // ---- "Cancel my next meeting" / "cancel my meeting" ----
  if (
    allowedToolNames.has('cancelMeeting') &&
    allowedToolNames.has('findNextMeeting') &&
    /\b(cancel|kill)\b/.test(lower) &&
    /\b(meeting|huddle|1\s*[-:on]\s*1|video chat)\b/.test(lower) &&
    !/\b(rest of (?:the |my )?day|remaining|all (?:my )?meetings?)\b/.test(lower)
  ) {
    return {
      intent: 'cancel_next_meeting',
      followUpCancelNextMeeting: true,
      toolCalls: [{ name: 'findNextMeeting', args: {} }]
    };
  }

  // ---- "Start a meeting with X" / "let's meet with X" / "1:1 with X" ----
  // Resolves the target user via searchUsers; if exactly one match the
  // controller will hand the result to startMeeting (which becomes a
  // confirmation card via the WRITE_ACTION interception path).
  const startMeetingMatch = lower.match(
    /\b(?:start (?:a |an )?(?:meeting|video chat|video call|call|chat|1\s*[-:on]\s*1)|meet|chat|video chat|let'?s meet)\s+(?:with|w\/)\s+(.+?)(?:\s+(?:now|today|please|pls|asap|right now))?[.?!]?$/
  );
  if (startMeetingMatch && allowedToolNames.has('startMeeting') && allowedToolNames.has('searchUsers')) {
    const target = startMeetingMatch[1].trim().replace(/^(the\s+|a\s+)/, '');
    if (target && target.length >= 2 && target.length <= 80) {
      return {
        intent: 'start_meeting',
        followUpStartMeeting: true,
        toolCalls: [{ name: 'searchUsers', args: { query: target, limit: 5 } }]
      };
    }
  }

  // ---- "Open my workspace" / "today's workspace" / "what's active right now" ----
  if (
    allowedToolNames.has('openTodaysWorkspace') &&
    (
      /\b(workspace|active events?|what.*(?:active|going on|happening) (?:now|today|right now))\b/.test(lower) ||
      /\bopen.*today/.test(lower) && /\b(events?|sessions?|meetings?)\b/.test(lower)
    )
  ) {
    const activeOnly = /\b(now|right now|currently|active)\b/.test(lower);
    return {
      intent: 'todays_workspace',
      toolCalls: [{ name: 'openTodaysWorkspace', args: { dateYmd: dateHint || today, activeOnly } }]
    };
  }

  // ---- Question-shaped intents (ALWAYS use date "today" if no other hint) ----

  // "who has an opening for an intake today" / "anyone available for an intake friday"
  if (
    allowedToolNames.has('findIntakeOpenings') &&
    /\bintake\b/.test(lower) &&
    /\b(open|opening|openings|availab(le|ility)|free|slot|spot)\b/.test(lower)
  ) {
    let modality = 'ALL';
    if (/\bvirtual\b|\bonline\b|\btelehealth\b/.test(lower)) modality = 'VIRTUAL';
    else if (/\bin[- ]?person\b|\boffice\b/.test(lower)) modality = 'IN_PERSON';
    return {
      intent: 'find_intake_openings',
      toolCalls: [{ name: 'findIntakeOpenings', args: { dateYmd: dateHint || today, modality } }]
    };
  }

  // "what offices are open today" / "any sessions at the boca office today"
  if (
    allowedToolNames.has('getOfficeSchedule') &&
    /\boffice(s)?\b/.test(lower) &&
    /\b(open|sessions?|booked|using|scheduled|today|tomorrow|this|next|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/.test(lower)
  ) {
    // Pull a possible location query: words after "at the X office" or "at X"
    let locationQuery = '';
    const locMatch = lower.match(/\bat\s+(?:the\s+)?([a-z][a-z0-9\s-]{1,40}?)\s+(?:office|location|today|tomorrow|on|next|this|$)/);
    if (locMatch && locMatch[1]) locationQuery = locMatch[1].trim();
    return {
      intent: 'office_schedule',
      toolCalls: [{ name: 'getOfficeSchedule', args: { dateYmd: dateHint || today, locationQuery } }]
    };
  }

  // "who rsvp'd for friday's event" / "who said yes to the staff meeting"
  if (
    allowedToolNames.has('getEventResponses') &&
    /\b(rsvp|rsvp'?d|responded|said yes|saying yes|attending|attendance)\b/.test(lower)
  ) {
    // Try to extract an event name fragment after "for" or "to"
    const eventQueryMatch = lower.match(/\b(?:for|to)\s+(?:the\s+)?(?:this\s+|next\s+|last\s+)?(?:[a-z]+\s+)?([a-z][a-z0-9\s-]{2,60}?)(?:\s+event|\s+meeting|\s*\?|$)/);
    const eventQuery = (eventQueryMatch?.[1] || '').trim();
    return {
      intent: 'event_responses',
      toolCalls: [{ name: 'getEventResponses', args: { eventQuery, dateYmd: dateHint || undefined } }]
    };
  }

  // School portal / school org
  const schoolish =
    /\bportal\b/.test(lower) ||
    /\b(elementary|middle|high|academy|charter|institute)\b/.test(lower) ||
    /\bschool\b/.test(lower);

  // Event / program
  const eventish =
    /\b(event|events|program|programs|session|sessions|workshop|workshops)\b/.test(lower) &&
    !schoolish;

  if (schoolish && allowedToolNames.has('searchSchools')) {
    const q = guessSchoolQueryFromPrompt(lower);
    if (q) {
      return {
        intent: 'school_search',
        toolCalls: [{ name: 'searchSchools', args: { query: q, limit: 10 } }]
      };
    }
  }

  if (eventish && allowedToolNames.has('searchEvents')) {
    const q = guessEntityQueryFromPrompt(lower, ['event', 'events', 'program', 'programs', 'session', 'sessions', 'workshop', 'workshops']);
    if (q) {
      return {
        intent: 'event_search',
        toolCalls: [{ name: 'searchEvents', args: { query: q, limit: 10 } }]
      };
    }
  }

  // Generic page navigation: only if there's an action verb (don't hijack
  // questions like "what is the dashboard").
  if (hasAction && allowedToolNames.has('navigateTo')) {
    const routeName = resolveNavigateRouteNameFromPrompt(lower);
    if (routeName) {
      return {
        intent: 'page_navigate',
        toolCalls: [{ name: 'navigateTo', args: { routeName } }]
      };
    }
  }

  return null;
}

/**
 * Set of tool names that mutate data. We never auto-execute these in response
 * to a user's natural-language prompt — instead we build a confirmation card
 * and let the user click "Confirm" (which posts a clientAction.toolCall and
 * runs the tool through the explicit fast-path).
 */
const WRITE_ACTION_TOOLS = new Set([
  'createTask',
  'createHiringCandidate',
  'addHiringNote',
  'setHiringStage',
  'startMeeting',
  'cancelMeeting',
  'cancelTodaysRemainingMeetings',
  'rescheduleMeeting',
  'pushTodaysRemainingMeetings'
]);

function isWriteActionTool(name) {
  return WRITE_ACTION_TOOLS.has(String(name || ''));
}

const WRITE_ACTION_LABELS = {
  createTask: 'Create task',
  createHiringCandidate: 'Add hiring candidate',
  addHiringNote: 'Add hiring note',
  setHiringStage: 'Update hiring stage',
  startMeeting: 'Start meeting',
  cancelMeeting: 'Cancel meeting',
  cancelTodaysRemainingMeetings: 'Cancel rest of today',
  rescheduleMeeting: 'Reschedule meeting',
  pushTodaysRemainingMeetings: 'Push today\'s meetings'
};

const WRITE_ACTION_FIELD_LABELS = {
  taskType: 'Type',
  title: 'Title',
  description: 'Description',
  assignedToUserId: 'Assigned user id',
  assignedToRole: 'Assigned role',
  assignedToAgencyId: 'Agency id',
  dueDate: 'Due',
  referenceId: 'Reference id',
  documentActionType: 'Document action',
  candidateUserId: 'Candidate user id',
  stage: 'Stage',
  body: 'Note',
  source: 'Source',
  withUserId: 'With',
  durationMinutes: 'Duration (min)',
  reason: 'Reason',
  eventId: 'Meeting',
  newStartAt: 'New start',
  newEndAt: 'New end',
  shiftMinutes: 'Shift (min)'
};

/**
 * Build the confirmation card for a write-action tool call. Async so we can
 * pre-resolve human-readable display values (e.g. user name for startMeeting).
 */
async function buildConfirmationCardForWriteAction(req, toolCall) {
  const name = String(toolCall?.name || '');
  const args = toolCall?.args && typeof toolCall.args === 'object' ? toolCall.args : {};
  const label = WRITE_ACTION_LABELS[name] || `Run ${name}`;

  const details = {};

  let subtitle = 'Review and confirm — nothing has been changed yet';

  // Custom resolution per tool — runs before the generic loop so we can
  // overwrite raw ids with friendly labels.
  if (name === 'startMeeting' && args.withUserId) {
    try {
      const User = (await import('../models/User.model.js')).default;
      const u = await User.findById(Number(args.withUserId));
      if (u) {
        const fullName = [u.first_name, u.last_name].filter(Boolean).join(' ').trim() || u.email;
        details['With'] = `${fullName} (#${u.id})`;
      }
    } catch {
      // best-effort
    }
  }

  // cancelMeeting: replace the raw eventId with a friendly title + time + attendee count.
  if (name === 'cancelMeeting' && args.eventId) {
    try {
      const ProviderScheduleEvent = (await import('../models/ProviderScheduleEvent.model.js')).default;
      const ProviderScheduleEventAttendee = (await import('../models/ProviderScheduleEventAttendee.model.js')).default;
      const ev = await ProviderScheduleEvent.findById(Number(args.eventId));
      if (ev) {
        const start = ev.start_at ? new Date(ev.start_at) : null;
        const when = start && !isNaN(start.getTime())
          ? start.toLocaleString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: 'numeric', minute: '2-digit'
            })
          : '(no start time)';
        details['Meeting'] = `${ev.title} — ${when}`;
        try {
          const attendees = await ProviderScheduleEventAttendee.listByEventId(ev.id);
          const names = attendees
            .map((a) => [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || a.email)
            .filter(Boolean);
          if (names.length) {
            details['Will email'] = `${names.length} attendee${names.length === 1 ? '' : 's'} — ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}`;
          } else {
            details['Will email'] = 'No attendees on this meeting';
          }
        } catch {
          /* noop */
        }
        subtitle = 'This will cancel the meeting and email everyone.';
      }
    } catch {
      // best-effort
    }
  }

  // cancelTodaysRemainingMeetings: pre-resolve the list so the user knows
  // exactly what they're about to nuke.
  if (name === 'cancelTodaysRemainingMeetings') {
    try {
      const { listRemainingMeetingsForToday } = await import('../services/meetingCancellation.service.js');
      const meetings = await listRemainingMeetingsForToday({
        actorUserId: Number(req.user?.id || 0),
        agencyId: Number(req.body?.context?.agencyId || req.user?.agencyId || 0) || null
      });
      if (!meetings.length) {
        details['Meetings'] = 'You have no remaining meetings today — nothing will be cancelled.';
      } else {
        const lines = meetings.slice(0, 8).map((m) => {
          const t = m.start_at ? new Date(m.start_at) : null;
          const tt = t && !isNaN(t.getTime()) ? t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
          return `${tt} — ${m.title}`;
        });
        details['Meetings'] = `${meetings.length} meeting${meetings.length === 1 ? '' : 's'}: ${lines.join(' · ')}`;
        subtitle = 'This will cancel ALL of your remaining meetings today and email everyone.';
      }
    } catch {
      // best-effort
    }
  }

  // rescheduleMeeting: resolve eventId → friendly title + old time, format
  // newStartAt as a human-readable wall clock string.
  if (name === 'rescheduleMeeting' && args.eventId) {
    try {
      const ProviderScheduleEvent = (await import('../models/ProviderScheduleEvent.model.js')).default;
      const ProviderScheduleEventAttendee = (await import('../models/ProviderScheduleEventAttendee.model.js')).default;
      const ev = await ProviderScheduleEvent.findById(Number(args.eventId));
      if (ev) {
        const start = ev.start_at ? new Date(ev.start_at) : null;
        const oldWhen = start && !isNaN(start.getTime())
          ? start.toLocaleString('en-US', {
              weekday: 'short', month: 'short', day: 'numeric',
              hour: 'numeric', minute: '2-digit'
            })
          : '(no start time)';
        details['Meeting'] = `${ev.title} — was ${oldWhen}`;
        try {
          const attendees = await ProviderScheduleEventAttendee.listByEventId(ev.id);
          if (attendees.length) {
            const names = attendees.map((a) => [a.first_name, a.last_name].filter(Boolean).join(' ').trim() || a.email).filter(Boolean);
            details['Will email'] = `${names.length} attendee${names.length === 1 ? '' : 's'} — ${names.slice(0, 4).join(', ')}${names.length > 4 ? '…' : ''}`;
          }
        } catch { /* noop */ }
        subtitle = 'This will move the meeting and email everyone.';
      }
    } catch {
      // best-effort
    }
  }
  if (name === 'rescheduleMeeting' && args.newStartAt) {
    try {
      const d = new Date(String(args.newStartAt));
      if (!isNaN(d.getTime())) {
        details['New start'] = d.toLocaleString('en-US', {
          weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
        });
      }
    } catch { /* noop */ }
  }

  // pushTodaysRemainingMeetings: pre-list affected meetings.
  if (name === 'pushTodaysRemainingMeetings') {
    try {
      const { listRemainingMeetingsForToday } = await import('../services/meetingCancellation.service.js');
      const meetings = await listRemainingMeetingsForToday({
        actorUserId: Number(req.user?.id || 0),
        agencyId: Number(req.body?.context?.agencyId || req.user?.agencyId || 0) || null
      });
      const minutes = Math.trunc(Number(args.shiftMinutes || 0));
      const dir = minutes > 0 ? `later by ${minutes} min` : `earlier by ${Math.abs(minutes)} min`;
      if (!meetings.length) {
        details['Meetings'] = 'You have no remaining meetings today — nothing will be moved.';
      } else {
        const lines = meetings.slice(0, 8).map((m) => {
          const t = m.start_at ? new Date(m.start_at) : null;
          const tt = t && !isNaN(t.getTime()) ? t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : '';
          return `${tt} — ${m.title}`;
        });
        details['Meetings'] = `${meetings.length} meeting${meetings.length === 1 ? '' : 's'}: ${lines.join(' · ')}`;
        subtitle = `This will shift ALL ${meetings.length} remaining meeting${meetings.length === 1 ? '' : 's'} ${dir} and email everyone.`;
      }
    } catch {
      // best-effort
    }
  }

  for (const [k, v] of Object.entries(args)) {
    if (v == null || v === '') continue;
    const labelK = WRITE_ACTION_FIELD_LABELS[k] || k;
    if (details[labelK]) continue; // already resolved nicely
    details[labelK] = typeof v === 'object' ? JSON.stringify(v) : String(v).slice(0, 240);
  }

  // Sensible default for startMeeting if duration wasn't passed.
  if (name === 'startMeeting' && !details['Duration (min)']) {
    details['Duration (min)'] = '30';
  }

  return {
    kind: 'confirm',
    title: label,
    subtitle,
    details,
    actions: [
      { type: 'tool', label: 'Confirm', toolCall: { name, args } },
      { type: 'prefill', label: 'Cancel', prefillText: '' }
    ]
  };
}

function lastOkToolResult(toolResults, toolName) {
  for (let i = (toolResults || []).length - 1; i >= 0; i--) {
    const r = toolResults[i];
    if (r?.ok && r.tool === toolName) return r;
  }
  return null;
}

function dedupeNextActions(actions) {
  const seen = new Set();
  const out = [];
  for (const a of actions || []) {
    const type = String(a?.type || '').trim() || (a?.toolCall ? 'tool' : a?.prefillText ? 'prefill' : '');
    const label = String(a?.label || '').trim();
    const tc = a?.toolCall && typeof a.toolCall === 'object' ? a.toolCall : null;
    const name = String(tc?.name || '').trim();
    const args = tc?.args && typeof tc.args === 'object' ? tc.args : {};
    const prefillText = a?.prefillText == null ? '' : String(a.prefillText);
    if (!label) continue;
    if (type === 'tool' && !name) continue;
    if (type === 'prefill' && !String(prefillText || '').trim()) continue;
    const k = `${type}::${label}::${name}::${JSON.stringify(args)}::${prefillText}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (type === 'tool') out.push({ type: 'tool', label, toolCall: { name, args } });
    else if (type === 'prefill') out.push({ type: 'prefill', label, prefillText });
    else continue;
    if (out.length >= 8) break;
  }
  return out;
}

function buildNextActionsFromToolResults({ toolResults, allowedToolNames }) {
  const actions = [];
  const canOpen = allowedToolNames?.has?.('openEntity');
  const canNav = allowedToolNames?.has?.('navigateTo');
  const openedKinds = new Set(
    (toolResults || [])
      .filter((r) => r?.ok && r.tool === 'openEntity' && r.result?.kind)
      .map((r) => String(r.result.kind))
  );

  if (canOpen) {
    const schoolRes = lastOkToolResult(toolResults, 'searchSchools');
    const schools = schoolRes?.result?.results;
    if (Array.isArray(schools) && schools.length >= 1 && !openedKinds.has('school')) {
      for (const s of schools.slice(0, 6)) {
        if (s?.id == null) continue;
        const nm = String(s.name || '').trim() || 'School';
        actions.push({
          type: 'tool',
          label: `Open ${nm} portal`,
          toolCall: { name: 'openEntity', args: { kind: 'school', id: Number(s.id) } }
        });
      }
      if (canNav) {
        actions.push({ type: 'tool', label: 'Open School Portals Hub', toolCall: { name: 'navigateTo', args: { routeName: 'SchoolPortalsHub' } } });
        actions.push({
          type: 'prefill',
          label: 'Refine the school search…',
          prefillText: 'Find the school portal for '
        });
      }
    }

    const eventRes = lastOkToolResult(toolResults, 'searchEvents');
    const events = eventRes?.result?.results;
    if (Array.isArray(events) && events.length >= 1 && !openedKinds.has('event')) {
      for (const ev of events.slice(0, 6)) {
        if (ev?.id == null) continue;
        const title = String(ev.title || '').trim() || 'Event';
        actions.push({
          type: 'tool',
          label: `Open event: ${title}`,
          toolCall: { name: 'openEntity', args: { kind: 'event', id: Number(ev.id) } }
        });
      }
      if (canNav) {
        actions.push({
          type: 'tool',
          label: 'Open Program Events',
          toolCall: { name: 'navigateTo', args: { routeName: 'SkillBuildersProgramsEvents' } }
        });
        actions.push({
          type: 'prefill',
          label: 'Search events in a date range…',
          prefillText: 'Find program events between 2026-01-01 and 2026-01-31 called '
        });
      }
    }

    const userRes = lastOkToolResult(toolResults, 'searchUsers');
    const users = userRes?.result?.results;
    if (Array.isArray(users) && users.length >= 1 && !openedKinds.has('user')) {
      for (const u of users.slice(0, 6)) {
        if (u?.id == null) continue;
        const nm = String(u.name || u.email || '').trim() || 'User';
        actions.push({
          type: 'tool',
          label: `Open profile: ${nm}`,
          toolCall: { name: 'openEntity', args: { kind: 'user', id: Number(u.id) } }
        });
      }
      if (canNav) {
        actions.push({ type: 'tool', label: 'Open User Manager', toolCall: { name: 'navigateTo', args: { routeName: 'UserManager' } } });
      }
    }
  }

  if (canNav) {
    const ref = lastOkToolResult(toolResults, 'searchReferralDirectory');
    const entries = ref?.result?.entries;
    if (Array.isArray(entries) && entries.length > 0) {
      actions.push({
        type: 'tool',
        label: 'Open Referral Directory',
        toolCall: { name: 'navigateTo', args: { routeName: 'ReferralDirectory' } }
      });
      actions.push({
        type: 'prefill',
        label: 'Search referrals with different specialties…',
        prefillText: 'Find referrals for '
      });
    }
  }

  // "What next?" helpers for common tools (safe + personal)
  const myAct = lastOkToolResult(toolResults, 'listMyRecentActivity');
  if (myAct?.ok) {
    actions.push({ type: 'prefill', label: 'Show just my logins (last 7 days)', prefillText: 'Show my logins in the last 7 days' });
    actions.push({ type: 'prefill', label: 'Show what I did this week', prefillText: 'Show me what I did this week' });
  }

  const agencyAct = lastOkToolResult(toolResults, 'searchAgencyActivity');
  if (agencyAct?.ok && canNav) {
    actions.push({ type: 'tool', label: 'Open Audit Center', toolCall: { name: 'navigateTo', args: { routeName: 'AuditCenter' } } });
    actions.push({ type: 'prefill', label: 'Filter audit: password reset links (last 7 days)', prefillText: 'Who sent password reset links in the last 7 days?' });
  }

  return dedupeNextActions(actions);
}

function safeTitle(s, fallback = '') {
  const t = String(s ?? '').trim();
  return t || fallback;
}

function buildNextCardsFromToolResults({ toolResults, allowedToolNames }) {
  const canOpen = allowedToolNames?.has?.('openEntity');
  const canNav = allowedToolNames?.has?.('navigateTo');
  const cards = [];

  const pushCard = (c) => {
    if (!c || typeof c !== 'object') return;
    if (!c.title) return;
    const actions = Array.isArray(c.actions) ? dedupeNextActions(c.actions) : [];
    cards.push({
      kind: String(c.kind || '').trim() || 'card',
      title: safeTitle(c.title, ''),
      subtitle: c.subtitle == null ? '' : String(c.subtitle),
      details: c.details && typeof c.details === 'object' ? c.details : null,
      actions
    });
  };

  const schoolRes = lastOkToolResult(toolResults, 'searchSchools');
  const schools = schoolRes?.result?.results;
  if (Array.isArray(schools) && schools.length && canOpen) {
    for (const s of schools.slice(0, 6)) {
      const id = s?.id == null ? null : Number(s.id);
      if (!id) continue;
      const name = safeTitle(s.name, 'School');
      const portalPath = s.portalPath || (s.slug ? `/${s.slug}/admin/school-portals` : null);
      pushCard({
        kind: 'school',
        title: name,
        subtitle: portalPath ? 'School portal' : '',
        details: {
          slug: s.slug || null,
          portalPath: portalPath || null
        },
        actions: [
          { type: 'tool', label: 'Open portal', toolCall: { name: 'openEntity', args: { kind: 'school', id } } },
          ...(canNav ? [{ type: 'tool', label: 'School Portals Hub', toolCall: { name: 'navigateTo', args: { routeName: 'SchoolPortalsHub' } } }] : [])
        ]
      });
    }
  }

  const eventRes = lastOkToolResult(toolResults, 'searchEvents');
  const events = eventRes?.result?.results;
  if (Array.isArray(events) && events.length && canOpen) {
    for (const ev of events.slice(0, 6)) {
      const id = ev?.id == null ? null : Number(ev.id);
      if (!id) continue;
      const title = safeTitle(ev.title, 'Event');
      pushCard({
        kind: 'event',
        title,
        subtitle: 'Program event',
        details: {
          startsAtIso: ev.startsAtIso || null,
          endsAtIso: ev.endsAtIso || null,
          timezone: ev.timezone || null
        },
        actions: [
          { type: 'tool', label: 'Open event', toolCall: { name: 'openEntity', args: { kind: 'event', id } } },
          ...(canNav ? [{ type: 'tool', label: 'All Program Events', toolCall: { name: 'navigateTo', args: { routeName: 'SkillBuildersProgramsEvents' } } }] : [])
        ]
      });
    }
  }

  const userRes = lastOkToolResult(toolResults, 'searchUsers');
  const users = userRes?.result?.results;
  if (Array.isArray(users) && users.length && canOpen) {
    const canStartMeeting = allowedToolNames.has('startMeeting');
    for (const u of users.slice(0, 6)) {
      const id = u?.id == null ? null : Number(u.id);
      if (!id) continue;
      const name = safeTitle(u.name || u.email, 'User');
      pushCard({
        kind: 'user',
        title: name,
        subtitle: 'User profile',
        details: {
          email: u.email || null,
          role: u.role || null
        },
        actions: [
          { type: 'tool', label: 'Open profile', toolCall: { name: 'openEntity', args: { kind: 'user', id } } },
          ...(canStartMeeting ? [{
            type: 'tool',
            label: 'Start meeting',
            confirmRequest: true,
            toolCall: { name: 'startMeeting', args: { withUserId: id } }
          }] : []),
          ...(canNav ? [{ type: 'tool', label: 'User Manager', toolCall: { name: 'navigateTo', args: { routeName: 'UserManager' } } }] : [])
        ]
      });
    }
  }

  const fpaRes = lastOkToolResult(toolResults, 'findProvidersByApproach');
  const fpaProviders = fpaRes?.result?.providers;
  if (Array.isArray(fpaProviders) && fpaProviders.length && canOpen) {
    const canStartMeeting = allowedToolNames.has('startMeeting');
    for (const p of fpaProviders.slice(0, 8)) {
      const id = p?.id == null ? null : Number(p.id);
      if (!id) continue;
      pushCard({
        kind: 'user',
        title: safeTitle(p.name || p.email, 'Provider'),
        subtitle: `${p.matchedFieldLabel || 'Match'}: ${p.matchedOption || ''}`,
        details: {
          email: p.email || null,
          role: p.role || null
        },
        actions: [
          { type: 'tool', label: 'Open profile', toolCall: { name: 'openEntity', args: { kind: 'user', id } } },
          ...(canStartMeeting ? [{
            type: 'tool',
            label: 'Start meeting',
            confirmRequest: true,
            toolCall: { name: 'startMeeting', args: { withUserId: id } }
          }] : [])
        ]
      });
    }
  }

  const smRes = lastOkToolResult(toolResults, 'startMeeting');
  if (smRes?.result?.eventId) {
    const m = smRes.result;
    const time = String(m.startAt || '').slice(11, 16);
    pushCard({
      kind: 'event',
      title: m.title,
      subtitle: `Meeting with ${m.withUser?.name || 'them'} · ${time}`,
      details: {
        'Join URL': m.joinUrl,
        'Duration': `${m.durationMinutes} min`
      },
      actions: [
        {
          type: 'tool',
          label: 'Join now',
          toolCall: { name: 'openWorkspaceEvent', args: { eventId: Number(m.eventId) } }
        }
      ]
    });
  }

  const wsRes = lastOkToolResult(toolResults, 'openTodaysWorkspace');
  const wsEvents = wsRes?.result?.events;
  if (Array.isArray(wsEvents) && wsEvents.length) {
    const canCancel = allowedToolNames.has('cancelMeeting');
    const canReschedule = allowedToolNames.has('rescheduleMeeting');
    for (const e of wsEvents.slice(0, 8)) {
      const id = e?.id == null ? null : Number(e.id);
      if (!id) continue;
      const time = e.allDay
        ? '(all day)'
        : `${String(e.startAt || '').slice(11, 16)}–${String(e.endAt || '').slice(11, 16)}`;
      const subtitle = `${e.kind || 'EVENT'} · ${time}${e.active ? ' · active now' : ''}`;
      const isMeeting = e.kind === 'TEAM_MEETING' || e.kind === 'HUDDLE';
      const startHm = String(e.startAt || '').slice(11, 16);
      pushCard({
        kind: 'event',
        title: safeTitle(e.title, e.kind || 'Event'),
        subtitle,
        actions: [
          {
            type: 'tool',
            label: isMeeting ? 'Join meeting' : 'Open',
            toolCall: { name: 'openWorkspaceEvent', args: { eventId: id } }
          },
          ...(isMeeting && canReschedule && startHm ? [{
            type: 'prefill',
            label: 'Reschedule',
            prefillText: `Move my ${startHm} to `
          }] : []),
          ...(isMeeting && canCancel ? [{
            type: 'tool',
            label: 'Cancel',
            confirmRequest: true,
            toolCall: { name: 'cancelMeeting', args: { eventId: id } }
          }] : [])
        ]
      });
    }
  }

  const refRes = lastOkToolResult(toolResults, 'searchReferralDirectory');
  const entries = refRes?.result?.entries;
  if (Array.isArray(entries) && entries.length) {
    for (const e of entries.slice(0, 6)) {
      const name = safeTitle(e.name, 'Referral');
      const org = safeTitle(e.organizationName, '');
      const cat = safeTitle(e.category, '');
      const phone = safeTitle(e.phone, '');
      const subtitle = [org, cat].filter(Boolean).join(' · ');
      pushCard({
        kind: 'referral',
        title: name,
        subtitle,
        details: {
          phone: phone || null,
          website: e.website || null,
          email: e.email || null
        },
        actions: [
          ...(canNav ? [{ type: 'tool', label: 'Open Referral Directory', toolCall: { name: 'navigateTo', args: { routeName: 'ReferralDirectory' } } }] : []),
          { type: 'prefill', label: 'Refine referral search…', prefillText: 'Find referrals for ' }
        ]
      });
    }
  }

  // Keep cards small and avoid flooding the UI.
  return cards.slice(0, 8);
}

function buildAssistantReplyFromTools(assistantText, toolResults) {
  if (!assistantTextLooksLikeToolDump(assistantText)) return assistantText;

  const openedSchool = toolResults.some((x) => x?.ok && x.tool === 'openEntity' && x.result?.kind === 'school');
  const openedEvent = toolResults.some((x) => x?.ok && x.tool === 'openEntity' && x.result?.kind === 'event');
  const openedUser = toolResults.some((x) => x?.ok && x.tool === 'openEntity' && x.result?.kind === 'user');

  const lines = [];
  for (const r of toolResults) {
    if (!r?.ok) {
      if (r?.error?.message) lines.push(String(r.error.message));
      continue;
    }
    if (r.tool === 'searchSchools') {
      const list = r.result?.results || [];
      if (!list.length) lines.push('No schools in your agency matched that search. Try a different name or open the School Portals Hub to browse.');
      else if (list.length === 1 && openedSchool) {
        /* openEntity row already explains the navigation */
      } else if (list.length === 1) {
        lines.push(`Found: ${list[0].name}. Want to open it?`);
      } else {
        const names = list.map((x) => x.name).join(', ');
        lines.push(`Found ${list.length} schools matching that search — ${names}. Which one did you mean?`);
      }
    } else if (r.tool === 'searchEvents') {
      const list = r.result?.results || [];
      if (!list.length) lines.push('No program events matched that search. Try different keywords or open Program Events to browse.');
      else if (list.length === 1 && openedEvent) {
        /* openEntity covers it */
      } else if (list.length === 1) {
        lines.push(`Found event: ${list[0].title}. Want to open it?`);
      } else {
        const titles = list.map((x) => x.title).join(', ');
        lines.push(`Found ${list.length} events — ${titles}. Which one did you mean?`);
      }
    } else if (r.tool === 'searchUsers') {
      const list = r.result?.results || [];
      if (!list.length) lines.push('No users matched that search in your agency.');
      else if (list.length === 1 && openedUser) {
        /* openEntity covers it */
      } else if (list.length === 1) {
        lines.push(`Found: ${list[0].name || list[0].email || 'user'}. Want to open their profile?`);
      } else {
        const names = list.map((x) => x.name || x.email).join(', ');
        lines.push(`Found ${list.length} people — ${names}. Which profile did you want?`);
      }
    } else if (r.tool === 'openEntity') {
      const nm = r.result?.name || r.result?.title || '';
      const path = r.result?.path || '';
      lines.push(nm ? `Opened: ${nm}` : path ? `Opened: ${path}` : 'Opened the requested page.');
    } else if (r.tool === 'navigateTo') {
      lines.push(r.result?.path ? `Opened ${r.result.path}.` : 'Navigation updated.');
    } else if (r.tool === 'searchReferralDirectory') {
      const list = r.result?.entries || [];
      if (!list.length) {
        lines.push('No referral directory entries matched that search in your agency.');
      } else {
        const parts = list.slice(0, 15).map((e) => {
          const org = e.organizationName ? ` (${e.organizationName})` : '';
          const ph = e.phone ? ` — ${e.phone}` : '';
          const cat = e.category ? ` [${e.category}]` : '';
          const sp = e.specialties ? ` — ${String(e.specialties).slice(0, 140)}${String(e.specialties).length > 140 ? '…' : ''}` : '';
          return `• ${e.name || 'Entry'}${org}${cat}${ph}${sp}`;
        });
        lines.push(`Matches (${list.length}):\n${parts.join('\n')}`);
      }
    } else if (r.tool === 'listMyRecentActivity') {
      const rows = r.result?.rows || [];
      if (!rows.length) {
        lines.push('No recent activity found for you in that window.');
      } else {
        const header = `Your recent activity (${rows.length}${r.result?.since ? ` since ${r.result.since}` : ''}):`;
        const items = rows.slice(0, 15).map((row) => {
          const when = row.createdAt ? String(row.createdAt).replace('T', ' ').slice(0, 16) : '—';
          const label = row.actionLabel || row.actionType || 'Activity';
          const ip = row.ipAddress ? ` (${row.ipAddress})` : '';
          return `• ${when} — ${label}${ip}`;
        });
        lines.push(`${header}\n${items.join('\n')}`);
      }
    } else if (r.tool === 'searchAgencyActivity') {
      const rows = r.result?.rows || [];
      const total = Number(r.result?.total || rows.length);
      if (!rows.length) {
        lines.push('No matching activity rows found with those filters.');
      } else {
        const range = [r.result?.startDate, r.result?.endDate].filter(Boolean).join(' → ');
        const rangeSuffix = range ? ` (${range})` : '';
        const header = `Found ${total} matching row(s)${rangeSuffix}${total > rows.length ? `, showing ${rows.length}` : ''}:`;
        const items = rows.slice(0, 20).map((row) => {
          const when = row.createdAt ? String(row.createdAt).replace('T', ' ').slice(0, 16) : '—';
          const who = row.userEmail || row.userName || (row.userId ? `user #${row.userId}` : 'unknown user');
          const what = row.actionLabel || row.actionType || 'Activity';
          const ip = row.ipAddress ? ` @ ${row.ipAddress}` : '';
          return `• ${when} — ${who} — ${what}${ip}`;
        });
        lines.push(`${header}\n${items.join('\n')}`);
      }
    } else if (r.tool === 'getAgencyActivityStats') {
      const actions = r.result?.actions || [];
      if (!actions.length) {
        lines.push('No audit events in that window.');
      } else {
        const range = [r.result?.startDate, r.result?.endDate].filter(Boolean).join(' → ');
        const total = Number(r.result?.total || 0);
        const header = `Top ${actions.length} activity type(s) ${range ? `(${range})` : ''} — ${total} total:`;
        const items = actions.slice(0, 20).map((a) => `• ${a.actionLabel || a.actionType}: ${a.count}`);
        lines.push(`${header}\n${items.join('\n')}`);
      }
    } else if (r.tool === 'findProvidersByApproach') {
      const out = r.result || {};
      const providers = out.providers || [];
      const approach = out.approach || 'that approach';
      if (!providers.length) {
        lines.push(`No providers in your agency are tagged with "${approach}".`);
      } else if (providers.length === 1) {
        const p = providers[0];
        lines.push(`1 provider matches "${approach}": ${p.name} (${p.matchedFieldLabel}: ${p.matchedOption}).`);
      } else {
        lines.push(`${providers.length} providers match "${approach}". Pick one to open their profile or start a meeting.`);
      }
    } else if (r.tool === 'startMeeting') {
      const out = r.result || {};
      const who = out.withUser?.name || 'them';
      const when = String(out.startAt || '').slice(11, 16);
      lines.push(`Meeting with ${who} created (${when}). Share the link below or click "Join now" to enter the room.`);
    } else if (r.tool === 'cancelMeeting') {
      const out = r.result || {};
      if (out.alreadyCancelled) {
        lines.push(`That meeting was already cancelled. No emails sent.`);
      } else {
        const parts = [];
        parts.push(`Cancelled "${out.title || 'meeting'}".`);
        if (out.attendeesNotified || out.hostNotified) {
          const ct = (out.attendeesNotified || 0) + (out.hostNotified ? 1 : 0);
          parts.push(`Emailed ${ct} ${ct === 1 ? 'person' : 'people'}.`);
        } else {
          parts.push(`No cancellation emails went out (no attendees, or email is disabled for this agency).`);
        }
        lines.push(parts.join(' '));
      }
    } else if (r.tool === 'cancelTodaysRemainingMeetings') {
      const out = r.result || {};
      const cancelled = out.cancelledCount || 0;
      const totalEmails = (out.results || []).reduce(
        (acc, x) => acc + Number(x.attendeesNotified || 0) + (x.hostNotified ? 1 : 0),
        0
      );
      if (!cancelled) {
        lines.push(`You had no remaining meetings to cancel today.`);
      } else {
        lines.push(`Cancelled ${cancelled} ${cancelled === 1 ? 'meeting' : 'meetings'} for the rest of today and emailed ${totalEmails} ${totalEmails === 1 ? 'person' : 'people'}.`);
      }
    } else if (r.tool === 'findNextMeeting') {
      // Intentionally silent — used only as a resolver step.
    } else if (r.tool === 'findMyMeetings') {
      // Intentionally silent — used only as a resolver step.
    } else if (r.tool === 'rescheduleMeeting') {
      const out = r.result || {};
      const fmt = (iso) => {
        const d = iso ? new Date(iso) : null;
        return d && !isNaN(d.getTime())
          ? d.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
          : '';
      };
      const ct = (out.attendeesNotified || 0) + (out.hostNotified ? 1 : 0);
      const oldS = fmt(out.oldStartAt);
      const newS = fmt(out.newStartAt);
      const parts = [`Moved "${out.title || 'meeting'}"${oldS && newS ? ` from ${oldS} to ${newS}` : ''}.`];
      if (ct) parts.push(`Emailed ${ct} ${ct === 1 ? 'person' : 'people'}.`);
      else parts.push(`No reschedule emails went out (no other attendees, or email is disabled for this agency).`);
      lines.push(parts.join(' '));
    } else if (r.tool === 'pushTodaysRemainingMeetings') {
      const out = r.result || {};
      const shifted = out.shiftedCount || 0;
      const minutes = Math.trunc(Number(out.shiftMinutes || 0));
      const dir = minutes > 0 ? `${minutes} min later` : `${Math.abs(minutes)} min earlier`;
      const totalEmails = (out.results || []).reduce(
        (acc, x) => acc + Number(x.attendeesNotified || 0) + (x.hostNotified ? 1 : 0),
        0
      );
      if (!shifted) {
        lines.push(`You had no remaining meetings to move today.`);
      } else {
        lines.push(`Shifted ${shifted} ${shifted === 1 ? 'meeting' : 'meetings'} ${dir} and emailed ${totalEmails} ${totalEmails === 1 ? 'person' : 'people'}.`);
      }
    } else if (r.tool === 'openTodaysWorkspace') {
      const out = r.result || {};
      const events = out.events || [];
      const dateLabel = out.dateYmd || 'today';
      if (!events.length) {
        lines.push(`Nothing on your schedule for ${dateLabel}.`);
      } else if (events.length === 1) {
        const e = events[0];
        const time = e.allDay ? '(all day)' : `${String(e.startAt || '').slice(11, 16)}–${String(e.endAt || '').slice(11, 16)}`;
        lines.push(`One event for ${dateLabel}: "${e.title}" ${time} — opening it.`);
      } else {
        lines.push(`You have ${events.length} events on ${dateLabel} — pick one:`);
      }
    } else if (r.tool === 'createTask') {
      const t = r.result?.task || r.result;
      const id = t?.id ? `#${t.id}` : '';
      const title = t?.title ? ` "${t.title}"` : '';
      lines.push(`Created task ${id}${title}.`);
    } else if (r.tool === 'createHiringCandidate') {
      const c = r.result?.candidate || r.result;
      const name = c?.name || c?.firstName || '';
      lines.push(`Added hiring candidate${name ? ` ${name}` : ''}.`);
    } else if (r.tool === 'addHiringNote') {
      lines.push('Note added to candidate.');
    } else if (r.tool === 'setHiringStage') {
      const stage = r.result?.stage || r.result?.candidate?.stage;
      lines.push(stage ? `Updated hiring stage to "${stage}".` : 'Updated hiring stage.');
    } else if (r.tool === 'findIntakeOpenings') {
      const out = r.result || {};
      const list = out.results || [];
      const dateLabel = out.dateYmd || 'today';
      if (!list.length) {
        const modLabel = out.modality && out.modality !== 'ALL' ? ` ${out.modality.toLowerCase().replace('_', '-')}` : '';
        lines.push(`No providers have${modLabel} intake openings on ${dateLabel}.`);
      } else {
        const items = list.slice(0, 12).map((p) => {
          const mods = [];
          if (p.virtualSlotCount) mods.push(`${p.virtualSlotCount} virtual`);
          if (p.inPersonSlotCount) mods.push(`${p.inPersonSlotCount} in-person`);
          const earliest = p.earliestStartIso ? ` — earliest ${String(p.earliestStartIso).slice(11, 16)}` : '';
          return `• ${p.name}: ${mods.join(' + ')}${earliest}`;
        });
        lines.push(`${list.length} provider(s) with intake openings on ${dateLabel}:\n${items.join('\n')}`);
      }
    } else if (r.tool === 'getEventResponses') {
      const out = r.result || {};
      if (out.ambiguousEvents) {
        const opts = out.ambiguousEvents.map((e) => `• ${e.title} (${String(e.startsAt).slice(0, 16).replace('T', ' ')})`).join('\n');
        lines.push(`Multiple events match. Which one?\n${opts}`);
      } else if (!out.event) {
        lines.push(out.note || 'No matching event found.');
      } else {
        const ev = out.event;
        const when = String(ev.startsAt || '').slice(0, 16).replace('T', ' ');
        const responses = out.responses || [];
        const counts = out.counts || {};
        const countStr = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ');
        if (!responses.length) {
          lines.push(`No responses yet for "${ev.title}" (${when}).`);
        } else {
          const items = responses.slice(0, 25).map((p) => `• ${p.name} — ${p.responseLabel || p.responseKey}`);
          lines.push(`${responses.length} response(s) for "${ev.title}" (${when})${countStr ? ` — ${countStr}` : ''}:\n${items.join('\n')}`);
        }
      }
    } else if (r.tool === 'getOfficeSchedule') {
      const out = r.result || {};
      const offices = out.offices || [];
      const dateLabel = out.dateYmd || 'today';
      if (!offices.length) {
        lines.push(out.note || `No office locations to report on ${dateLabel}.`);
      } else {
        const open = offices.filter((o) => o.isOpen);
        if (!open.length) {
          lines.push(`No offices have any sessions scheduled on ${dateLabel}.`);
        } else {
          const items = open.slice(0, 12).map((o) => {
            const hours = o.firstStart && o.lastEnd
              ? ` (${String(o.firstStart).slice(11, 16)}–${String(o.lastEnd).slice(11, 16)})`
              : '';
            return `• ${o.name}: ${o.bookedSlots} booked, ${o.availableSlots} open${hours}`;
          });
          lines.push(`${open.length} office(s) active on ${dateLabel}:\n${items.join('\n')}`);
        }
      }
    } else if (r.tool === 'getMyPayrollSummary') {
      const pay = r.result;
      if (!pay || typeof pay !== 'object') {
        lines.push('No payroll summary is available.');
      } else {
        const lp = pay.lastPaycheck;
        if (lp) {
          const amt = Number(lp.totalPay || 0);
          const amtStr = Number.isFinite(amt) ? amt.toFixed(2) : String(lp.totalPay ?? '');
          lines.push(`Last paycheck: ${lp.periodStart || '?'}–${lp.periodEnd || '?'}, total $${amtStr}.`);
        } else {
          lines.push('No posted paycheck found for you in this agency yet.');
        }
        const lastNotes = pay.unpaidNotes?.lastPayPeriod;
        if (lastNotes) {
          const nn = Number(lastNotes.noNoteNotes || 0);
          const dr = Number(lastNotes.draftNotes || 0);
          if (nn || dr) {
            lines.push(
              `In that pay period you had ${nn} NO_NOTE row(s) and ${dr} unpaid draft documentation row(s) counted as non-payable.`
            );
          } else if (!lp) {
            /* no extra line */
          } else {
            lines.push('No unpaid NO_NOTE or non-payable draft rows in that pay period.');
          }
        }
      }
    }
  }
  const out = lines.filter(Boolean).join('\n\n');
  return out || 'Done.';
}

export const assist = async (req, res, next) => {
  try {
    const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
    const agentConfig = req.body?.agentConfig && typeof req.body.agentConfig === 'object' ? req.body.agentConfig : null;
    const prompt = String(req.body?.prompt || req.body?.message || '').trim();
    const clientToolCall =
      req.body?.clientAction?.toolCall && typeof req.body.clientAction.toolCall === 'object'
        ? req.body.clientAction.toolCall
        : null;
    if (!prompt && !clientToolCall) return res.status(400).json({ error: { message: 'prompt is required' } });

    const grounding = String(req.body?.grounding || '').trim().toLowerCase(); // 'google_search' | ''
    const wantsSearch = grounding === 'google_search';

    if (wantsSearch && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Google Search grounding is only available to super admins' } });
    }

    const started = Date.now();
    const allowedToolNames = new Set(getToolSchemasForUser(req.user, agentConfig).map((t) => t.name));

    // Fast path: UI-clickable "next action" buttons execute a single, explicit tool call.
    // No LLM call; still fully role-gated and scoped.
    if (clientToolCall) {
      const tc = toolCallEntryToNormalized(clientToolCall);
      if (!tc?.name) return res.status(400).json({ error: { message: 'Invalid clientAction.toolCall' } });
      if (!allowedToolNames.has(tc.name)) return res.status(403).json({ error: { message: 'Tool not allowed for your role' } });

      // Caller may request a confirmation card instead of immediate execution
      // for write actions (e.g. "Start meeting" button on a user search card).
      const wantsConfirm = req.body?.clientAction?.confirmRequest === true;
      if (wantsConfirm && isWriteActionTool(tc.name)) {
        const card = await buildConfirmationCardForWriteAction(req, tc);
        return res.json({
          assistantText: `I drafted this for you — review and click Confirm to proceed: ${card.title}`,
          uiCommands: [],
          toolCalls: [],
          toolResults: [],
          nextActions: [],
          nextCards: [card],
          runtime: 'client_action_confirm'
        });
      }

      try {
        const result = await executeToolCall({ req, toolCall: tc });
        const uiCommands = Array.isArray(result?.uiCommands) ? normalizeUiCommands(result.uiCommands) : [];
        const toolResults = [result];
        const assistantText = buildAssistantReplyFromTools('', toolResults);

        try {
          ActivityLogService.logActivity(
            {
              actionType: 'agent_tool_execute',
              userId: req.user?.id ?? null,
              agencyId: context?.agencyId ?? null,
              metadata: { tool: tc.name, runtime: 'client_action' }
            },
            req
          );
        } catch {
          // ignore
        }

        return res.json({
          assistantText: String(assistantText || '').trim() || 'Done.',
          uiCommands,
          toolCalls: [tc],
          toolResults,
          nextActions: [],
          nextCards: [],
          runtime: 'client_action'
        });
      } catch (e) {
        return res.status(400).json({ error: { message: e?.message || 'Action failed' } });
      }
    }

    const historyArr = Array.isArray(req.body?.history) ? req.body.history : [];

    // ---- Deterministic intent router (runs BEFORE the LLM) ----
    // The LLM is unreliable for entity-search routing — it hallucinates results
    // from prompt examples without ever calling tools. For any prompt whose
    // intent is unambiguous (entity search, navigation, disambiguation
    // selection), we resolve it directly against the DB and skip the LLM.

    // 1. Disambiguation follow-up: previous turn showed cards. Did the user
    //    select one (by name/number/ordinal) or ask to see them again?
    const followUp = tryDisambiguationFollowUp(prompt, historyArr);
    if (followUp) {
      const uiCommands = [];
      const toolResults = [];

      if (followUp.kind === 'select' && allowedToolNames.has(followUp.toolCall.name)) {
        try {
          const r = await executeToolCall({ req, toolCall: followUp.toolCall });
          toolResults.push(r);
          if (Array.isArray(r?.uiCommands) && r.uiCommands.length) {
            for (const cmd of normalizeUiCommands(r.uiCommands)) uiCommands.push(cmd);
          }
        } catch (e) {
          toolResults.push({ ok: false, tool: followUp.toolCall.name, error: { message: e?.message || 'Open failed' } });
        }
      }

      let assistantText = buildAssistantReplyFromTools('', toolResults);
      let nextCards = buildNextCardsFromToolResults({ toolResults, allowedToolNames });
      const nextActions = buildNextActionsFromToolResults({ toolResults, allowedToolNames });

      // Re-show case (or select that produced no openEntity result): use the
      // previously-shown cards from history.
      if ((!nextCards.length && followUp.kind === 'reshow') || (!toolResults.length && followUp.kind === 'reshow')) {
        nextCards = followUp.cards;
        assistantText = 'Here are the options — click one to open it:';
      }

      return res.json({
        assistantText: String(assistantText || '').trim() || 'Done.',
        uiCommands,
        toolCalls: followUp.kind === 'select' ? [followUp.toolCall] : [],
        toolResults,
        nextActions,
        nextCards,
        runtime: 'deterministic_followup'
      });
    }

    // 2. Explicit entity search / navigation intent.
    const explicit = detectExplicitIntent({ prompt, allowedToolNames });
    if (explicit) {
      const uiCommands = [];
      const toolResults = [];
      const skipOpenEntityKinds = new Set();

      for (const tc of explicit.toolCalls) {
        if (!allowedToolNames.has(tc.name)) continue;
        try {
          const r = await executeToolCall({ req, toolCall: tc });
          toolResults.push(r);
          if (tc.name === 'searchSchools' && (r?.result?.results?.length ?? 0) > 1) skipOpenEntityKinds.add('school');
          else if (tc.name === 'searchEvents' && (r?.result?.results?.length ?? 0) > 1) skipOpenEntityKinds.add('event');
          else if (tc.name === 'searchUsers' && (r?.result?.results?.length ?? 0) > 1) skipOpenEntityKinds.add('user');

          if (Array.isArray(r?.uiCommands) && r.uiCommands.length) {
            for (const cmd of normalizeUiCommands(r.uiCommands)) uiCommands.push(cmd);
          }
        } catch (e) {
          toolResults.push({ ok: false, tool: tc.name, error: { message: e?.message || 'Tool failed' } });
        }
      }

      // If a search returned exactly one result, auto-open it.
      const trySingleOpen = async (toolName, kind) => {
        if (skipOpenEntityKinds.has(kind)) return;
        const sr = toolResults.find((r) => r?.ok && r.tool === toolName);
        const list = sr?.result?.results;
        if (Array.isArray(list) && list.length === 1 && list[0]?.id != null && allowedToolNames.has('openEntity')) {
          try {
            const or = await executeToolCall({ req, toolCall: { name: 'openEntity', args: { kind, id: Number(list[0].id) } } });
            toolResults.push(or);
            if (Array.isArray(or?.uiCommands) && or.uiCommands.length) {
              for (const cmd of normalizeUiCommands(or.uiCommands)) uiCommands.push(cmd);
            }
          } catch {
            /* noop */
          }
        }
      };
      await trySingleOpen('searchSchools', 'school');
      await trySingleOpen('searchEvents', 'event');
      // For "start meeting with X" we DON'T auto-open a user profile;
      // instead the controller below converts a single match into a
      // startMeeting confirmation card.
      if (!explicit.followUpStartMeeting) {
        await trySingleOpen('searchUsers', 'user');
      }

      // openTodaysWorkspace: auto-open the single event if there's exactly one.
      const wsRes = toolResults.find((r) => r?.ok && r.tool === 'openTodaysWorkspace');
      const wsEvents = wsRes?.result?.events;
      if (Array.isArray(wsEvents) && wsEvents.length === 1 && allowedToolNames.has('openWorkspaceEvent')) {
        try {
          const or = await executeToolCall({
            req,
            toolCall: { name: 'openWorkspaceEvent', args: { eventId: Number(wsEvents[0].id) } }
          });
          toolResults.push(or);
          if (Array.isArray(or?.uiCommands) && or.uiCommands.length) {
            for (const cmd of normalizeUiCommands(or.uiCommands)) uiCommands.push(cmd);
          }
        } catch {
          /* noop */
        }
      }

      let assistantText = buildAssistantReplyFromTools('', toolResults);
      const nextActions = buildNextActionsFromToolResults({ toolResults, allowedToolNames });
      let nextCards = buildNextCardsFromToolResults({ toolResults, allowedToolNames });

      // "Start meeting with X" follow-up: if searchUsers returned exactly one
      // person, build the startMeeting confirmation card directly.
      if (explicit.followUpStartMeeting) {
        const sr = toolResults.find((r) => r?.ok && r.tool === 'searchUsers');
        const list = sr?.result?.results || [];
        if (!list.length) {
          assistantText = `I couldn't find anyone matching that name in your agency. Try a fuller name or check the spelling.`;
        } else if (list.length === 1 && allowedToolNames.has('startMeeting')) {
          const card = await buildConfirmationCardForWriteAction(req, {
            name: 'startMeeting',
            args: { withUserId: Number(list[0].id) }
          });
          nextCards = [card];
          assistantText = `Ready to start a meeting with ${list[0].name || list[0].email} — click Confirm to launch the room.`;
        } else {
          assistantText = `Multiple people match — pick who you want to meet with:`;
        }
      }

      // "Cancel my next meeting" follow-up: turn the findNextMeeting result
      // into a cancelMeeting confirmation card.
      if (explicit.followUpCancelNextMeeting) {
        const fr = toolResults.find((r) => r?.ok && r.tool === 'findNextMeeting');
        const next = fr?.result?.meeting;
        if (!next?.id) {
          assistantText = `You don't have any upcoming meetings scheduled today, so there's nothing to cancel.`;
          nextCards = [];
        } else {
          const card = await buildConfirmationCardForWriteAction(req, {
            name: 'cancelMeeting',
            args: { eventId: Number(next.id) }
          });
          nextCards = [card];
          assistantText = `Click Confirm to cancel your next meeting and email everyone.`;
        }
      }

      // "Cancel the meeting with X" follow-up: findMyMeetings({withName})
      // resolves the candidate; if exactly one, we build a cancelMeeting
      // confirmation card. Multiple matches → disambiguation cards.
      if (explicit.followUpCancelMeetingWithPerson) {
        const fr = toolResults.find((r) => r?.ok && r.tool === 'findMyMeetings');
        const list = fr?.result?.meetings || [];
        const who = explicit.withName || 'that person';
        if (!list.length) {
          assistantText = `I couldn't find an upcoming meeting today with ${who}. (Only TEAM_MEETING / HUDDLE rows where you're the host or an attendee count.)`;
          nextCards = [];
        } else if (list.length === 1) {
          const args = explicit.cancelReason
            ? { eventId: Number(list[0].id), reason: explicit.cancelReason }
            : { eventId: Number(list[0].id) };
          const card = await buildConfirmationCardForWriteAction(req, {
            name: 'cancelMeeting',
            args
          });
          nextCards = [card];
          assistantText = `Click Confirm to cancel your meeting with ${who} and email everyone.`;
        } else {
          // Multiple matches today — show one card per meeting so the user picks.
          nextCards = await Promise.all(list.slice(0, 5).map((m) =>
            buildConfirmationCardForWriteAction(req, {
              name: 'cancelMeeting',
              args: explicit.cancelReason
                ? { eventId: Number(m.id), reason: explicit.cancelReason }
                : { eventId: Number(m.id) }
            })
          ));
          assistantText = `You have ${list.length} meetings today involving ${who} — pick which one to cancel:`;
        }
      }

      // "Move my 3pm to 4pm" follow-up: findMyMeetings({atTimeHm}) resolves
      // the meeting; if exactly one, build a rescheduleMeeting confirmation
      // card targeting today + the new time.
      if (explicit.followUpRescheduleByTime) {
        const fr = toolResults.find((r) => r?.ok && r.tool === 'findMyMeetings');
        const list = fr?.result?.meetings || [];
        const fromLabel = explicit.fromTimeHm || '?';
        const toLabel = explicit.toTimeHm || '?';
        const newStart = todayWithLocalTime(explicit.toTimeHm);
        if (!list.length) {
          assistantText = `I couldn't find a meeting on your schedule today that starts at ${fromLabel}.`;
          nextCards = [];
        } else if (!newStart) {
          assistantText = `I understood the meeting at ${fromLabel} but couldn't parse the new time "${toLabel}".`;
          nextCards = [];
        } else if (list.length === 1) {
          const card = await buildConfirmationCardForWriteAction(req, {
            name: 'rescheduleMeeting',
            args: {
              eventId: Number(list[0].id),
              newStartAt: newStart.toISOString()
            }
          });
          nextCards = [card];
          assistantText = `Click Confirm to move "${list[0].title}" to ${newStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} and email everyone.`;
        } else {
          nextCards = await Promise.all(list.slice(0, 5).map((m) =>
            buildConfirmationCardForWriteAction(req, {
              name: 'rescheduleMeeting',
              args: { eventId: Number(m.id), newStartAt: newStart.toISOString() }
            })
          ));
          assistantText = `You have ${list.length} meetings starting at ${fromLabel} — pick which one to move:`;
        }
      }

      // "Push everything 30 minutes" follow-up: build the bulk shift card.
      if (explicit.followUpPushTodaysRemaining) {
        if (!allowedToolNames.has('pushTodaysRemainingMeetings')) {
          assistantText = `Rescheduling meetings isn't available for your role.`;
        } else {
          const args = { shiftMinutes: Number(explicit.shiftMinutes) };
          if (explicit.cancelReason) args.reason = explicit.cancelReason;
          const card = await buildConfirmationCardForWriteAction(req, {
            name: 'pushTodaysRemainingMeetings',
            args
          });
          const meetingsLine = card.details?.['Meetings'] || '';
          if (/no remaining meetings/i.test(meetingsLine)) {
            nextCards = [];
            assistantText = `You don't have any meetings left on your schedule today — nothing to move.`;
          } else {
            nextCards = [card];
            const minutes = Math.trunc(Number(explicit.shiftMinutes));
            const dir = minutes > 0 ? `${minutes} minutes later` : `${Math.abs(minutes)} minutes earlier`;
            assistantText = `Click Confirm to push everything left today ${dir} and email all attendees.`;
          }
        }
      }

      // "Cancel rest of day" follow-up: build the bulk cancellation card
      // (the builder pre-resolves the list of affected meetings).
      if (explicit.followUpCancelRestOfDay) {
        if (!allowedToolNames.has('cancelTodaysRemainingMeetings')) {
          assistantText = `Cancelling meetings isn't available for your role.`;
        } else {
          const cancelArgs = explicit.cancelReason ? { reason: explicit.cancelReason } : {};
          const card = await buildConfirmationCardForWriteAction(req, {
            name: 'cancelTodaysRemainingMeetings',
            args: cancelArgs
          });
          // If there are zero meetings, the card subtitle still says
          // "Review and confirm" but we should be honest about it instead.
          const meetingsLine = card.details?.['Meetings'] || '';
          if (/no remaining meetings/i.test(meetingsLine)) {
            nextCards = [];
            assistantText = `You don't have any meetings left on your schedule today — nothing to cancel.`;
          } else {
            nextCards = [card];
            assistantText = `Click Confirm to cancel everything left on your schedule today and email all attendees.`;
          }
        }
      }

      try {
        ActivityLogService.logActivity(
          {
            actionType: 'agent_assist',
            userId: req.user?.id ?? null,
            agencyId: context?.agencyId ?? null,
            metadata: {
              runtime: 'deterministic',
              intent: explicit.intent,
              toolCalls: explicit.toolCalls.length,
              uiCommands: uiCommands.length,
              latencyMs: Date.now() - started
            }
          },
          req
        );
      } catch {
        // ignore
      }

      return res.json({
        assistantText: String(assistantText || '').trim() || 'Done.',
        uiCommands,
        toolCalls: explicit.toolCalls,
        toolResults,
        nextActions,
        nextCards,
        runtime: 'deterministic'
      });
    }

    const { rawText, runtime } = await runAgentAssist({
      userId: req.user?.id || null,
      user: req.user,
      prompt,
      context,
      agentConfig,
      allowSearch: wantsSearch,
      history: historyArr
    });

    const parsed = safeParseAgentJson(rawText);
    const merged = mergeAssistParsedModelShape(parsed);
    let assistantText = String(merged.assistantText || '').trim();
    // Never trust model-supplied navigation/highlight; only successful tools may emit uiCommands.
    const uiCommands = [];
    let toolCalls = merged.toolCalls;

    const toolResults = [];
    // Tracks entity kinds where a search returned >1 result — block auto-open for those kinds
    // so the user always chooses via disambiguation cards rather than landing on the wrong page.
    const skipOpenEntityKinds = new Set();
    // Write-action tool calls intercepted from the LLM — surfaced as confirmation cards.
    const pendingWriteCards = [];

    for (const tc of toolCalls) {
      if (!allowedToolNames.has(tc.name)) {
        toolResults.push({ ok: false, tool: tc.name, error: { message: 'Tool not allowed for your role' } });
        continue;
      }

      // Never auto-execute write actions inferred from a natural-language prompt.
      // Convert them to a confirmation card the user must click "Confirm" on.
      if (isWriteActionTool(tc.name)) {
        const card = await buildConfirmationCardForWriteAction(req, tc);
        pendingWriteCards.push(card);
        continue;
      }

      // If the model tried to openEntity for a kind where search returned multiple results, skip it.
      if (tc.name === 'openEntity' && skipOpenEntityKinds.has(String(tc.args?.kind || ''))) {
        continue;
      }

      try {
        const result = await executeToolCall({ req, toolCall: tc });
        toolResults.push(result);

        // After a search, check if it returned multiple results — if so, guard that kind.
        if (tc.name === 'searchSchools' && (result?.result?.results?.length ?? 0) > 1) {
          skipOpenEntityKinds.add('school');
        } else if (tc.name === 'searchEvents' && (result?.result?.results?.length ?? 0) > 1) {
          skipOpenEntityKinds.add('event');
        } else if (tc.name === 'searchUsers' && (result?.result?.results?.length ?? 0) > 1) {
          skipOpenEntityKinds.add('user');
        }

        // Tools may emit uiCommands (e.g. openEntity returns a navigate command).
        if (Array.isArray(result?.uiCommands) && result.uiCommands.length) {
          for (const cmd of normalizeUiCommands(result.uiCommands)) {
            uiCommands.push(cmd);
          }
        }
        // Non-blocking audit logging (metadata only; do not log user prompt).
        try {
          ActivityLogService.logActivity(
            {
              actionType: 'agent_tool_execute',
              userId: req.user?.id ?? null,
              agencyId: context?.agencyId ?? null,
              metadata: {
                tool: tc.name,
                runtime
              }
            },
            req
          );
        } catch {
          // ignore
        }
      } catch (e) {
        toolResults.push({ ok: false, tool: tc.name, error: { message: e?.message || 'Tool failed' } });
      }
    }

    // If the user asked to open something and the model only searched, pick the
    // single unambiguous match and open it (avoids raw tool JSON in the UI).
    const promptLower = prompt.toLowerCase();
    const impliesNavigate = /\b(open|go to|visit|take me to|show me|navigate)\b/.test(promptLower);
    const hadOpenEntity = toolCalls.some((tc) => tc.name === 'openEntity');

    // Deterministic fallback: if the model returned no tools at all but the prompt
    // clearly implies navigation, try safe, role-gated tools to avoid dead-ends.
    if (impliesNavigate && toolCalls.length === 0) {
      // Extract any name-like query from the prompt to use as a search term.
      const schoolQuery = guessSchoolQueryFromPrompt(promptLower);

      // School portal detection: "portal" alone is enough — not requiring "school" keyword
      // since users say "Twain Elementary portal", "Lincoln portal", etc.
      const looksLikeEntityPortal =
        /\bportal\b/.test(promptLower) ||
        (/\b(school|elementary|middle|high|academy|charter|institute)\b/.test(promptLower));

      if (looksLikeEntityPortal && schoolQuery && allowedToolNames.has('searchSchools')) {
        try {
          const sr = await executeToolCall({ req, toolCall: { name: 'searchSchools', args: { query: schoolQuery, limit: 10 } } });
          toolResults.push(sr);
          if (Array.isArray(sr?.uiCommands) && sr.uiCommands.length) {
            for (const cmd of normalizeUiCommands(sr.uiCommands)) uiCommands.push(cmd);
          }
          const schools = sr?.result?.results;
          if (
            Array.isArray(schools) &&
            schools.length === 1 &&
            allowedToolNames.has('openEntity') &&
            schools[0]?.id != null
          ) {
            const or = await executeToolCall({
              req,
              toolCall: { name: 'openEntity', args: { kind: 'school', id: Number(schools[0].id) } }
            });
            toolResults.push(or);
            if (Array.isArray(or?.uiCommands) && or.uiCommands.length) {
              for (const cmd of normalizeUiCommands(or.uiCommands)) uiCommands.push(cmd);
            }
          }
          assistantText = '';
        } catch (e) {
          toolResults.push({ ok: false, tool: 'searchSchools', error: { message: e?.message || 'Search failed' } });
        }
      }

      // Generic page navigation ("take me to referrals") → navigateTo route whitelist.
      // Only run if no entity search returned any rows; otherwise we already have
      // disambiguation cards and navigating to a hub page would close the drawer.
      const hasSearchHits = toolResults.some(
        (r) => r?.ok && ['searchSchools', 'searchEvents', 'searchUsers'].includes(r.tool)
      );
      if (!uiCommands.length && !hasSearchHits && allowedToolNames.has('navigateTo')) {
        const routeName = resolveNavigateRouteNameFromPrompt(promptLower);
        if (routeName) {
          try {
            const nr = await executeToolCall({ req, toolCall: { name: 'navigateTo', args: { routeName } } });
            toolResults.push(nr);
            if (Array.isArray(nr?.uiCommands) && nr.uiCommands.length) {
              for (const cmd of normalizeUiCommands(nr.uiCommands)) uiCommands.push(cmd);
            }
            assistantText = '';
          } catch (e) {
            toolResults.push({ ok: false, tool: 'navigateTo', error: { message: e?.message || 'Navigation failed' } });
          }
        }
      }
    }

    if (impliesNavigate && !hadOpenEntity) {
      const tryOpen = async (kind, id) => {
        const extra = await executeToolCall({
          req,
          toolCall: { name: 'openEntity', args: { kind, id } }
        });
        toolResults.push(extra);
        if (Array.isArray(extra?.uiCommands) && extra.uiCommands.length) {
          for (const cmd of normalizeUiCommands(extra.uiCommands)) {
            uiCommands.push(cmd);
          }
        }
      };
      const schoolRes = toolResults.find((r) => r?.ok && r.tool === 'searchSchools');
      const schools = schoolRes?.result?.results;
      if (Array.isArray(schools) && schools.length === 1) {
        try {
          await tryOpen('school', schools[0].id);
        } catch (e) {
          toolResults.push({ ok: false, tool: 'openEntity', error: { message: e?.message || 'open failed' } });
        }
      } else {
        const eventRes = toolResults.find((r) => r?.ok && r.tool === 'searchEvents');
        const events = eventRes?.result?.results;
        if (Array.isArray(events) && events.length === 1) {
          try {
            await tryOpen('event', events[0].id);
          } catch (e) {
            toolResults.push({ ok: false, tool: 'openEntity', error: { message: e?.message || 'open failed' } });
          }
        } else {
          const userRes = toolResults.find((r) => r?.ok && r.tool === 'searchUsers');
          const users = userRes?.result?.results;
          if (Array.isArray(users) && users.length === 1) {
            try {
              await tryOpen('user', users[0].id);
            } catch (e) {
              toolResults.push({ ok: false, tool: 'openEntity', error: { message: e?.message || 'open failed' } });
            }
          }
        }
      }
    }

    assistantText = buildAssistantReplyFromTools(assistantText, toolResults);
    const nextActions = buildNextActionsFromToolResults({ toolResults, allowedToolNames });
    let nextCards = buildNextCardsFromToolResults({ toolResults, allowedToolNames });

    // Surface any intercepted write-action confirmations as cards.
    if (pendingWriteCards.length) {
      nextCards = [...pendingWriteCards, ...nextCards];
      const labels = pendingWriteCards.map((c) => c.title).join(', ');
      assistantText = `I drafted this for you — review and click Confirm to proceed: ${labels}`;
    }

    // Hallucination guard: if the LLM produced "Found N…" / "I see N…" / etc.
    // but no successful tool actually ran this turn, the answer is fabricated.
    // Replace with an honest fallback so the UI never displays invented results.
    const ranAnyTool = toolResults.some((r) => r?.ok);
    const looksFabricated = /\b(found|i (?:see|see that there are)|there are)\s+(\d+|two|three|four|five|six|seven|eight|nine|ten|several)\b/i.test(assistantText) ||
      /\bsearching\b|\blooking\b/i.test(assistantText);
    if (looksFabricated && !ranAnyTool && !nextCards.length) {
      assistantText =
        "I couldn't run that lookup — could you rephrase? Tip: try things like \"open Twain Elementary portal\", \"who has an intake opening today\", or \"what offices are open today\".";
    }

    // If the LLM responded without running any tools (e.g. it hallucinated
    // "Found 2 schools" from conversation history without re-searching), carry
    // forward the disambiguation cards from the most recent assistant turn in
    // history so the user always has something clickable.
    if (!nextCards.length && toolCalls.length === 0) {
      const historyArr = Array.isArray(req.body?.history) ? req.body.history : [];
      for (let i = historyArr.length - 1; i >= 0; i--) {
        const h = historyArr[i];
        if (h?.role === 'assistant' && Array.isArray(h.cards) && h.cards.length) {
          nextCards = h.cards;
          // Nudge the assistant text toward "here they are, click one" rather
          // than leaving the model's repeated "which one did you mean?" loop.
          if (!assistantText || /which one did you mean/i.test(assistantText)) {
            assistantText = `Here are the options I found — click one to open it:`;
          }
          break;
        }
      }
    }

    // Non-blocking audit logging for the request itself.
    try {
      ActivityLogService.logActivity(
        {
          actionType: 'agent_assist',
          userId: req.user?.id ?? null,
          agencyId: context?.agencyId ?? null,
          metadata: {
            runtime,
            toolCalls: toolCalls.length,
            uiCommands: uiCommands.length,
            latencyMs: Date.now() - started,
            grounded: wantsSearch
          }
        },
        req
      );
    } catch {
      // ignore
    }

    res.json({
      assistantText: String(assistantText || '').trim() || '(No response)',
      uiCommands,
      toolCalls,
      toolResults,
      nextActions,
      nextCards,
      runtime
    });
  } catch (e) {
    next(e);
  }
};

