import { validationResult } from 'express-validator';
import ProviderSearchIndex from '../models/ProviderSearchIndex.model.js';
import Agency from '../models/Agency.model.js';

function parseFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  if (typeof raw === 'string') {
    try { return JSON.parse(raw) || {}; } catch { return {}; }
  }
  return {};
}

async function requireAiEnabled(req, res, agencyId) {
  try {
    const agency = await Agency.findById(agencyId);
    const flags = parseFlags(agency?.feature_flags);
    // Default OFF until explicitly enabled.
    const enabled = flags?.aiProviderSearchEnabled === true || flags?.aiProviderSearchEnabled === 1 || flags?.aiProviderSearchEnabled === '1' || String(flags?.aiProviderSearchEnabled || '').toLowerCase() === 'true';
    if (!enabled) {
      res.status(403).json({ error: { message: 'AI Provider Search is disabled for this organization' } });
      return false;
    }
    return true;
  } catch {
    res.status(403).json({ error: { message: 'AI Provider Search is disabled for this organization' } });
    return false;
  }
}

export const rebuildProviderSearchIndex = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    const agencyId = parseInt(req.body.agencyId, 10);
    const out = await ProviderSearchIndex.rebuildForAgency({ agencyId });
    res.json(out);
  } catch (e) {
    next(e);
  }
};

export const searchProviders = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    const agencyId = req.body.agencyId ? parseInt(req.body.agencyId, 10) : null;
    const filters = Array.isArray(req.body.filters) ? req.body.filters : [];
    const limit = req.body.limit;
    const offset = req.body.offset;
    const textQuery = req.body.textQuery || '';
    const out = await ProviderSearchIndex.search({ agencyId, filters, limit, offset, textQuery });
    res.json(out);
  } catch (e) {
    next(e);
  }
};

export const compileProviderSearch = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseInt(req.body.agencyId, 10);
    if (!(await requireAiEnabled(req, res, agencyId))) return;

    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) {
      return res.status(503).json({ error: { message: 'GEMINI_API_KEY is not configured' } });
    }

    const queryText = String(req.body.queryText || '').trim().slice(0, 800);
    const allowedFields = Array.isArray(req.body.allowedFields) ? req.body.allowedFields : [];

    // Hard limit payload size to keep costs low.
    const safeFields = allowedFields.slice(0, 80).map((f) => ({
      fieldKey: String(f?.fieldKey || '').slice(0, 191),
      fieldLabel: String(f?.fieldLabel || '').slice(0, 255),
      fieldType: String(f?.fieldType || '').slice(0, 32),
      options: Array.isArray(f?.options) ? f.options.slice(0, 80).map((o) => String(o).slice(0, 255)) : null
    })).filter((f) => f.fieldKey);

    const system = [
      'You translate a user’s natural language request into structured filters over provider profile fields.',
      'Return ONLY valid JSON (no markdown).',
      'Schema:',
      '{ "filters": [ { "fieldKey": string, "op": "hasOption"|"textContains"|"equals", "value": string } ], "explanation": string }',
      'Rules:',
      '- Use only fieldKey values from allowedFields.',
      '- Prefer hasOption for multi_select fields.',
      '- Keep filters <= 6.',
      '- Do not invent options: if a field has options, pick from them.',
      '- If you cannot map, return filters:[] with explanation.'
    ].join('\n');

    const prompt = [
      system,
      '',
      'allowedFields:',
      JSON.stringify(safeFields),
      '',
      'userQuery:',
      queryText
    ].join('\n');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 512 }
      })
    });

    if (!resp.ok) {
      const t = await resp.text();
      return res.status(502).json({ error: { message: 'Gemini request failed', details: t.slice(0, 1000) } });
    }

    const data = await resp.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      return res.status(502).json({ error: { message: 'Gemini returned invalid JSON', raw: String(text).slice(0, 1000) } });
    }

    const filters = Array.isArray(parsed?.filters) ? parsed.filters.slice(0, 6) : [];
    const explanation = String(parsed?.explanation || '').slice(0, 1000);
    res.json({ filters, explanation });
  } catch (e) {
    next(e);
  }
};

