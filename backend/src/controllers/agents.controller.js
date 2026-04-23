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
  if (/\b(referral|referrals|referral directory)\b/.test(s)) return 'ReferralDirectory';
  if (/\b(client|clients|client management)\b/.test(s)) return 'ClientManagement';
  if (/\b(school portal|school portals|portals hub|school-portals)\b/.test(s)) return 'SchoolPortalsHub';
  if (/\b(program events|program event|skill builders|events)\b/.test(s)) return 'SkillBuildersProgramsEvents';
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
          ...(canNav ? [{ type: 'tool', label: 'User Manager', toolCall: { name: 'navigateTo', args: { routeName: 'UserManager' } } }] : [])
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

    const { rawText, runtime } = await runAgentAssist({
      userId: req.user?.id || null,
      user: req.user,
      prompt,
      context,
      agentConfig,
      allowSearch: wantsSearch,
      history: Array.isArray(req.body?.history) ? req.body.history : []
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

    for (const tc of toolCalls) {
      if (!allowedToolNames.has(tc.name)) {
        toolResults.push({ ok: false, tool: tc.name, error: { message: 'Tool not allowed for your role' } });
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
    const nextCards = buildNextCardsFromToolResults({ toolResults, allowedToolNames });

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

