import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';
import { deriveCredentialTier, eligibleServiceCodesForTier, assertServiceCodeAllowed } from '../utils/clinicalServiceCodeEligibility.js';
import { getNoteAidToolById } from '../config/noteAidTools.js';
import { getKnowledgeBaseContext } from '../services/clinicalKnowledgeBase.service.js';
import { listEligiblePolicyServiceCodes, resolvePolicyRuleForServiceCode } from '../services/billingPolicy.service.js';
import { callGeminiText } from '../services/geminiText.service.js';
import { transcribeLongAudio } from '../services/speechTranscription.service.js';
import { decryptChatText, encryptChatText, isChatEncryptionConfigured } from '../services/chatEncryption.service.js';
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

function buildPromptForTool({ tool, inputText }) {
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
    const roleNorm = String(req.user?.role || '').toLowerCase();
    const agency = await Agency.findById(agencyId);
    const flags = parseFlags(agency?.feature_flags);
    // Back-compat: treat Note Aid as the paid feature toggle.
    const enabled = isTruthyFlag(flags?.noteAidEnabled) || isTruthyFlag(flags?.clinicalNoteGeneratorEnabled);
    if (!enabled) {
      res.status(403).json({ error: { message: 'Clinical Note Generator is disabled for this organization' } });
      return false;
    }
    // Super admin can bypass hasClinicalOrg (e.g. for support/testing when agency structure is incomplete).
    if (roleNorm === 'super_admin') return true;
    const { OrganizationAffiliation } = await import('../models/OrganizationAffiliation.model.js');
    const hasClinicalOrg = await OrganizationAffiliation.agencyHasClinicalOrg(agencyId);
    if (!hasClinicalOrg) {
      res.status(403).json({ error: { message: 'Clinical Note Generator is only available for agencies with a clinical organization attached' } });
      return false;
    }
    return true;
  } catch (e) {
    res.status(403).json({ error: { message: 'Clinical Note Generator is disabled for this organization' } });
    return false;
  }
}

