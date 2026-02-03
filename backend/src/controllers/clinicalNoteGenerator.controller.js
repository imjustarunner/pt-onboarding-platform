import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';
import { deriveCredentialTier, eligibleServiceCodesForTier, assertServiceCodeAllowed } from '../utils/clinicalServiceCodeEligibility.js';
import { runClinicalDirectorAgent } from '../services/clinicalDirectorAgent.service.js';
import { validationResult } from 'express-validator';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

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

function requireNotSchoolStaff(req, res) {
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'school_staff') {
    res.status(403).json({ error: { message: 'Access denied' } });
    return false;
  }
  return true;
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
    res.status(403).json({ error: { message: 'You do not have access to this organization' } });
    return false;
  }
  return true;
}

async function requireClinicalNoteGeneratorEnabled(req, res, agencyId) {
  try {
    const agency = await Agency.findById(agencyId);
    const flags = parseFlags(agency?.feature_flags);
    const enabled = isTruthyFlag(flags?.clinicalNoteGeneratorEnabled);
    if (!enabled) {
      res.status(403).json({ error: { message: 'Clinical Note Generator is disabled for this organization' } });
      return false;
    }
    return true;
  } catch {
    res.status(403).json({ error: { message: 'Clinical Note Generator is disabled for this organization' } });
    return false;
  }
}

