import { validationResult } from 'express-validator';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import ActivityLogService from '../services/activityLog.service.js';
import { getPublicNoteAidTools, getNoteAidToolById } from '../config/noteAidTools.js';
import { getKnowledgeBaseContext, getKnowledgeBaseStatus } from '../services/clinicalKnowledgeBase.service.js';
import { callGeminiText } from '../services/geminiText.service.js';
import { CLINICAL_NOTE_AGENT_TOOLS } from '../config/clinicalNoteAgentTools.js';
import StorageService from '../services/storage.service.js';

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

function isAdminLike(role) {
  const r = String(role || '').toLowerCase();
  return r === 'admin' || r === 'super_admin';
}

function normalizeFolderName(raw) {
  const s = String(raw || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
  if (!s) return '';
  if (s.includes('..')) return '';
  return s;
}

function uniqueFolders(list) {
  const out = [];
  const seen = new Set();
  for (const entry of list || []) {
    const cleaned = normalizeFolderName(entry);
    if (!cleaned) continue;
    if (seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }
  return out;
}

function getKbFoldersForTool(tool, flags = {}) {
  const overrides = flags?.noteAidKbFolderOverrides || null;
  const override = overrides && typeof overrides === 'object' ? overrides[tool?.id] : null;
  const base = Array.isArray(override)
    ? override
    : Array.isArray(tool?.kbFolders)
      ? tool.kbFolders
      : [];
  const extras = Array.isArray(flags?.noteAidKbExtraFolders) ? flags.noteAidKbExtraFolders : [];
  return uniqueFolders([...base, ...extras]);
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

    const agency = await Agency.findById(agencyId);
    const flags = parseFlags(agency?.feature_flags);

    let prompt = buildPrompt({ tool, inputText });
    if (tool?.includeKnowledgeBase) {
      try {
        const kbContext = await getKnowledgeBaseContext({
          query: inputText,
          maxChars: 4000,
          folders: getKbFoldersForTool(tool, flags)
        });
        if (kbContext) {
          prompt = [
            prompt,
            '',
            'Knowledge Base Context (read-only):',
            kbContext,
            '',
            'Use the context only if relevant and do not invent facts.'
          ].join('\n');
        }
      } catch {
        // Ignore KB failures to keep tool responsive.
      }
    }

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

export const getNoteAidSettings = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseInt(req.query.agencyId, 10);
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireNoteAidEnabled(req, res, agencyId))) return;
    if (!isAdminLike(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const agency = await Agency.findById(agencyId);
    const flags = parseFlags(agency?.feature_flags);
    const kbFolderOverrides = flags?.noteAidKbFolderOverrides || {};
    const kbExtraFolders = Array.isArray(flags?.noteAidKbExtraFolders) ? flags.noteAidKbExtraFolders : [];
    const noteAidProgramOptions = Array.isArray(flags?.noteAidProgramOptions) ? flags.noteAidProgramOptions : [];

    const toolOptions = CLINICAL_NOTE_AGENT_TOOLS.map((t) => ({
      id: t.id,
      name: t.name,
      defaultFolders: Array.isArray(t.kbFolders) ? t.kbFolders : []
    }));

    res.json({
      kbFolderOverrides,
      kbExtraFolders,
      noteAidProgramOptions,
      tools: toolOptions
    });
  } catch (e) {
    next(e);
  }
};

export const updateNoteAidSettings = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseInt(req.body?.agencyId, 10);
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireNoteAidEnabled(req, res, agencyId))) return;
    if (!isAdminLike(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const agency = await Agency.findById(agencyId);
    const flags = parseFlags(agency?.feature_flags);

    const kbFolderOverrides = req.body?.kbFolderOverrides && typeof req.body.kbFolderOverrides === 'object'
      ? req.body.kbFolderOverrides
      : {};
    const kbExtraFolders = Array.isArray(req.body?.kbExtraFolders) ? req.body.kbExtraFolders : [];
    const noteAidProgramOptions = Array.isArray(req.body?.noteAidProgramOptions)
      ? req.body.noteAidProgramOptions
      : [];

    const cleanedOverrides = {};
    for (const [toolId, folders] of Object.entries(kbFolderOverrides)) {
      if (!toolId) continue;
      if (!Array.isArray(folders)) continue;
      const cleaned = uniqueFolders(folders);
      if (cleaned.length) cleanedOverrides[toolId] = cleaned;
    }

    const cleanedExtras = uniqueFolders(kbExtraFolders);
    const cleanedPrograms = Array.from(
      new Set(
        noteAidProgramOptions
          .map((name) => String(name || '').trim())
          .filter(Boolean)
      )
    );

    const nextFlags = {
      ...(flags || {}),
      noteAidKbFolderOverrides: cleanedOverrides,
      noteAidKbExtraFolders: cleanedExtras,
      noteAidProgramOptions: cleanedPrograms
    };

    await Agency.update(agencyId, { featureFlags: nextFlags });
    res.json({ ok: true, featureFlags: nextFlags });
  } catch (e) {
    next(e);
  }
};