async function getProviderCredentialTextForUserId(userId) {
  const uid = safeInt(userId);
  if (!uid) return null;
  // Prefer hard users.credential column when available.
  try {
    const [rows] = await pool.execute(
      `SELECT credential
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [uid]
    );
    const v = rows?.[0]?.credential ?? null;
    if (v !== null && v !== undefined && String(v).trim()) return String(v);
  } catch {
    // Older DBs may not have users.credential yet; fall back below.
  }

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
    if (v !== null && v !== undefined && String(v).trim()) return String(v);
  } catch (e) {
    const msg = String(e?.message || '');
    const missing =
      msg.includes("doesn't exist") ||
      msg.includes('ER_NO_SUCH_TABLE') ||
      msg.includes('Unknown column') ||
      msg.includes('ER_BAD_FIELD_ERROR');
    if (!missing) throw e;
  }

  return null;
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

function parseBool(v) {
  if (v === true || v === false) return v;
  if (v === 1 || v === 0) return v === 1;
  const s = String(v ?? '').trim().toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes' || s === 'on') return true;
  if (s === 'false' || s === '0' || s === 'no' || s === 'off') return false;
  return false;
}

function intersectCodes(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return null;
  const set = new Set(a.map((c) => String(c || '').trim().toUpperCase()).filter(Boolean));
  return b
    .map((c) => String(c || '').trim().toUpperCase())
    .filter((c) => c && set.has(c));
}

function maybeEncryptText(value) {
  if (value === null || value === undefined) return null;
  if (!isChatEncryptionConfigured()) return String(value);
  const { ciphertextB64, ivB64, authTagB64, keyId } = encryptChatText(String(value));
  return JSON.stringify({
    _enc: true,
    keyId,
    iv: ivB64,
    tag: authTagB64,
    ciphertext: ciphertextB64
  });
}

function maybeDecryptText(value) {
  const raw = value === null || value === undefined ? '' : String(value);
  if (!raw) return raw;
  try {
    const parsed = JSON.parse(raw);
    if (parsed?._enc && parsed.ciphertext && parsed.iv && parsed.tag) {
      return decryptChatText({
        ciphertextB64: parsed.ciphertext,
        ivB64: parsed.iv,
        authTagB64: parsed.tag,
        keyId: parsed.keyId || null
      });
    }
  } catch {
    // not encrypted JSON
  }
  return raw;
}

function resolveClinicalToolId({ serviceCode, programId }) {
  const sc = String(serviceCode || '').trim().toUpperCase();
  if (!sc) return 'clinical_code_decider';
  if (sc === 'H2014') return programId ? 'clinical_h2014_group' : 'clinical_h2014_individual';
  if (sc === 'H2015' || sc === 'H2016') return 'clinical_h2014_individual';
  if (sc === 'H0004') return 'clinical_h0004_note';
  if (sc === 'H0031') return 'clinical_h0031_intake';
  if (sc === 'H0032') return 'clinical_h0032_plan_development';
  if (sc === 'H0002') return 'clinical_psc_17';
  if (sc === '90791') return 'clinical_90791_intake_plan';
  if (sc === '90832' || sc === '90834' || sc === '90837') return 'clinical_psychotherapy_note';
  if (sc === '90846' || sc === '90847') return 'clinical_family_note';
  if (sc === 'H0023') return 'clinical_h0023_full_packet';
  return 'clinical_code_decider';
}

function extractToolCodeHints(tool) {
  const haystack = `${tool?.id || ''} ${tool?.name || ''} ${tool?.description || ''}`.toUpperCase();
  const matches = haystack.match(/\b(?:[A-Z]\d{4}|90\d{3}|99\d{3})\b/g) || [];
  return Array.from(new Set(matches));
}

function normalizeSectionTitle(raw) {
  const t = String(raw || '')
    .replace(/^\s*\d+[\).\s-]+/, '')
    .replace(/\*\*/g, '')
    .replace(/:$/, '')
    .trim();
  return t;
}

function parseNoteSections(text) {
  const raw = String(text || '').trim();
  if (!raw) return {};

  const known = new Map([
    ['Symptom Description and Subjective Report', 'Symptom Description and Subjective Report'],
    ['Objective Content', 'Objective Content'],
    ['Interventions Used', 'Interventions Used'],
    ['Plan', 'Plan'],
    ['Additional Notes / Assessment', 'Additional Notes / Assessment'],
    ['Assessment', 'Assessment'],
    ['Interventions', 'Interventions Used'],
    ['Code', 'Code'],
    ['Rationale', 'Rationale'],
    ['Progress Note', 'Progress Note'],
    ['Consultation Note', 'Consultation Note']
  ]);

  const lines = raw.split(/\r?\n/);
  const sections = {};
  let currentKey = null;
  let buffer = [];

  const flush = () => {
    if (!currentKey) return;
    const content = buffer.join('\n').trim();
    if (content) sections[currentKey] = content;
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const headerMatch =
      trimmed.match(/^\d+[\).\s-]+\*\*(.+?)\*\*:?$/) ||
      trimmed.match(/^\d+[\).\s-]+(.+?):?$/) ||
      trimmed.match(/^\*\*(.+?)\*\*:?$/) ||
      trimmed.match(/^([A-Za-z0-9][A-Za-z0-9 \-/]+):\s*$/);

    if (headerMatch) {
      const title = normalizeSectionTitle(headerMatch[1]);
      const key = known.get(title);
      if (key) {
        flush();
        currentKey = key;
        continue;
      }
    }

    buffer.push(line);
  }

  flush();
  if (sections['Interventions Used']) {
    sections['Interventions Used'] = normalizeInterventionsList(sections['Interventions Used']);
  }
  if (sections.Interventions && !sections['Interventions Used']) {
    sections['Interventions Used'] = normalizeInterventionsList(sections.Interventions);
    delete sections.Interventions;
  }
  return sections;
}

function extractCodeDeciderSections(text) {
  const raw = String(text || '');
  const codeMatch = raw.match(/(?:^|\n)\s*Code\s*:?\s*([A-Z0-9]{3,10})/i);
  const rationaleMatch = raw.match(/(?:^|\n)\s*Rationale\s*:?\s*([\s\S]+?)(?:\n\s*\d+[\).\s-]+|\n\s*Progress Note:|\n\s*Consultation Note:|$)/i);
  const sections = {};
  if (codeMatch?.[1]) sections.Code = codeMatch[1].trim();
  if (rationaleMatch?.[1]) sections.Rationale = rationaleMatch[1].trim();
  return sections;
}

function normalizeInterventionsList(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const cleaned = text
    .split(/\r?\n|•|\*|- /g)
    .map((t) => t.replace(/^[\d\.\)\s-]+/, '').trim())
    .filter(Boolean);
  if (!cleaned.length) return text;
  const items = [];
  for (const chunk of cleaned) {
    const parts = chunk.split(',').map((p) => p.trim()).filter(Boolean);
    items.push(...parts);
  }
  return items.join(', ');
}
async function getAgencyServiceCodeCatalog({ agencyId }) {
  const aid = safeInt(agencyId);
  if (!aid) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT DISTINCT service_code
       FROM payroll_service_code_rules
       WHERE agency_id = ?
         -- Allow common modifiers (ex: H0031U4) but exclude plain words like "MEETING".
         AND service_code REGEXP '^[A-Za-z0-9]{4,12}$'
         AND service_code REGEXP '[0-9]'
       ORDER BY service_code ASC
       LIMIT 500`,
      [aid]
    );
    const list = (rows || [])
      .map((r) => String(r?.service_code || '').trim().toUpperCase())
      .filter(Boolean);
    if (list.length) return list;

    // Fallback: if the agency hasn't configured a dictionary yet, use global known codes
    // from other agencies' dictionaries (still filtered to code-like values).
    const [globalRows] = await pool.execute(
      `SELECT DISTINCT service_code
       FROM payroll_service_code_rules
       WHERE service_code REGEXP '^[A-Za-z0-9]{4,12}$'
         AND service_code REGEXP '[0-9]'
       ORDER BY service_code ASC
       LIMIT 500`
    );
    return (globalRows || [])
      .map((r) => String(r?.service_code || '').trim().toUpperCase())
      .filter(Boolean);
  } catch (e) {
    // Best-effort: table/column may not exist in some deployments.
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') return [];
    const msg = String(e?.message || '');
    if (msg.includes('ER_NO_SUCH_TABLE') || msg.includes('Unknown column') || msg.includes("doesn't exist")) return [];
    throw e;
  }
}