async function getProviderCredentialTextForUserId(userId) {
  const uid = safeInt(userId);
  if (!uid) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT uiv.value
       FROM user_info_values uiv
       JOIN user_info_field_definitions uifd ON uifd.id = uiv.field_definition_id
       WHERE uiv.user_id = ?
         AND uifd.field_key = 'provider_credential'
       ORDER BY uiv.updated_at DESC, uiv.id DESC
       LIMIT 1`,
      [uid]
    );
    const v = rows?.[0]?.value ?? null;
    return v === null || v === undefined ? null : String(v);
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
    return null;
  }
}

function normalizeAudioFile(file) {
  if (!file) return null;
  const mimeType = String(file.mimetype || '').trim();
  const buf = file.buffer;
  if (!mimeType || !buf) return null;
  return {
    mimeType,
    dataBase64: Buffer.from(buf).toString('base64')
  };
}

function normalizeServiceCode(s) {
  return String(s || '').trim().toUpperCase();
}

function normalizeDateOnly(s) {
  const v = String(s || '').trim();
  if (!v) return null;
  // Accept YYYY-MM-DD from date picker; slice defensively.
  return v.slice(0, 10);
}

export const getClinicalNotesContext = async (req, res, next) => {
  try {
    if (!requireNotSchoolStaff(req, res)) return;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    const agencyId = req.query?.agencyId ? safeInt(req.query.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireClinicalNoteGeneratorEnabled(req, res, agencyId))) return;

    const providerCredentialText = await getProviderCredentialTextForUserId(req.user?.id);
    const tier = deriveCredentialTier({
      userRole: req.user?.role,
      providerCredentialText
    });
    const eligibleServiceCodes = eligibleServiceCodesForTier(tier); // null means "all"
    res.json({
      providerCredentialText: providerCredentialText || '',
      derivedTier: tier,
      eligibleServiceCodes
    });
  } catch (e) {
    next(e);
  }
};

export const listClinicalNotePrograms = async (req, res, next) => {
  try {
    if (!requireNotSchoolStaff(req, res)) return;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }
    const agencyId = req.query?.agencyId ? safeInt(req.query.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireClinicalNoteGeneratorEnabled(req, res, agencyId))) return;

    // This uses the existing join table: user_programs.
    const programs = await User.getPrograms(req.user.id);
    res.json({ programs: Array.isArray(programs) ? programs : [] });
  } catch (e) {
    next(e);
  }
};

export const createClinicalNoteDraft = async (req, res, next) => {
  try {
    if (!requireNotSchoolStaff(req, res)) return;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = req.body?.agencyId ? safeInt(req.body.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireClinicalNoteGeneratorEnabled(req, res, agencyId))) return;

    const serviceCode = req.body?.serviceCode ? normalizeServiceCode(req.body.serviceCode) : null;
    const programId = req.body?.programId ? safeInt(req.body.programId) : null;
    const dateOfService = req.body?.dateOfService ? normalizeDateOnly(req.body.dateOfService) : null;
    const initials = req.body?.initials ? String(req.body.initials).trim() : null;
    const inputText = req.body?.inputText === undefined ? null : String(req.body.inputText || '');

    const draft = await ClinicalNoteDraft.create({
      userId: req.user.id,
      agencyId,
      serviceCode,
      programId,
      dateOfService,
      initials,
      inputText,
      outputJson: null
    });
    res.status(201).json({ draft });
  } catch (e) {
    next(e);
  }
};

export const patchClinicalNoteDraft = async (req, res, next) => {
  try {
    if (!requireNotSchoolStaff(req, res)) return;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const draftId = safeInt(req.params.draftId);
    if (!draftId) return res.status(400).json({ error: { message: 'Invalid draftId' } });

    const agencyId = req.body?.agencyId ? safeInt(req.body.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireClinicalNoteGeneratorEnabled(req, res, agencyId))) return;

    const existing = await ClinicalNoteDraft.findByIdForUser({ draftId, userId: req.user.id });
    if (!existing) return res.status(404).json({ error: { message: 'Draft not found' } });
    const existingAgencyId = existing?.agency_id === null || existing?.agency_id === undefined ? null : safeInt(existing.agency_id);
    if (existingAgencyId && existingAgencyId !== agencyId) {
      return res.status(403).json({ error: { message: 'Draft belongs to a different organization' } });
    }

    const patch = {};
    // Bind drafts to the current org (and avoid cross-org updates).
    patch.agencyId = agencyId;
    if (req.body?.serviceCode !== undefined) patch.serviceCode = req.body.serviceCode === null ? null : normalizeServiceCode(req.body.serviceCode);
    if (req.body?.programId !== undefined) patch.programId = req.body.programId === null ? null : safeInt(req.body.programId);
    if (req.body?.dateOfService !== undefined) patch.dateOfService = req.body.dateOfService === null ? null : normalizeDateOnly(req.body.dateOfService);
    if (req.body?.initials !== undefined) patch.initials = req.body.initials === null ? null : String(req.body.initials).trim();
    if (req.body?.inputText !== undefined) patch.inputText = req.body.inputText === null ? null : String(req.body.inputText || '');

    const updated = await ClinicalNoteDraft.updateForUser({
      draftId,
      userId: req.user.id,
      patch
    });
    if (!updated) return res.status(404).json({ error: { message: 'Draft not found' } });
    res.json({ draft: updated });
  } catch (e) {
    next(e);
  }
};

export const listRecentClinicalNoteDrafts = async (req, res, next) => {
  try {
    if (!requireNotSchoolStaff(req, res)) return;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    const agencyId = req.query?.agencyId ? safeInt(req.query.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireClinicalNoteGeneratorEnabled(req, res, agencyId))) return;

    const days = req.query?.days ? Number(req.query.days) : 7;
    const drafts = await ClinicalNoteDraft.listRecentForUser({ userId: req.user.id, agencyId, days, limit: 50 });
    res.json({ drafts });
  } catch (e) {
    next(e);
  }
};

export const generateClinicalNote = async (req, res, next) => {
  try {
    if (!requireNotSchoolStaff(req, res)) return;
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: { message: 'Validation failed', errors: errors.array() } });
    }

    // NOTE: req.body is populated by multer for multipart/form-data.
    const agencyId = req.body?.agencyId ? safeInt(req.body.agencyId) : null;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!(await requireUserHasAgencyAccess(req, res, agencyId))) return;
    if (!(await requireClinicalNoteGeneratorEnabled(req, res, agencyId))) return;

    const serviceCode = normalizeServiceCode(req.body?.serviceCode);
    const programIdRaw = req.body?.programId;
    const programId = programIdRaw ? safeInt(programIdRaw) : null;
    const dateOfService = normalizeDateOnly(req.body?.dateOfService);
    const initials = req.body?.initials ? String(req.body.initials).trim() : null;
    const inputText = String(req.body?.inputText || '').trim().slice(0, 12000);
    const draftId = req.body?.draftId ? safeInt(req.body.draftId) : null;

    if (!inputText) return res.status(400).json({ error: { message: 'inputText is required' } });

    // Program rule: only allow programId when service code is H2014.
    if (programId && serviceCode !== 'H2014') {
      return res.status(400).json({ error: { message: 'programId is only allowed for service code H2014' } });
    }

    if (programId) {
      // Enforce program access (similar to requireProgramAccess middleware),
      // but implemented inline to avoid middleware short-circuit hangs.
      const role = String(req.user?.role || '').toLowerCase();
      const isAdminLike = role === 'admin' || role === 'super_admin' || role === 'support';
      if (!isAdminLike) {
        const [rows] = await pool.execute(
          'SELECT 1 FROM user_programs WHERE user_id = ? AND program_id = ? LIMIT 1',
          [req.user.id, programId]
        );
        if (!rows || rows.length === 0) {
          return res.status(403).json({ error: { message: 'Access denied to this program' } });
        }
      }
    }

    const providerCredentialText = await getProviderCredentialTextForUserId(req.user?.id);
    const tier = deriveCredentialTier({ userRole: req.user?.role, providerCredentialText });
    assertServiceCodeAllowed({ tier, serviceCode });

    const audio = normalizeAudioFile(req.file);

    const agentUrl =
      String(process.env.CLINICAL_DIRECTOR_AGENT_URL || '').trim() ||
      String(process.env.ADK_AGENT_URL || '').trim();

    const payload = {
      user: {
        id: req.user?.id || null,
        role: req.user?.role || null,
        providerCredentialText: providerCredentialText || ''
      },
      request: {
        agencyId,
        serviceCode,
        programId,
        dateOfService,
        initials,
        inputText
      },
      audio
    };

    const outputObj = await runClinicalDirectorAgent({
      url: agentUrl,
      payload,
      timeoutMs: Math.min(Math.max(parseInt(process.env.CLINICAL_DIRECTOR_AGENT_TIMEOUT_MS || '60000', 10) || 60000, 5000), 120000)
    });

    // Ensure strict JSON object.
    if (!outputObj || typeof outputObj !== 'object' || Array.isArray(outputObj)) {
      return res.status(502).json({ error: { message: 'Agent returned invalid JSON object' } });
    }

    const outputJson = JSON.stringify(outputObj);

    let draft = null;
    if (draftId) {
      const existing = await ClinicalNoteDraft.findByIdForUser({ draftId, userId: req.user.id });
      if (!existing) return res.status(404).json({ error: { message: 'Draft not found' } });
      const existingAgencyId = existing?.agency_id === null || existing?.agency_id === undefined ? null : safeInt(existing.agency_id);
      if (existingAgencyId && existingAgencyId !== agencyId) {
        return res.status(403).json({ error: { message: 'Draft belongs to a different organization' } });
      }
      draft = await ClinicalNoteDraft.updateForUser({
        draftId,
        userId: req.user.id,
        patch: {
          agencyId,
          serviceCode,
          programId,
          dateOfService,
          initials,
          inputText,
          outputJson
        }
      });
    }

    if (!draft) {
      draft = await ClinicalNoteDraft.create({
        userId: req.user.id,
        agencyId,
        serviceCode,
        programId,
        dateOfService,
        initials,
        inputText,
        outputJson
      });
    }

    res.json({
      draftId: draft?.id || null,
      outputJson: outputObj
    });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({
        error: {
          message: e.message || 'Request failed',
          ...(e.code ? { code: e.code } : null),
          ...(e.details ? { details: e.details } : null)
        }
      });
    }
    next(e);
  }
};

