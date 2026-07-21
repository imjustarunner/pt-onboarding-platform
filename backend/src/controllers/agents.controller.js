import ActivityLogService from '../services/activityLog.service.js';
import { runAgentAssist, safeParseAgentJson } from '../services/agents/agentRuntime.service.js';
import { executeToolCall, getToolSchemasForUser } from '../services/agents/toolRegistry.service.js';
import {
  buildCapabilityUiPayload,
  matchCatalogBackedPageNavigationIntent,
  matchDeterministicCapabilityIntent,
  matchProfileSectionJumpIntent,
  getCapabilityCatalogForTests,
  rankCorrectionChoices
} from '../services/agents/assistantCapabilityCatalog.service.js';
import {
  shouldAttemptAgencyResearch,
  researchAgencyKnowledge,
  buildResearchAssistantText,
  looksLikeServiceCodeQuery,
  extractServiceCodes,
  looksLikeBillingOrServiceCodeTopic
} from '../services/agents/assistantResearch.service.js';
import { isUserProfileContext } from '../../../frontend/src/navigation/profileSearchCatalog.js';
import { hasTenantAccess } from '../utils/meDashboardTenantScope.js';
import {
  insertAssistantRouteFeedback,
  clearPromotedSemanticExamplesCache,
  listAssistantAssistSignalsForAdmin,
  updateAssistantAssistSignalReviewStatus,
  countPendingAssistantAssistSignals
} from '../services/agents/assistantRouteFeedback.service.js';