async function listAgencyAudioAgreementTemplates({ agencyId }) {
  const aid = safeInt(agencyId);
  if (!aid) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT id, name, document_type, document_action_type
       FROM document_templates
       WHERE agency_id = ?
         AND is_active = TRUE
         AND (is_archived = FALSE OR is_archived IS NULL)
         AND document_type = 'audio_recording_consent'
       ORDER BY name ASC
       LIMIT 200`,
      [aid]
    );
    return (rows || [])
      .map((r) => ({
        id: Number(r.id),
        name: String(r.name || '').trim(),
        documentType: String(r.document_type || '').trim(),
        actionType: String(r.document_action_type || '').trim()
      }))
      .filter((r) => Number.isFinite(r.id) && r.id > 0 && r.name);
  } catch (e) {
    // Best-effort: older deployments may not include these columns.
    if (e?.code === 'ER_NO_SUCH_TABLE' || e?.code === 'ER_BAD_FIELD_ERROR') return [];
    const msg = String(e?.message || '');
    if (msg.includes('ER_NO_SUCH_TABLE') || msg.includes('Unknown column') || msg.includes("doesn't exist")) return [];
    throw e;
  }
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

    const agency = await Agency.findById(agencyId);
    const featureFlags = parseFlags(agency?.feature_flags);

    const providerCredentialText = await getProviderCredentialTextForUserId(req.user?.id);
    const tier = deriveCredentialTier({
      userRole: req.user?.role,
      providerCredentialText
    });
    const policyEligibleCodes = await listEligiblePolicyServiceCodes({ agencyId, credentialTier: tier });
    const serviceCodeCatalog = await getAgencyServiceCodeCatalog({ agencyId });
    // Prefer policy-derived eligibility when present; otherwise fallback to catalog/tier rules.
    const eligibleServiceCodes = policyEligibleCodes.length
      ? policyEligibleCodes
      : (serviceCodeCatalog.length ? serviceCodeCatalog : eligibleServiceCodesForTier(tier)); // null means "all"
    const audioAgreementTemplates = await listAgencyAudioAgreementTemplates({ agencyId });
    res.json({
      providerCredentialText: providerCredentialText || '',
      derivedTier: tier,
      eligibleServiceCodes,
      audioAgreementTemplates
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
    const agency = await Agency.findById(agencyId);
    const flags = parseFlags(agency?.feature_flags);
    const customPrograms = Array.isArray(flags?.noteAidProgramOptions)
      ? flags.noteAidProgramOptions
          .map((name) => String(name || '').trim())
          .filter(Boolean)
          .map((name) => ({ id: `custom:${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, name, isCustom: true }))
      : [];
    res.json({ programs: [...(Array.isArray(programs) ? programs : []), ...customPrograms] });
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
    const encryptedInputText = maybeEncryptText(inputText);

    const draft = await ClinicalNoteDraft.create({
      userId: req.user.id,
      agencyId,
      serviceCode,
      programId,
      dateOfService,
      initials,
      inputText: encryptedInputText,
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
    if (req.body?.inputText !== undefined) {
      const inputText = req.body.inputText === null ? null : String(req.body.inputText || '');
      patch.inputText = maybeEncryptText(inputText);
    }

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
    const sanitized = (drafts || []).map((d) => ({
      ...d,
      input_text: maybeDecryptText(d?.input_text),
      output_json: maybeDecryptText(d?.output_json)
    }));
    res.json({ drafts: sanitized });
  } catch (e) {
    next(e);
  }
};