export const uploadNoteAidDocument = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseInt(req.body?.agencyId, 10);
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireNoteAidEnabled(req, res, agencyId))) return;
    if (!isAdminLike(req.user?.role)) return res.status(403).json({ error: { message: 'Access denied' } });

    const folder = normalizeFolderName(req.body?.folder || '');
    if (!folder) return res.status(400).json({ error: { message: 'folder is required' } });
    if (!req.file?.buffer) return res.status(400).json({ error: { message: 'file is required' } });
    const mime = String(req.file.mimetype || '').toLowerCase();
    if (mime && mime !== 'application/pdf' && mime !== 'text/plain') {
      return res.status(400).json({ error: { message: 'Only PDF or TXT files are allowed' } });
    }

    const bucketName = String(process.env.CLINICAL_KB_BUCKET || process.env.DATA_STORE_ID || '').trim();
    if (!bucketName) return res.status(503).json({ error: { message: 'CLINICAL_KB_BUCKET is not configured' } });

    const original = String(req.file.originalname || 'document.pdf');
    const safeName = original.replace(/[^a-zA-Z0-9._-]+/g, '_');
    const key = `${folder}/${safeName}`;

    const storage = await StorageService.getGCSStorage();
    const bucket = storage.bucket(bucketName);
    const file = bucket.file(key);
    await file.save(req.file.buffer, {
      contentType: req.file.mimetype || 'application/pdf'
    });

    res.json({ ok: true, path: key });
  } catch (e) {
    next(e);
  }
};

export const listNoteAidDocuments = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseInt(req.query?.agencyId, 10);
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireNoteAidEnabled(req, res, agencyId))) return;
    if (String(req.user?.role || '').toLowerCase() !== 'super_admin') {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const bucketName = String(process.env.CLINICAL_KB_BUCKET || process.env.DATA_STORE_ID || '').trim();
    if (!bucketName) return res.status(503).json({ error: { message: 'CLINICAL_KB_BUCKET is not configured' } });

    const storage = await StorageService.getGCSStorage();
    const bucket = storage.bucket(bucketName);
    const [files] = await bucket.getFiles({ maxResults: 2000 });

    const list = (files || []).map((f) => ({
      name: f.name,
      contentType: f.metadata?.contentType || null,
      size: Number.parseInt(f.metadata?.size || '0', 10) || 0,
      updated: f.metadata?.updated || null
    }));

    res.json({ files: list });
  } catch (e) {
    next(e);
  }
};

export const getNoteAidKnowledgeBaseStatus = async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = parseInt(req.query.agencyId, 10);
    const refresh = String(req.query.refresh || '').trim().toLowerCase() === 'true';

    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireNoteAidEnabled(req, res, agencyId))) return;

    const status = await getKnowledgeBaseStatus({ refresh });
    res.json({ status });
  } catch (e) {
    next(e);
  }
};