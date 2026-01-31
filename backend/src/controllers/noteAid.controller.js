import { validationResult } from 'express-validator';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import ActivityLogService from '../services/activityLog.service.js';
import { getPublicNoteAidTools, getNoteAidToolById } from '../config/noteAidTools.js';

function parseFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return {};
}

function isTruthyFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

async function requireNoteAidEnabled(req, res, agencyId) {
  try {
    const agency = await Agency.findById(agencyId);
    const flags = parseFlags(agency?.feature_flags);
    const enabled = isTruthyFlag(flags?.noteAidEnabled);
    if (!enabled) {
      res.status(403).json({ error: { message: 'Note Aid is disabled for this organization' } });
      return false;
    }
    return true;
  } catch {
    res.status(403).json({ error: { message: 'Note Aid is disabled for this organization' } });
    return false;
  }
}

async function requireUserHasAgencyAccess(req, res, agencyId) {
  const roleNorm = String(req.user?.role || '').toLowerCase();
  if (roleNorm === 'super_admin') return true;

  const userId = req.user?.id;
  if (!userId) {
    res.status(401).json({ error: { message: 'Not authenticated' } });
    return false;
  }

  const agencies = await User.getAgencies(userId);
  const ids = (agencies || []).map((a) => Number(a?.id)).filter((n) => Number.isFinite(n));
  if (!ids.includes(Number(agencyId))) {
    res.status(403).json({ error: { message: 'You do not have access to this agency' } });
    return false;
  }
  return true;
}

function buildPrompt({ tool, inputText }) {
  const header = [
    tool?.systemPrompt || '',
    '',
    tool?.outputInstructions ? `Output instructions:\n${tool.outputInstructions}` : '',
    '',
    'User input:',
    String(inputText || '')
  ]
    .filter(Boolean)
    .join('\n');
  return header;
}

async function callGeminiText({ prompt, temperature = 0.2, maxOutputTokens = 800 }) {
  const apiKey = process.env.GEMINI_API_KEY || '';
  if (!apiKey) {
    const err = new Error('GEMINI_API_KEY is not configured');
    err.status = 503;
    throw err;
  }

  const modelName = String(process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim() || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    modelName
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const started = Date.now();
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: String(prompt || '') }] }],
      generationConfig: {
        temperature,
        maxOutputTokens
      }
    })
  });

  const latencyMs = Date.now() - started;

  if (!resp.ok) {
    const t = await resp.text();
    const err = new Error('Gemini request failed');
    err.status = 502;
    err.details = String(t || '').slice(0, 1000);
    err.latencyMs = latencyMs;
    throw err;
  }

  const data = await resp.json();
  const parts = data?.candidates?.[0]?.content?.parts;
  const text =
    Array.isArray(parts) ? parts.map((p) => p?.text || '').filter(Boolean).join('') : parts?.text || '';

  if (!text) {
    const err = new Error('Gemini returned empty response');
    err.status = 502;
    err.latencyMs = latencyMs;
    throw err;
  }

  return { text: String(text), modelName, latencyMs };
}

export const listNoteAidTools = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseInt(req.query.agencyId, 10);
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireNoteAidEnabled(req, res, agencyId))) return;

    res.json({ tools: getPublicNoteAidTools() });
  } catch (e) {
    next(e);
  }
};

export const executeNoteAidTool = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseInt(req.body.agencyId, 10);
    const toolId = String(req.body.toolId || '').trim();
    const inputText = String(req.body.inputText || '').trim().slice(0, 12000); // cap payload

    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireNoteAidEnabled(req, res, agencyId))) return;

    const tool = getNoteAidToolById(toolId);
    if (!tool) {
      return res.status(400).json({ error: { message: 'Invalid toolId' } });
    }

    const prompt = buildPrompt({ tool, inputText });

    const started = Date.now();
    const { text, modelName, latencyMs } = await callGeminiText({
      prompt,
      temperature: Number.isFinite(tool.temperature) ? tool.temperature : 0.2,
      maxOutputTokens: Number.isFinite(tool.maxOutputTokens) ? tool.maxOutputTokens : 900
    });

    const outputText = String(text || '').trim().slice(0, 20000);

    // Non-blocking audit logging (metadata only; no user content).
    try {
      ActivityLogService.logActivity(
        {
          actionType: 'note_aid_execute',
          userId: req.user?.id ?? null,
          agencyId,
          metadata: {
            toolId,
            model: modelName,
            inputLength: inputText.length,
            outputLength: outputText.length,
            latencyMs,
            totalMs: Date.now() - started
          }
        },
        req
      );
    } catch {
      // ignore
    }

    res.json({ outputText });
  } catch (e) {
    // Normalize Gemini details to a safe API surface
    if (e?.status) {
      return res.status(e.status).json({
        error: {
          message: e.message || 'Note Aid execution failed',
          ...(e.details ? { details: e.details } : null)
        }
      });
    }
    next(e);
  }
};