export const deleteClinicalNoteDrafts = async (req, res, next) => {
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

    const draftIds = Array.isArray(req.body?.draftIds) ? req.body.draftIds : [];
    const deletedCount = await ClinicalNoteDraft.deleteForUser({
      userId: req.user.id,
      agencyId,
      draftIds
    });

    res.json({ deletedCount });
  } catch (e) {
    next(e);
  }
};

export const transcribeClinicalNoteAudio = async (req, res, next) => {
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

    if (!req.file?.buffer) {
      return res.status(400).json({ error: { message: 'audio is required' } });
    }

    const languageCode = String(req.body?.languageCode || 'en-US').trim() || 'en-US';
    const transcript = await transcribeLongAudio({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      languageCode,
      userId: req.user?.id
    });

    res.json({ transcriptText: String(transcript || '').trim() });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message || 'Transcription failed' } });
    }
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
    const programLabel = req.body?.programLabel ? String(req.body.programLabel).trim().slice(0, 120) : null;
    const dateOfService = normalizeDateOnly(req.body?.dateOfService);
    const initials = req.body?.initials ? String(req.body.initials).trim() : null;
    const autoSelectCode = parseBool(req.body?.autoSelectCode);
    const transcriptSource = String(req.body?.transcriptSource || '').trim().toLowerCase();
    let inputText = String(req.body?.inputText || '').trim().slice(0, 12000);
    const revisionInstruction = req.body?.revisionInstruction
      ? String(req.body.revisionInstruction).trim().slice(0, 1500)
      : '';
    const draftId = req.body?.draftId ? safeInt(req.body.draftId) : null;

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
    const serviceCodeCatalog = await getAgencyServiceCodeCatalog({ agencyId });
    const catalogCodes = serviceCodeCatalog.length ? serviceCodeCatalog : null;
    const tierCodes = eligibleServiceCodesForTier(tier); // null => all
    const allowedCodes = catalogCodes
      ? (Array.isArray(tierCodes) ? intersectCodes(catalogCodes, tierCodes) : catalogCodes)
      : tierCodes;
    const effectiveAutoSelect = autoSelectCode || tier === 'unknown';
    if (!effectiveAutoSelect && !serviceCode) {
      return res.status(400).json({ error: { message: 'serviceCode is required unless autoSelectCode is true' } });
    }

    // Program rule: only allow programId/label when service code is H2014.
    if ((programId || programLabel) && serviceCode !== 'H2014') {
      return res.status(400).json({ error: { message: 'programId is only allowed for service code H2014' } });
    }

    if (!effectiveAutoSelect) {
      const policyEligibleCodes = await listEligiblePolicyServiceCodes({ agencyId, credentialTier: tier });
      if (policyEligibleCodes.length) {
        if (!policyEligibleCodes.includes(serviceCode)) {
          return res.status(403).json({
            error: {
              message: `Service code ${serviceCode} is not allowed for your credential classification under the active billing policy`
            }
          });
        }
      } else {
        assertServiceCodeAllowed({ tier, serviceCode, allowedCodes });
      }
      const policyRule = await resolvePolicyRuleForServiceCode({ agencyId, serviceCode, credentialTier: tier });
      if (policyRule) {
        if (!policyRule.enabledForAgency) {
          return res.status(403).json({ error: { message: `Service code ${serviceCode} is disabled for this agency` } });
        }
        if (!policyRule.allowedForCredentialTier) {
          return res.status(403).json({
            error: { message: `Service code ${serviceCode} is not allowed for your credential classification` }
          });
        }
      }
    }

    let usedAudioTranscript = false;
    if (!inputText && req.file) {
      try {
        const transcript = await transcribeLongAudio({
          buffer: req.file.buffer,
          mimeType: req.file.mimetype,
          languageCode: 'en-US',
          userId: req.user?.id
        });
        inputText = String(transcript || '').trim().slice(0, 12000);
        usedAudioTranscript = true;
      } catch (e) {
        return res.status(e?.status || 502).json({
          error: {
            message: 'Audio transcription failed',
            ...(e?.message ? { details: e.message } : null)
          }
        });
      }
    }

    if (!inputText) return res.status(400).json({ error: { message: 'inputText is required' } });

    const toolId = effectiveAutoSelect ? 'clinical_code_decider' : resolveClinicalToolId({ serviceCode, programId });
    const tool = getNoteAidToolById(toolId);
    if (!tool) {
      return res.status(400).json({ error: { message: 'No tool configured for this service code' } });
    }

    let prompt = buildPromptForTool({ tool, inputText });
    if (programLabel && serviceCode === 'H2014') {
      prompt = [prompt, '', `Program: ${programLabel}`].join('\n');
    }
    if (revisionInstruction) {
      prompt = [
        prompt,
        '',
        'Revision request from clinician:',
        revisionInstruction,
        '',
        'Apply this revision request while preserving compliance and note structure requirements.'
      ].join('\n');
    }
    if (effectiveAutoSelect && Array.isArray(allowedCodes) && allowedCodes.length) {
      prompt = [
        prompt,
        '',
        `Allowed service codes for this user: ${allowedCodes.join(', ')}`,
        'Choose from these codes only.'
      ].join('\n');
    } else if (effectiveAutoSelect && allowedCodes === null) {
      prompt = [
        prompt,
        '',
        'Allowed service codes for this user: All (no restriction).'
      ].join('\n');
    }
    if (tool?.includeKnowledgeBase) {
      try {
        const codeHints = Array.from(
          new Set([
            ...(serviceCode ? [String(serviceCode).toUpperCase()] : []),
            ...extractToolCodeHints(tool)
          ])
        );
        const kbContext = await getKnowledgeBaseContext({
          query: inputText,
          maxChars: 4000,
          folders: getKbFoldersForTool(tool, featureFlags),
          codeHints,
          titleHints: [tool?.name || '', tool?.description || '', programLabel || '']
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

    const { text, modelName, latencyMs } = await callGeminiText({
      prompt,
      temperature: Number.isFinite(tool.temperature) ? tool.temperature : 0.2,
      maxOutputTokens: Number.isFinite(tool.maxOutputTokens) ? tool.maxOutputTokens : 1600
    });

    const parsedSections = parseNoteSections(text);
    if (toolId === 'clinical_code_decider') {
      const extra = extractCodeDeciderSections(text);
      for (const [k, v] of Object.entries(extra)) {
        if (!parsedSections[k]) parsedSections[k] = v;
      }
    }
    const sections = Object.keys(parsedSections).length
      ? parsedSections
      : { Output: String(text || '').trim() };

    const outputObj = {
      sections,
      meta: {
        toolId,
        model: modelName,
        latencyMs
      }
    };

    const outputJson = JSON.stringify(outputObj);
    const storedInputText =
      (transcriptSource === 'audio' || usedAudioTranscript) ? null : inputText;
    const encryptedInputText = maybeEncryptText(storedInputText);
    const encryptedOutputJson = maybeEncryptText(outputJson);

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
          serviceCode: effectiveAutoSelect ? null : serviceCode,
          programId,
          dateOfService,
          initials,
          inputText: encryptedInputText,
          outputJson: encryptedOutputJson
        }
      });
    }

    if (!draft) {
      draft = await ClinicalNoteDraft.create({
        userId: req.user.id,
        agencyId,
        serviceCode: effectiveAutoSelect ? null : serviceCode,
        programId,
        dateOfService,
        initials,
        inputText: encryptedInputText,
        outputJson: encryptedOutputJson
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

