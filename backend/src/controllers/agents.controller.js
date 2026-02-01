import ActivityLogService from '../services/activityLog.service.js';
import { runAgentAssist, safeParseAgentJson } from '../services/agents/agentRuntime.service.js';
import { executeToolCall } from '../services/agents/toolRegistry.service.js';

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

function normalizeToolCalls(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((t) => {
      const name = String(t?.name || t?.tool || '').trim();
      const args = t?.args && typeof t.args === 'object' ? t.args : {};
      if (!name) return null;
      return { name, args };
    })
    .filter(Boolean)
    .slice(0, 8); // hard cap for safety
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
      prompt,
      context,
      agentConfig,
      allowSearch: wantsSearch
    });

    const parsed = safeParseAgentJson(rawText);
    const assistantText = String(parsed?.assistantText || '').trim();
    const uiCommands = normalizeUiCommands(parsed?.uiCommands);
    const toolCalls = normalizeToolCalls(parsed?.toolCalls);

    const toolResults = [];
    for (const tc of toolCalls) {
      try {
        const result = await executeToolCall({ req, toolCall: tc });
        toolResults.push(result);
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
      assistantText: assistantText || '(No response)',
      uiCommands,
      toolCalls,
      toolResults,
      runtime
    });
  } catch (e) {
    next(e);
  }
};

