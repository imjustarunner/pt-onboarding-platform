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
      if (!list.length) lines.push('No schools in your agency matched that search.');
      else if (list.length === 1 && openedSchool) {
        /* openEntity row already explains the navigation */
      } else if (list.length === 1) {
        lines.push(`Found: ${list[0].name}. Say “open it” if you want the school portal.`);
      } else lines.push(`Found ${list.length} schools: ${list.map((x) => x.name).join(', ')}. Say which one to open.`);
    } else if (r.tool === 'searchEvents') {
      const list = r.result?.results || [];
      if (!list.length) lines.push('No program events matched that search.');
      else if (list.length === 1 && openedEvent) {
        /* openEntity covers it */
      } else if (list.length === 1) {
        lines.push(`Found event: ${list[0].title}. Say “open it” to open that event.`);
      } else lines.push(`Found ${list.length} events: ${list.map((x) => x.title).join('; ')}. Say which one to open.`);
    } else if (r.tool === 'searchUsers') {
      const list = r.result?.results || [];
      if (!list.length) lines.push('No users matched that search in your agency.');
      else if (list.length === 1 && openedUser) {
        /* openEntity covers it */
      } else if (list.length === 1) {
        lines.push(`Found: ${list[0].name || list[0].email || 'user'}. Say “open profile” to open them.`);
      } else lines.push(`Found ${list.length} people: ${list.map((x) => x.name || x.email).join(', ')}. Say which one to open.`);
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
    const prompt = String(req.body?.prompt || req.body?.message || '').trim();
    if (!prompt) return res.status(400).json({ error: { message: 'prompt is required' } });

    const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : {};
    const agentConfig = req.body?.agentConfig && typeof req.body.agentConfig === 'object' ? req.body.agentConfig : null;
    const grounding = String(req.body?.grounding || '').trim().toLowerCase(); // 'google_search' | ''
    const wantsSearch = grounding === 'google_search';

    if (wantsSearch && req.user?.role !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Google Search grounding is only available to super admins' } });
    }

    const started = Date.now();
    const { rawText, runtime } = await runAgentAssist({
      userId: req.user?.id || null,
      user: req.user,
      prompt,
      context,
      agentConfig,
      allowSearch: wantsSearch
    });

    const parsed = safeParseAgentJson(rawText);
    const merged = mergeAssistParsedModelShape(parsed);
    let assistantText = String(merged.assistantText || '').trim();
    // Never trust model-supplied navigation/highlight; only successful tools may emit uiCommands.
    const uiCommands = [];
    let toolCalls = merged.toolCalls;

    const allowedToolNames = new Set(getToolSchemasForUser(req.user, agentConfig).map((t) => t.name));

    const toolResults = [];
    for (const tc of toolCalls) {
      if (!allowedToolNames.has(tc.name)) {
        toolResults.push({ ok: false, tool: tc.name, error: { message: 'Tool not allowed for your role' } });
        continue;
      }
      try {
        const result = await executeToolCall({ req, toolCall: tc });
        toolResults.push(result);
        // Tools may emit uiCommands (e.g. openEntity returns a navigate command).
        // Merge them into the top-level uiCommands so the frontend executes them
        // alongside any commands the LLM included directly.
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
      runtime
    });
  } catch (e) {
    next(e);
  }
};