function askAssistantAllowsVertex() {
  const v = String(process.env.ASK_ASSISTANT_ALLOW_VERTEX || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function withAssistFeedbackMeta(
  payload,
  { prompt, capabilityId, runtime, role, allowedToolNames, correctionChoices } = {}
) {
  const p = payload && typeof payload === 'object' ? payload : {};
  const capId = capabilityId ?? p.capabilityId ?? null;
  const promptText = String(prompt || '').trim().slice(0, 500) || null;
  let choices = Array.isArray(correctionChoices) ? correctionChoices : null;
  if (!choices && promptText && allowedToolNames) {
    choices = rankCorrectionChoices({
      prompt: promptText,
      role,
      allowedToolNames,
      excludeCapabilityId: capId,
      limit: 6
    });
  }
  return {
    ...p,
    capabilityId: capId,
    runtime: runtime ?? p.runtime ?? null,
    feedback: {
      prompt: promptText,
      capabilityId: capId,
      runtime: runtime ?? p.runtime ?? null,
      ...(choices?.length ? { correctionChoices: choices } : {})
    }
  };
}

/** HH:mm from Date, ISO string, or MySQL datetime — never raw String(date).slice(11,16). */
function formatHmFromDateish(value) {
  if (value == null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  if (/^\d{2}:\d{2}$/.test(s)) return s;
  const m = s.match(/(?:T|\s)(\d{2}:\d{2})(?::\d{2})?/);
  if (m) return m[1];
  return '';
}

function normalizeUiCommands(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((c) => {
      const type = String(c?.type || '').trim();
      if (!type) return null;
      if (type === 'navigate') return { type, to: String(c?.to || '').trim() };
      if (type === 'highlight') return { type, selector: String(c?.selector || '').trim() };
      if (type === 'profileJump') {
        return {
          type,
          tabId: String(c?.tabId || '').trim(),
          sectionId: String(c?.sectionId || '').trim(),
          clinicalSubTab: String(c?.clinicalSubTab || '').trim()
        };
      }
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
 *   - TF–IDF + Gemini catalog verify (when hard matchers miss)
 *
 * Returns null when the prompt is genuinely conversational and needs an LLM.
 */
async function detectExplicitIntent({ prompt, allowedToolNames, context, forceCapabilityId }) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower) return null;

  // On a user profile, prefer in-profile section jumps (equipment, licenses, …)
  // so short asks like "gear" don't need Vertex and scroll to the right block.
  if (!forceCapabilityId) {
    const profileJump = matchProfileSectionJumpIntent({ prompt: lower, context });
    if (profileJump) return profileJump;
  }

  // Capability-catalog fast path: high-frequency deterministic asks are
  // matched from a single shared registry used by both backend and frontend.
  const capabilityIntent = await matchDeterministicCapabilityIntent({
    prompt: lower,
    allowedToolNames,
    forceCapabilityId
  });
  if (capabilityIntent) return capabilityIntent;

  // Remaining fallback: generic page navigation, also owned by catalog service.
  // When already on a user profile, skip short page-nav that would yank the user
  // away to My Account / Schedule / etc. — those belong to profileJump above.
  const navIntent = matchCatalogBackedPageNavigationIntent({ prompt: lower, allowedToolNames });
  if (navIntent) {
    if (isUserProfileContext(context)) {
      const routeName = navIntent.toolCalls?.[0]?.args?.routeName;
      const leaveProfileOk = new Set([
        'GearInventory',
        'UserManager',
        'ReferralDirectory',
        'ClientManagement',
        'HiringCandidates',
        'AdminPayroll',
        'AuditCenter',
        'SchoolPortalsHub',
        'SkillBuildersProgramsEvents',
        'ProviderDirectory',
        'NoteAid',
        'ComplianceCorner',
        'PresenceTeamBoard',
        'ModuleManager',
        'TrainingKnowledgeBase'
      ]);
      // Stay on the profile unless they clearly asked for an admin hub page.
      if (!leaveProfileOk.has(routeName)) return null;
    }
    return navIntent;
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
    const type = String(a?.type || '').trim() || (a?.toolCall ? 'tool' : a?.prefillText ? 'prefill' : a?.copyText ? 'copy' : '');
    const label = String(a?.label || '').trim();
    const tc = a?.toolCall && typeof a.toolCall === 'object' ? a.toolCall : null;
    const name = String(tc?.name || '').trim();
    const args = tc?.args && typeof tc.args === 'object' ? tc.args : {};
    const prefillText = a?.prefillText == null ? '' : String(a.prefillText);
    const copyText = a?.copyText == null ? '' : String(a.copyText);
    if (!label) continue;
    if (type === 'tool' && !name) continue;
    if (type === 'prefill' && !String(prefillText || '').trim()) continue;
    if (type === 'copy' && !String(copyText || '').trim()) continue;
    const k = `${type}::${label}::${name}::${JSON.stringify(args)}::${prefillText}::${copyText}`;
    if (seen.has(k)) continue;
    seen.add(k);
    if (type === 'tool') out.push({ type: 'tool', label, toolCall: { name, args } });
    else if (type === 'prefill') out.push({ type: 'prefill', label, prefillText });
    else if (type === 'copy') out.push({ type: 'copy', label, copyText });
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
    const schoolRes = lastOkToolResult(toolResults, 'searchSchools')
      || lastOkToolResult(toolResults, 'getSchoolClientStats');
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
  const myTasks = lastOkToolResult(toolResults, 'listMyOpenTasks');
  if (myTasks?.ok && canNav) {
    actions.push({
      type: 'tool',
      label: 'Open Tasks',
      toolCall: { name: 'navigateTo', args: { routeName: 'Tasks' } }
    });
  }

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

  const officeSched = lastOkToolResult(toolResults, 'getOfficeSchedule');
  if (officeSched?.ok && allowedToolNames?.has?.('listOfficeRoster')) {
    const dateYmd = officeSched.result?.dateYmd || new Date().toISOString().slice(0, 10);
    const openOffices = (officeSched.result?.offices || []).filter((o) => o?.isOpen);
    if (openOffices.length === 1 && openOffices[0]?.name) {
      actions.push({
        type: 'tool',
        label: `Who is booked at ${openOffices[0].name}?`,
        toolCall: {
          name: 'listOfficeRoster',
          args: { dateYmd, locationQuery: String(openOffices[0].name) }
        }
      });
    } else {
      actions.push({
        type: 'tool',
        label: 'Who is booked in office?',
        toolCall: { name: 'listOfficeRoster', args: { dateYmd, locationQuery: '' } }
      });
    }
  }

  const smRes = lastOkToolResult(toolResults, 'startMeeting');
  if (smRes?.result?.eventId && allowedToolNames?.has?.('openWorkspaceEvent')) {
    actions.push({
      type: 'tool',
      label: 'Join now',
      toolCall: { name: 'openWorkspaceEvent', args: { eventId: Number(smRes.result.eventId) } }
    });
    const joinUrl = smRes.result.joinUrl || smRes.result.joinPath;
    if (joinUrl) {
      actions.push({ type: 'copy', label: 'Copy link', copyText: String(joinUrl) });
    }
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

  const schoolRes = lastOkToolResult(toolResults, 'searchSchools')
    || lastOkToolResult(toolResults, 'getSchoolClientStats');
  const schools = schoolRes?.result?.results;
  if (Array.isArray(schools) && schools.length && canOpen) {
    for (const s of schools.slice(0, 6)) {
      const id = s?.id == null ? null : Number(s.id);
      if (!id) continue;
      const name = safeTitle(s.name, 'School');
      const portalPath = s.portalPath || (s.slug ? `/${s.slug}/admin/school-portals` : null);
      const hasCounts = s.clientsActive != null || s.clientsCurrent != null || s.clientsOnRoster != null;
      const subtitle = hasCounts
        ? `Current ${Number(s.clientsActive ?? s.clientsCurrent ?? 0)} · Waitlist ${Number(s.clientsWaitlist || 0)} · On roster ${Number(s.clientsOnRoster || 0)}`
        : (portalPath ? 'School portal' : '');
      pushCard({
        kind: 'school',
        title: name,
        subtitle,
        details: {
          slug: s.slug || null,
          portalPath: portalPath || null,
          clientsActive: s.clientsActive ?? s.clientsCurrent ?? null,
          clientsWaitlist: s.clientsWaitlist ?? null,
          clientsOnRoster: s.clientsOnRoster ?? null,
          clientsPacket: s.clientsPacket ?? null,
          clientsScreener: s.clientsScreener ?? null
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
    for (const p of fpaProviders.slice(0, 25)) {
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

  const kbRes = lastOkToolResult(toolResults, 'searchTrainingKnowledgeBase');
  const kbHits = kbRes?.result?.hits;
  if (Array.isArray(kbHits) && kbHits.length) {
    for (const h of kbHits.slice(0, 6)) {
      const source = `${h.folder || 'handbook'}/${h.name || 'document'}`;
      const preview = (h.snippets && h.snippets[0]) || h.preview || '';
      pushCard({
        kind: 'policy',
        title: safeTitle(h.name, 'Policy document'),
        subtitle: `${h.folder || 'handbook'} · Training Knowledge Base`,
        details: {
          source,
          preview: preview ? String(preview).slice(0, 420) : null
        },
        actions: []
      });
    }
  }

  const smRes = lastOkToolResult(toolResults, 'startMeeting');
  if (smRes?.result?.eventId) {
    const m = smRes.result;
    const time = String(m.startAt || '').slice(11, 16);
    const joinUrl = m.joinUrl || m.joinPath || null;
    const actions = [
      {
        type: 'tool',
        label: 'Join now',
        toolCall: { name: 'openWorkspaceEvent', args: { eventId: Number(m.eventId) } }
      }
    ];
    if (joinUrl) {
      actions.push({ type: 'copy', label: 'Copy link', copyText: String(joinUrl) });
    }
    pushCard({
      kind: 'meeting',
      title: safeTitle(m.title, 'Meeting ready'),
      subtitle: `Meeting with ${m.withUser?.name || 'them'} · ${time}`,
      details: {
        joinUrl,
        joinPath: m.joinPath || null,
        durationMinutes: m.durationMinutes || null,
        withName: m.withUser?.name || null
      },
      actions
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

  // Standalone "What's my next meeting" button / tool path.
  const nextMeetingRes = lastOkToolResult(toolResults, 'findNextMeeting');
  const nextMeeting = nextMeetingRes?.result?.meeting;
  if (nextMeeting?.id && !cards.some((c) => c.kind === 'meeting' || c.kind === 'event')) {
    const id = Number(nextMeeting.id);
    const start = nextMeeting.startAt ? new Date(nextMeeting.startAt) : null;
    const when =
      start && !Number.isNaN(start.getTime())
        ? start.toLocaleString('en-US', {
            weekday: 'short',
            hour: 'numeric',
            minute: '2-digit'
          })
        : '';
    const attendeeNames = (nextMeeting.attendees || [])
      .map((a) => a?.name || a?.email)
      .filter(Boolean)
      .slice(0, 3);
    const canCancel = allowedToolNames.has('cancelMeeting');
    const canReschedule = allowedToolNames.has('rescheduleMeeting');
    const startHm = String(nextMeeting.startAt || '').slice(11, 16);
    pushCard({
      kind: 'meeting',
      title: safeTitle(nextMeeting.title, 'Next meeting'),
      subtitle: [nextMeeting.kind || 'TEAM_MEETING', when, attendeeNames.length ? `with ${attendeeNames.join(', ')}` : '']
        .filter(Boolean)
        .join(' · '),
      details: {
        startAt: nextMeeting.startAt || null,
        endAt: nextMeeting.endAt || null
      },
      actions: [
        {
          type: 'tool',
          label: 'Join meeting',
          toolCall: { name: 'openWorkspaceEvent', args: { eventId: id } }
        },
        ...(canReschedule && startHm
          ? [{ type: 'prefill', label: 'Reschedule', prefillText: `Move my ${startHm} to ` }]
          : []),
        ...(canCancel
          ? [{
              type: 'tool',
              label: 'Cancel',
              confirmRequest: true,
              toolCall: { name: 'cancelMeeting', args: { eventId: id } }
            }]
          : [])
      ]
    });
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
    } else if (r.tool === 'getSchoolClientStats') {
      const list = r.result?.results || [];
      if (!list.length) {
        lines.push(
          'No affiliated school matched that name. Try a shorter name, or open School Portals Hub / School Overview to browse affiliates.'
        );
      } else if (list.length === 1) {
        const s = list[0];
        const current = Number(s.clientsActive ?? s.clientsCurrent ?? 0);
        const waitlist = Number(s.clientsWaitlist || 0);
        const onRoster = Number(s.clientsOnRoster || 0);
        const packet = Number(s.clientsPacket || 0);
        const screener = Number(s.clientsScreener || 0);
        lines.push(
          `${s.name}: ${current} current (active) student${current === 1 ? '' : 's'}` +
            `, ${waitlist} on waitlist, ${onRoster} total on roster` +
            (packet || screener ? ` (packet ${packet}, screener ${screener})` : '') +
            '.'
        );
      } else {
        const parts = list.map((s) => {
          const current = Number(s.clientsActive ?? s.clientsCurrent ?? 0);
          return `${s.name}: ${current} current`;
        });
        lines.push(
          `Found ${list.length} matching schools — ${parts.join('; ')}. Which one did you mean?`
        );
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
      const lookupId = r.result?.lookupByUserId;
      if (!list.length) {
        lines.push(
          lookupId
            ? `No user #${lookupId} found in your agency.`
            : 'No users matched that search in your agency.'
        );
      } else if (list.length === 1 && openedUser) {
        const u = list[0];
        const role = u.role ? ` · ${u.role}` : '';
        const email = u.email ? ` · ${u.email}` : '';
        lines.push(`User #${u.id}: ${u.name || u.email || 'Unknown'}${role}${email}`);
      } else if (list.length === 1) {
        const u = list[0];
        const role = u.role ? ` · ${u.role}` : '';
        const email = u.email ? ` · ${u.email}` : '';
        lines.push(`User #${u.id}: ${u.name || u.email || 'Unknown'}${role}${email}`);
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
    } else if (r.tool === 'listMyOpenTasks') {
      const tasks = r.result?.tasks || [];
      if (!tasks.length) {
        lines.push('You have no open tasks right now.');
      } else {
        const items = tasks.slice(0, 20).map((t) => {
          const due = t.dueDate ? ` · due ${String(t.dueDate).slice(0, 10)}` : '';
          const urg = t.urgency && t.urgency !== 'medium' ? ` · ${t.urgency}` : '';
          const typ = t.taskType ? ` [${t.taskType}]` : '';
          return `• ${t.title || 'Task'}${typ}${due}${urg}`;
        });
        lines.push(`Your open tasks (${tasks.length}):\n${items.join('\n')}`);
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
    } else if (r.tool === 'searchTrainingKnowledgeBase') {
      const out = r.result || {};
      const hits = out.hits || [];
      const q = out.query || 'that topic';
      if (!out.totalDocuments) {
        lines.push(
          `I don’t see any handbook or policy documents uploaded for this agency yet. An admin can add them under Training Knowledge Base (handbook / policies).`
        );
      } else if (!hits.length) {
        lines.push(`I searched the workplace handbook and policies for “${q}” but didn’t find a clear match. Try different wording, or open the source docs from Training Knowledge Base.`);
      } else {
        const parts = [`Here’s what I found in your agency handbook / policies for “${q}”:`];
        for (const h of hits.slice(0, 5)) {
          const source = `${h.folder || 'handbook'}/${h.name || 'document'}`;
          const snips = (h.snippets && h.snippets.length ? h.snippets : [h.preview]).filter(Boolean);
          parts.push(`\n• ${source}`);
          for (const snip of snips.slice(0, 2)) {
            parts.push(`  ${String(snip)}`);
          }
        }
        parts.push(`\nSourced from uploaded Training Knowledge Base files — verify against the full document for decisions.`);
        lines.push(parts.join('\n'));
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
      const m = r.result?.meeting;
      if (!m) {
        lines.push("You don't have any upcoming meetings scheduled for the rest of today.");
      } else {
        const start = m.startAt ? new Date(m.startAt) : null;
        const when =
          start && !Number.isNaN(start.getTime())
            ? start.toLocaleString('en-US', {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
              })
            : 'soon';
        const attendeeNames = (m.attendees || [])
          .map((a) => a?.name || a?.email)
          .filter(Boolean)
          .slice(0, 4);
        const withLine = attendeeNames.length
          ? ` with ${attendeeNames.join(', ')}${(m.attendees || []).length > 4 ? '…' : ''}`
          : '';
        lines.push(`Your next meeting: "${m.title || 'Meeting'}" — ${when}${withLine}.`);
      }
    } else if (r.tool === 'findMyMeetings') {
      const list = r.result?.meetings || [];
      if (!list.length) {
        lines.push('No matching meetings found on your schedule for the rest of today.');
      } else if (list.length === 1) {
        const m = list[0];
        const start = m.startAt ? new Date(m.startAt) : null;
        const when =
          start && !Number.isNaN(start.getTime())
            ? start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
            : '';
        lines.push(`Found: "${m.title || 'Meeting'}"${when ? ` at ${when}` : ''}.`);
      } else {
        const parts = list.slice(0, 6).map((m) => {
          const start = m.startAt ? new Date(m.startAt) : null;
          const when =
            start && !Number.isNaN(start.getTime())
              ? start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
              : '';
          return `• ${when ? `${when} — ` : ''}${m.title || 'Meeting'}`;
        });
        lines.push(`Found ${list.length} meetings:\n${parts.join('\n')}`);
      }
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
        lines.push(`Nothing on your schedule for ${dateLabel} — your calendar looks open.`);
      } else if (events.length === 1) {
        const e = events[0];
        const time = e.allDay ? '(all day)' : `${String(e.startAt || '').slice(11, 16)}–${String(e.endAt || '').slice(11, 16)}`;
        lines.push(`One event for ${dateLabel}: "${e.title}" ${time}.`);
      } else {
        const ordered = events.slice(0, 8).map((e) => {
          const time = e.allDay
            ? 'all day'
            : `${String(e.startAt || '').slice(11, 16)}–${String(e.endAt || '').slice(11, 16)}`;
          return `• ${time} — ${e.title || e.kind || 'Event'}`;
        });
        lines.push(
          `You have ${events.length} events on ${dateLabel}. Suggested order (by start time):\n${ordered.join('\n')}`
        );
      }
    } else if (r.tool === 'listTeamPresence') {
      const out = r.result || {};
      const online = out.online || [];
      const away = out.away || [];
      const offline = out.offline || [];
      const nameQuery = String(out.nameQuery || '').trim();
      const people = out.people || [];
      if (nameQuery) {
        if (!people.length) {
          lines.push(`I couldn't find anyone matching "${nameQuery}" on your team presence roster.`);
        } else {
          for (const p of people.slice(0, 8)) {
            if (p.status === 'idle') {
              const dur = p.idle_for_label ? ` for ${p.idle_for_label}` : '';
              lines.push(`${p.name} is Idle${dur} (live Messages presence).`);
            } else if (p.status === 'online') {
              lines.push(`${p.name} is Active right now (live Messages presence).`);
            } else {
              lines.push(`${p.name} is Inactive / offline right now (live Messages presence).`);
            }
          }
        }
      } else if (!online.length && !away.length) {
        lines.push('No one on your team is online or away right now (based on live Messages presence).');
      } else {
        lines.push('Live team presence (Messages):');
        if (online.length) {
          lines.push(`\nActive (${online.length}):`);
          for (const p of online.slice(0, 20)) {
            lines.push(`• ${p.name}${p.status_label && p.status_label !== 'Active' ? ` — ${p.status_label}` : ''}`);
          }
        }
        if (away.length) {
          lines.push(`\nAway (${away.length}):`);
          for (const p of away.slice(0, 20)) {
            const dur = p.idle_for_label ? ` · ${p.idle_for_label}` : '';
            const back = p.expected_return_at
              ? (() => {
                  try {
                    return ` · back ${new Date(p.expected_return_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
                  } catch {
                    return '';
                  }
                })()
              : '';
            lines.push(`• ${p.name} — ${p.status_label || 'Away'}${dur}${back}`);
          }
        }
        if (offline.length && nameQuery) {
          /* already handled above */
        }
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
            const startHm = formatHmFromDateish(o.firstStart);
            const endHm = formatHmFromDateish(o.lastEnd);
            const hours = startHm && endHm ? ` (${startHm}–${endHm})` : '';
            return `• ${o.name}: ${o.bookedSlots} booked, ${o.availableSlots} open${hours}`;
          });
          lines.push(`${open.length} office(s) active on ${dateLabel}:\n${items.join('\n')}`);
        }
      }
    } else if (r.tool === 'listOfficeRoster') {
      const out = r.result || {};
      const people = out.people || [];
      const dateLabel = out.dateYmd || 'today';
      const loc = out.locationQuery ? ` at ${out.locationQuery}` : '';
      if (!people.length) {
        lines.push(out.note || `No one is booked or assigned in office${loc} on ${dateLabel}.`);
      } else {
        const items = people.slice(0, 40).map((p) => {
          const startHm = formatHmFromDateish(p.firstStart);
          const endHm = formatHmFromDateish(p.lastEnd);
          const hours = startHm && endHm ? ` ${startHm}–${endHm}` : '';
          const rooms = Array.isArray(p.rooms) && p.rooms.length
            ? ` · ${p.rooms.slice(0, 4).join(', ')}`
            : '';
          const slots = Number(p.slotCount || 0);
          const slotLabel = slots > 1 ? ` (${slots} slots)` : '';
          return `• ${p.name} — ${p.officeName}${hours}${rooms}${slotLabel}`;
        });
        const more = people.length > 40 ? `\n…and ${people.length - 40} more` : '';
        lines.push(
          `${people.length} people booked/assigned in office${loc} on ${dateLabel}:\n${items.join('\n')}${more}`
        );
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
  if (out) return out;
  // Never collapse a successful client-action tool into a bare "Done."
  const names = (toolResults || []).map((r) => r?.tool).filter(Boolean);
  if (names.length) {
    return `Finished ${names.join(', ')}, but there was nothing to display.`;
  }
  return 'Done.';
}

/** Tools used by Ask Assistant everyday buttons — must never reply with silent/Done-only text. */
export const ASSISTANT_QUICK_ACTION_TOOLS = [
  'openTodaysWorkspace',
  'listMyOpenTasks',
  'listTeamPresence',
  'findNextMeeting',
  'listMyRecentActivity',
  'findIntakeOpenings',
  'searchReferralDirectory',
  'navigateTo'
];

/** Test helper: ensure quick-action tools produce human-readable replies (never bare Done.). */
export function assertQuickActionToolsHaveReplies(buildReply = buildAssistantReplyFromTools) {
  const samples = {
    openTodaysWorkspace: { ok: true, tool: 'openTodaysWorkspace', result: { dateYmd: '2026-07-16', events: [] } },
    listMyOpenTasks: { ok: true, tool: 'listMyOpenTasks', result: { tasks: [], totalOpen: 0 } },
    listTeamPresence: { ok: true, tool: 'listTeamPresence', result: { online: [], away: [] } },
    findNextMeeting: { ok: true, tool: 'findNextMeeting', result: { meeting: null } },
    listMyRecentActivity: { ok: true, tool: 'listMyRecentActivity', result: { rows: [] } },
    findIntakeOpenings: { ok: true, tool: 'findIntakeOpenings', result: { dateYmd: '2026-07-16', results: [] } },
    searchReferralDirectory: { ok: true, tool: 'searchReferralDirectory', result: { entries: [] } },
    navigateTo: { ok: true, tool: 'navigateTo', result: { path: '/dashboard?tab=my_schedule' } }
  };
  const failures = [];
  for (const name of ASSISTANT_QUICK_ACTION_TOOLS) {
    const text = String(buildReply('', [samples[name]]) || '').trim();
    if (!text || text === 'Done.' || /^Finished /.test(text)) {
      failures.push(`${name}: got "${text || '(empty)'}"`);
    }
  }
  return failures;
}

function buildCapabilityPayloadForReq(req, agentConfig = null) {
  const allowedToolNames = new Set(getToolSchemasForUser(req.user, agentConfig).map((t) => t.name));
  const role = String(req.user?.role || '').toLowerCase().trim();
  const payload = buildCapabilityUiPayload({ role, allowedToolNames });
  return { payload, allowedToolNames };
}

function promptAsksForCapabilities(prompt) {
  const lower = String(prompt || '').toLowerCase().trim();
  if (!lower) return false;
  return (
    /\bwhat can you do\b/.test(lower) ||
    /\bwhat are you able to do\b/.test(lower) ||
    /\bwhat can i ask\b/.test(lower) ||
    /\bhelp me understand what you can do\b/.test(lower)
  );
}

function buildCapabilityHelpResponse(capabilityPayload) {
  const lines = [];
  for (const g of capabilityPayload.groups || []) {
    const prompts = (g.prompts || []).slice(0, 3).map((p) => `• ${p}`).join('\n');
    lines.push(`${g.title}:\n${prompts}`);
  }
  const intro =
    'I look things up in your agency tools and documents — not a free-form AI chat. Try one of these:';
  return {
    assistantText: lines.length
      ? `${intro}\n\n${lines.join('\n\n')}`
      : `${intro} open workspace, start a meeting, or ask about a handbook policy.`,
    uiCommands: [],
    toolCalls: [],
    toolResults: [],
    nextActions: [
      {
        type: 'prefill',
        label: 'Try one now',
        prefillText: capabilityPayload.inChatAction || 'Open my workspace for today'
      }
    ],
    nextCards: [],
    runtime: 'capability_help'
  };
}

async function runAgencyResearchAssistResponse({
  req,
  prompt,
  context,
  allowedToolNames,
  started,
  capabilityPayload
}) {
  const agencyId =
    Number(context?.agencyId || req.headers['x-agency-id'] || req.user?.agencyId || 0) || null;
  const research = await researchAgencyKnowledge({
    agencyId,
    query: prompt,
    canSearchTrainingKb: allowedToolNames.has('searchTrainingKnowledgeBase')
  });
  if (!research.hasHits) {
    const codes = extractServiceCodes(prompt);
    if (codes.length || looksLikeBillingOrServiceCodeTopic(prompt)) {
      const label = codes.length ? codes.join(', ') : 'those billing/service codes';
      return {
        assistantText:
          `I looked in your agency handbook, policies, and clinical knowledge for ${label} but didn’t find matching billing/code excerpts.\n\n` +
          `Class or program lesson plans won’t appear for code questions — ask about the class by name if that’s what you need.\n\n` +
          `Add a billing/service-code reference under Training Knowledge Base (or clinical KB), then ask again.`,
        uiCommands: [],
        toolCalls: [],
        toolResults: research.trainingToolResult ? [research.trainingToolResult] : [],
        nextActions: [
          {
            type: 'prefill',
            label: 'Open Training Knowledge Base',
            prefillText: 'Open Training Knowledge Base'
          }
        ],
        nextCards: [],
        runtime: 'agency_research_empty'
      };
    }
    return buildCapabilityHelpResponse(capabilityPayload);
  }

  const trainingHits = (research.hits || []).filter((h) => h.kind !== 'clinical');
  const clinicalHits = (research.hits || []).filter((h) => h.kind === 'clinical');
  const mergedHits = [
    ...trainingHits.map((h) => ({
      name: h.name,
      folder: h.folder || 'handbook',
      score: h.score,
      snippets: h.snippets || [],
      preview: h.preview || null
    })),
    ...clinicalHits.map((h) => ({
      name: h.name,
      folder: 'clinical',
      score: h.score,
      snippets: h.snippets || [],
      preview: h.preview || null
    }))
  ];
  const toolResults = [
    {
      ok: true,
      tool: 'searchTrainingKnowledgeBase',
      result: {
        query: prompt,
        totalDocuments: Math.max(
          research.trainingToolResult?.result?.totalDocuments || 0,
          mergedHits.length
        ),
        folders: ['handbook', 'policies', 'clinical'],
        hits: mergedHits
      }
    }
  ];
  let nextCards = buildNextCardsFromToolResults({ toolResults, allowedToolNames });
  if (!nextCards.length) {
    for (const h of research.hits.slice(0, 6)) {
      nextCards.push({
        kind: 'policy',
        title: String(h.name || 'Document'),
        subtitle: `${h.folder || h.kind || 'knowledge'} · Agency knowledge`,
        details: {
          source: `${h.folder || h.kind}/${h.name}`,
          preview: (h.snippets && h.snippets[0]) || h.preview || null
        },
        actions: []
      });
    }
  }
  try {
    ActivityLogService.logActivity(
      {
        actionType: 'agent_assist',
        userId: req.user?.id ?? null,
        agencyId: context?.agencyId ?? null,
        metadata: {
          runtime: 'agency_research',
          hits: research.hits.length,
          codes: extractServiceCodes(prompt),
          latencyMs: Date.now() - started
        }
      },
      req
    );
  } catch {
    /* ignore */
  }
  return {
    assistantText: String(buildResearchAssistantText(research) || '').trim() || 'Found matching documents.',
    uiCommands: [],
    toolCalls: [{ name: 'searchTrainingKnowledgeBase', args: { query: prompt, limit: 5 } }],
    toolResults,
    nextActions: [],
    nextCards,
    runtime: 'agency_research'
  };
}

export const getCapabilities = async (req, res, next) => {
  try {
    const agentConfig = req.body?.agentConfig && typeof req.body.agentConfig === 'object' ? req.body.agentConfig : null;
    const { payload } = buildCapabilityPayloadForReq(req, agentConfig);
    return res.json(payload);
  } catch (e) {
    return next(e);
  }
};

/**
 * Thumbs feedback, disengage signals, or optional correction.
 * When correctedCapabilityId is set on a thumbs-down, promotes the prompt
 * as a semantic example and tells the client to re-run.
 */
export const submitAssistFeedback = async (req, res, next) => {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const eventType = String(body.eventType || 'feedback').trim().toLowerCase() || 'feedback';
    if (!['feedback', 'disengage'].includes(eventType)) {
      return res.status(400).json({ error: { message: 'Invalid eventType' } });
    }

    const prompt = String(body.prompt || '').trim();
    const runtime = body.runtime == null ? null : String(body.runtime);
    const routedCapabilityId = body.capabilityId == null ? null : String(body.capabilityId);
    const correctedCapabilityId =
      body.correctedCapabilityId == null ? null : String(body.correctedCapabilityId).trim();
    const note = body.note == null ? null : String(body.note).trim();
    const assistantExcerpt =
      body.assistantExcerpt == null ? null : String(body.assistantExcerpt).trim().slice(0, 1500);
    const metadata =
      body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
        ? body.metadata
        : null;

    if (!prompt) return res.status(400).json({ error: { message: 'prompt is required' } });

    const knownIds = new Set(getCapabilityCatalogForTests().map((c) => c.id));
    if (correctedCapabilityId && !knownIds.has(correctedCapabilityId)) {
      return res.status(400).json({ error: { message: 'Unknown correctedCapabilityId' } });
    }

    const agencyId =
      parseInt(body.agencyId || req.headers['x-agency-id'] || req.user?.agencyId || 0, 10) || null;

    if (eventType === 'disengage') {
      const { id } = await insertAssistantRouteFeedback({
        agencyId: agencyId > 0 ? agencyId : null,
        userId: req.user?.id,
        eventType: 'disengage',
        prompt,
        helpful: null,
        runtime,
        routedCapabilityId,
        note: note || String(metadata?.reason || 'closed_without_engagement'),
        assistantExcerpt,
        reviewStatus: 'pending',
        metadata: {
          reason: metadata?.reason || 'closed_without_engagement',
          offeredActionCount: Number(metadata?.offeredActionCount || 0) || 0,
          offeredCardCount: Number(metadata?.offeredCardCount || 0) || 0,
          offeredActionLabels: Array.isArray(metadata?.offeredActionLabels)
            ? metadata.offeredActionLabels.slice(0, 12).map((x) => String(x).slice(0, 80))
            : [],
          msOpen: metadata?.msOpen != null ? Number(metadata.msOpen) : null,
          path: metadata?.path ? String(metadata.path).slice(0, 200) : null
        }
      });

      try {
        ActivityLogService.logActivity(
          {
            actionType: 'agent_assist_disengage',
            userId: req.user?.id ?? null,
            agencyId: agencyId > 0 ? agencyId : null,
            metadata: { feedbackId: id, capabilityId: routedCapabilityId }
          },
          req
        );
      } catch {
        /* ignore */
      }

      return res.json({ ok: true, id, eventType: 'disengage' });
    }

    const helpful = body.helpful === true || body.helpful === 1 || body.helpful === '1';
    const promoteAsExample = !helpful && Boolean(correctedCapabilityId);

    const { id } = await insertAssistantRouteFeedback({
      agencyId: agencyId > 0 ? agencyId : null,
      userId: req.user?.id,
      eventType: 'feedback',
      prompt,
      helpful,
      runtime,
      routedCapabilityId,
      correctedCapabilityId: correctedCapabilityId || null,
      note,
      promoteAsExample,
      assistantExcerpt,
      reviewStatus: helpful ? 'reviewed' : 'pending',
      metadata
    });

    if (promoteAsExample) clearPromotedSemanticExamplesCache();

    try {
      ActivityLogService.logActivity(
        {
          actionType: 'agent_assist_feedback',
          userId: req.user?.id ?? null,
          agencyId: agencyId > 0 ? agencyId : null,
          metadata: {
            helpful,
            capabilityId: routedCapabilityId,
            correctedCapabilityId: correctedCapabilityId || null,
            promoted: promoteAsExample,
            feedbackId: id
          }
        },
        req
      );
    } catch {
      /* ignore */
    }

    return res.json({
      ok: true,
      id,
      promoted: promoteAsExample,
      reroute: promoteAsExample,
      forceCapabilityId: promoteAsExample ? correctedCapabilityId : null
    });
  } catch (e) {
    return next(e);
  }
};

/** SuperAdmin: pending thumbs-down + disengage count */
export const getAssistReviewPendingCount = async (req, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }
    const count = await countPendingAssistantAssistSignals();
    return res.json({ count });
  } catch (e) {
    return next(e);
  }
};

/** SuperAdmin: list thumbs-down + disengage signals for training review */
export const listAssistReviewSignals = async (req, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }
    const q = req.query || {};
    const eventType = q.eventType ? String(q.eventType) : null;
    const disableQueue = q.reviewQueue === '0' || q.reviewQueue === 'false';
    const explicitQueue = q.reviewQueue === '1' || q.reviewQueue === 'true';
    // Default: review queue (pending thumbs-down + disengages). Pass eventType or reviewQueue=0 to browse freely.
    const useQueue = !disableQueue && (explicitQueue || !eventType);

    let reviewStatus = null;
    if (q.reviewStatus != null && String(q.reviewStatus) !== '') {
      reviewStatus = String(q.reviewStatus);
    } else if (useQueue) {
      reviewStatus = 'pending';
    }

    const result = await listAssistantAssistSignalsForAdmin({
      eventType: useQueue ? null : eventType,
      reviewStatus,
      helpful: q.helpful != null ? q.helpful : null,
      agencyId: q.agencyId ? parseInt(q.agencyId, 10) : null,
      dateFrom: q.dateFrom || null,
      dateTo: q.dateTo || null,
      reviewQueue: useQueue,
      limit: q.limit,
      offset: q.offset
    });
    return res.json(result);
  } catch (e) {
    return next(e);
  }
};

/** SuperAdmin: mark a signal reviewed / dismissed / pending */
export const patchAssistReviewSignal = async (req, res, next) => {
  try {
    if (req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Super admin access required' } });
    }
    const id = parseInt(req.params.id, 10);
    const reviewStatus = String(req.body?.reviewStatus || '').trim();
    const result = await updateAssistantAssistSignalReviewStatus({ id, reviewStatus });
    return res.json({ ok: true, ...result });
  } catch (e) {
    return next(e);
  }
};

export const assist = async (req, res, next) => {
  try {
    const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
    const agentConfig = req.body?.agentConfig && typeof req.body.agentConfig === 'object' ? req.body.agentConfig : null;
    const prompt = String(req.body?.prompt || req.body?.message || '').trim();
    const forceCapabilityId = String(req.body?.forceCapabilityId || '').trim() || null;
    const clientToolCallsRaw = Array.isArray(req.body?.clientAction?.toolCalls)
      ? req.body.clientAction.toolCalls
      : null;
    const clientToolCallSingle =
      req.body?.clientAction?.toolCall && typeof req.body.clientAction.toolCall === 'object'
        ? req.body.clientAction.toolCall
        : null;
    const clientToolCalls = (clientToolCallsRaw || (clientToolCallSingle ? [clientToolCallSingle] : []))
      .map((t) => toolCallEntryToNormalized(t))
      .filter(Boolean)
      .slice(0, 4);
    if (!prompt && !clientToolCalls.length) return res.status(400).json({ error: { message: 'prompt is required' } });

    // Enforce strict tenant scoping for agents/assist (critical for new tenants like Burning Sage)
    const agencyContextId = parseInt(context.agencyId || req.headers['x-agency-id'] || req.user?.agencyId || 0, 10);
    if (agencyContextId > 0 && !(await hasTenantAccess(req, agencyContextId))) {
      return res.status(403).json({ error: { message: 'Access denied to this tenant' } });
    }

    const grounding = String(req.body?.grounding || '').trim().toLowerCase(); // 'google_search' | ''
    const wantsSearch = grounding === 'google_search';

    if (wantsSearch && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Google Search grounding is only available to super admins' } });
    }

    const started = Date.now();
    const { payload: capabilityPayload, allowedToolNames } = buildCapabilityPayloadForReq(req, agentConfig);
    const assistFeedback = (payload, meta = {}) =>
      withAssistFeedbackMeta(payload, {
        role: req.user?.role,
        allowedToolNames,
        ...meta
      });

    if (promptAsksForCapabilities(prompt)) {
      return res.json(
        assistFeedback(buildCapabilityHelpResponse(capabilityPayload), {
          prompt,
          capabilityId: null,
          runtime: 'capability_help'
        })
      );
    }

    // Fast path: UI-clickable "next action" buttons execute explicit tool call(s).
    // No LLM call; still fully role-gated and scoped.
    if (clientToolCalls.length) {
      for (const tc of clientToolCalls) {
        if (!tc?.name) return res.status(400).json({ error: { message: 'Invalid clientAction.toolCall' } });
        if (!allowedToolNames.has(tc.name)) {
          return res.status(403).json({ error: { message: `Tool not allowed for your role: ${tc.name}` } });
        }
      }

      // Caller may request a confirmation card instead of immediate execution
      // for write actions (e.g. "Start meeting" button on a user search card).
      const wantsConfirm = req.body?.clientAction?.confirmRequest === true;
      if (wantsConfirm && clientToolCalls.length === 1 && isWriteActionTool(clientToolCalls[0].name)) {
        const card = await buildConfirmationCardForWriteAction(req, clientToolCalls[0]);
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
        const toolResults = [];
        const uiCommands = [];
        for (const tc of clientToolCalls) {
          const result = await executeToolCall({ req, toolCall: tc });
          toolResults.push(result);
          if (Array.isArray(result?.uiCommands) && result.uiCommands.length) {
            for (const cmd of normalizeUiCommands(result.uiCommands)) uiCommands.push(cmd);
          }
        }
        let assistantText = buildAssistantReplyFromTools('', toolResults);
        if (!String(assistantText || '').trim() || assistantText === 'Done.') {
          const errBits = toolResults
            .filter((r) => !r?.ok)
            .map((r) => r?.error?.message || `${r?.tool || 'tool'} failed`);
          assistantText = errBits.length
            ? errBits.join('\n')
            : `I ran ${clientToolCalls.map((t) => t.name).join(', ')} but got nothing to show.`;
        }
        // Write actions (e.g. startMeeting) need post-run cards — Join now / Copy link —
        // otherwise the success text references UI that never arrives.
        const nextCards = buildNextCardsFromToolResults({ toolResults, allowedToolNames });
        const nextActions = buildNextActionsFromToolResults({ toolResults, allowedToolNames });

        try {
          ActivityLogService.logActivity(
            {
              actionType: 'agent_tool_execute',
              userId: req.user?.id ?? null,
              agencyId: context?.agencyId ?? null,
              metadata: {
                tools: clientToolCalls.map((t) => t.name),
                runtime: 'client_action'
              }
            },
            req
          );
        } catch {
          // ignore
        }

        return res.json({
          assistantText: String(assistantText || '').trim(),
          uiCommands,
          toolCalls: clientToolCalls,
          toolResults,
          nextActions,
          nextCards,
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
    const explicit = await detectExplicitIntent({
      prompt,
      allowedToolNames,
      context,
      forceCapabilityId
    });
    if (explicit?.followUpAgencyResearch) {
      try {
        const payload = await runAgencyResearchAssistResponse({
          req,
          prompt: explicit.researchQuery || prompt,
          context,
          allowedToolNames,
          started,
          capabilityPayload
        });
        return res.json(
          assistFeedback(payload, {
            prompt: explicit.researchQuery || prompt,
            capabilityId: explicit.capabilityId || 'service_code_research',
            runtime: payload.runtime || 'agency_research'
          })
        );
      } catch (e) {
        console.warn('[assist] service-code research failed', e?.message || e);
        return res.json(
          assistFeedback(buildCapabilityHelpResponse(capabilityPayload), {
            prompt,
            capabilityId: null,
            runtime: 'capability_help'
          })
        );
      }
    }
    if (explicit) {
      const uiCommands = [];
      const toolResults = [];
      const skipOpenEntityKinds = new Set();

      if (Array.isArray(explicit.uiCommands) && explicit.uiCommands.length) {
        for (const cmd of normalizeUiCommands(explicit.uiCommands)) uiCommands.push(cmd);
      }

      for (const tc of explicit.toolCalls || []) {
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
      if (!explicit.followUpStartMeeting && !explicit.suppressUserAutoOpen) {
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

      let assistantText = explicit.assistantText
        || buildAssistantReplyFromTools('', toolResults);
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
        const usedGeminiRouter =
          Boolean(explicit.semanticRouted) &&
          (Boolean(explicit.geminiVerified) ||
            Boolean(explicit.geminiCorrected) ||
            Boolean(explicit.geminiRouterError));
        ActivityLogService.logActivity(
          {
            actionType: 'agent_assist',
            userId: req.user?.id ?? null,
            agencyId: context?.agencyId ?? null,
            metadata: {
              runtime: usedGeminiRouter ? 'gemini_catalog_router' : 'deterministic',
              intent: explicit.intent,
              capabilityId: explicit.capabilityId || null,
              toolCalls: (explicit.toolCalls || []).length,
              uiCommands: uiCommands.length,
              semanticRouted: Boolean(explicit.semanticRouted),
              geminiVerified: Boolean(explicit.geminiVerified),
              geminiCorrected: Boolean(explicit.geminiCorrected),
              geminiConfidence: explicit.geminiConfidence || null,
              semanticScore: explicit.semanticScore ?? null,
              tfidfTopId: explicit.tfidfTopId || null,
              latencyMs: Date.now() - started
            }
          },
          req
        );
      } catch {
        // ignore
      }

      return res.json(
        assistFeedback(
          {
            assistantText: String(assistantText || '').trim() || 'Done.',
            uiCommands,
            toolCalls: explicit.toolCalls || [],
            toolResults,
            nextActions,
            nextCards,
            runtime: explicit.semanticRouted && (explicit.geminiVerified || explicit.geminiCorrected)
              ? 'gemini_catalog_router'
              : explicit.forcedCapability
                ? 'feedback_reroute'
                : 'deterministic'
          },
          {
            prompt,
            capabilityId: explicit.capabilityId || null,
            runtime: explicit.semanticRouted && (explicit.geminiVerified || explicit.geminiCorrected)
              ? 'gemini_catalog_router'
              : explicit.forcedCapability
                ? 'feedback_reroute'
                : 'deterministic'
          }
        )
      );
    }

    // ---- No-LLM research fallback (Training KB + clinical KB) ----
    if (shouldAttemptAgencyResearch(prompt)) {
      try {
        const payload = await runAgencyResearchAssistResponse({
          req,
          prompt,
          context,
          allowedToolNames,
          started,
          capabilityPayload
        });
        if (payload.runtime !== 'capability_help') {
          return res.json(
            assistFeedback(payload, {
              prompt,
              capabilityId: null,
              runtime: payload.runtime || 'agency_research'
            })
          );
        }
        // Empty research with no service codes → fall through to capability help below.
        if (payload.runtime === 'agency_research_empty') {
          return res.json(
            assistFeedback(payload, {
              prompt,
              capabilityId: null,
              runtime: 'agency_research_empty'
            })
          );
        }
      } catch (e) {
        console.warn('[assist] agency research failed', e?.message || e);
      }
    }

    // Vertex is opt-in only — default is tool/data routing to avoid token abuse.
    if (!askAssistantAllowsVertex()) {
      try {
        ActivityLogService.logActivity(
          {
            actionType: 'agent_assist',
            userId: req.user?.id ?? null,
            agencyId: context?.agencyId ?? null,
            metadata: {
              runtime: 'capability_help',
              reason: 'vertex_disabled',
              latencyMs: Date.now() - started
            }
          },
          req
        );
      } catch {
        /* ignore */
      }
      return res.json(
        assistFeedback(buildCapabilityHelpResponse(capabilityPayload), {
          prompt,
          capabilityId: null,
          runtime: 'capability_help'
        })
      );
    }

    let rawText;
    let runtime;
    try {
      const ai = await runAgentAssist({
        userId: req.user?.id || null,
        user: req.user,
        prompt,
        context,
        agentConfig,
        allowSearch: wantsSearch,
        history: historyArr
      });
      rawText = ai.rawText;
      runtime = ai.runtime;
    } catch (e) {
      console.warn('[assist] Vertex unavailable', e?.message || e);
      return res.json(
        assistFeedback(buildCapabilityHelpResponse(capabilityPayload), {
          prompt,
          capabilityId: null,
          runtime: 'capability_help'
        })
      );
    }

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
        const navIntent = matchCatalogBackedPageNavigationIntent({ prompt: promptLower, allowedToolNames });
        const routeName = navIntent?.toolCalls?.[0]?.args?.routeName || null;
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
    let fallbackReason = '';
    const ranAnyTool = toolResults.some((r) => r?.ok);
    const looksFabricated = /\b(found|i (?:see|see that there are)|there are)\s+(\d+|two|three|four|five|six|seven|eight|nine|ten|several)\b/i.test(assistantText) ||
      /\bsearching\b|\blooking\b/i.test(assistantText);
    if (looksFabricated && !ranAnyTool && !nextCards.length) {
      fallbackReason = 'fabricated_no_tools';
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
            fallbackReason = fallbackReason || 'cards_from_history';
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
            grounded: wantsSearch,
            fallbackReason: fallbackReason || null
          }
        },
        req
      );
    } catch {
      // ignore
    }

    res.json(
      assistFeedback(
        {
          assistantText: String(assistantText || '').trim() || '(No response)',
          uiCommands,
          toolCalls,
          toolResults,
          nextActions,
          nextCards,
          runtime
        },
        {
          prompt,
          capabilityId: null,
          runtime
        }
      )
    );
  } catch (e) {
    next(e);
  }
};

