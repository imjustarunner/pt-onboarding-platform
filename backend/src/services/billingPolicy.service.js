import crypto from 'crypto';
import pool from '../config/database.js';
import StorageService from './storage.service.js';
import { extractResumeTextFromUpload } from './resumeTextExtraction.service.js';

const DEFAULT_STATE_CODE = 'CO';
const MEDICAID_8_MIN_MINUTES = 8;

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeCredentialTier(value) {
  return String(value || '').trim().toLowerCase();
}

function parseJson(value) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return null;
  }
}

function isMissingPolicySchemaError(error) {
  const code = String(error?.code || error?.errno || '');
  return code === 'ER_NO_SUCH_TABLE' || code === 'ER_BAD_FIELD_ERROR';
}

function extFromMimeType(mimeType = '') {
  const m = String(mimeType).toLowerCase();
  if (m.includes('pdf')) return 'pdf';
  if (m.includes('text')) return 'txt';
  return 'bin';
}

function summarizeSourceSnippet(raw = '') {
  return String(raw || '').replace(/\s+/g, ' ').trim().slice(0, 400);
}

function detectCredentialTier(line = '') {
  const s = String(line || '').toLowerCase();
  if (!s) return null;
  if (s.includes('qbha')) return 'qbha';
  if (s.includes('bachelor')) return 'bachelors';
  if (s.includes('licensed') || s.includes('lcsw') || s.includes('lpc') || s.includes('lmft') || s.includes('psychologist') || s.includes('intern')) {
    return 'intern_plus';
  }
  return null;
}

function detectProviderType(line = '') {
  const s = String(line || '').toLowerCase();
  if (!s) return null;
  if (s.includes('licensed')) return 'licensed';
  if (s.includes('intern')) return 'intern';
  if (s.includes('bachelor')) return 'bachelors';
  if (s.includes('qbha')) return 'qbha';
  return null;
}

function detectUnitCalcMode(line = '', unitMinutes = null) {
  const s = String(line || '').toLowerCase();
  if (!s) return unitMinutes ? 'MEDICAID_8_MINUTE_LADDER' : 'NONE';
  if (/\bper\s+encounter\b|\bper\s+visit\b|\beach\s+encounter\b/.test(s)) return 'NONE';
  if (/\b8\s*minute\b|\b8[-\s]?min\b|\bmedicaid\b/.test(s)) return 'MEDICAID_8_MINUTE_LADDER';
  if (/\bper\s+unit\b|\bunit\b/.test(s) && (unitMinutes || /\b15\s*(min|minute)\b/.test(s))) return 'MEDICAID_8_MINUTE_LADDER';
  return unitMinutes ? 'MEDICAID_8_MINUTE_LADDER' : 'NONE';
}

function detectMaxUnitsPerDay(line = '') {
  const s = String(line || '');
  const patterns = [
    /(?:can(?:not|'t)|cannot|do\s+not|not)\s+bill\s+(?:more\s+than|over)\s+(\d{1,3})\s+units?/i,
    /(?:no\s+more\s+than|up\s+to|maximum|max)\s+(\d{1,3})\s+units?(?:\s+per\s+day|\s+daily)?/i,
    /(\d{1,3})\s+units?\s+(?:max(?:imum)?|daily\s+max)/i
  ];
  for (const rx of patterns) {
    const m = s.match(rx);
    if (m?.[1]) return toInt(m[1], 0) || null;
  }
  return null;
}

function parseCandidateRowsFromExtractedText(text = '') {
  const out = [];
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const codeRegex = /\b((?:[A-Z]\d{4})|(?:90\d{3})|(?:99\d{3}))\b/g;

  for (const line of lines) {
    const codes = Array.from(line.matchAll(codeRegex)).map((m) => normalizeCode(m[1]));
    if (!codes.length) continue;

    // Examples:
    // "Min 8 Max 15"
    // "8-15 minutes"
    const minMax = line.match(/(?:min(?:imum)?\s*:?\s*(\d{1,3}).*max(?:imum)?\s*:?\s*(\d{1,3}))|(?:(\d{1,3})\s*-\s*(\d{1,3})\s*(?:min|minute))/i);
    const minMinutes = toInt(minMax?.[1] || minMax?.[3] || 0, 0) || null;
    const maxMinutes = toInt(minMax?.[2] || minMax?.[4] || 0, 0) || null;

    // "unit every 15 min"
    const unitMatch = line.match(/(?:unit(?:s)?\s*(?:every|per)\s*(\d{1,3})\s*(?:min|minute))|(?:\b(\d{1,3})\s*(?:min|minute)\s*unit)/i);
    const unitMinutes = toInt(unitMatch?.[1] || unitMatch?.[2] || 0, 0) || null;

    // "max 12 units" style daily cap hints.
    const maxUnitsPerDay = detectMaxUnitsPerDay(line);
    const credentialTier = detectCredentialTier(line);
    const providerType = detectProviderType(line);
    const unitCalcMode = detectUnitCalcMode(line, unitMinutes);

    for (const serviceCode of codes) {
      out.push({
        serviceCode,
        serviceDescription: null,
        minMinutes,
        maxMinutes,
        unitMinutes,
        unitCalcMode,
        maxUnitsPerDay,
        credentialTier,
        providerType,
        sourceSnippet: summarizeSourceSnippet(line),
        rawTextLine: line
      });
    }
  }

  return out;
}

export async function listBillingPolicyProfiles({ stateCode = null, status = null } = {}) {
  try {
    const clauses = [];
    const params = [];
    if (stateCode) {
      clauses.push('state_code = ?');
      params.push(String(stateCode).toUpperCase());
    }
    if (status) {
      clauses.push('status = ?');
      params.push(String(status).toUpperCase());
    }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT *
       FROM billing_policy_profiles
       ${where}
       ORDER BY created_at DESC, id DESC`,
      params
    );
    return rows || [];
  } catch (error) {
    if (isMissingPolicySchemaError(error)) return [];
    throw error;
  }
}

export async function getBillingPolicyProfileById(profileId) {
  const id = toInt(profileId, 0);
  if (!id) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT *
       FROM billing_policy_profiles
       WHERE id = ?
       LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  } catch (error) {
    if (isMissingPolicySchemaError(error)) return null;
    throw error;
  }
}

export async function createBillingPolicyProfile({
  stateCode = DEFAULT_STATE_CODE,
  policyName,
  versionLabel,
  effectiveStartDate = null,
  effectiveEndDate = null,
  status = 'DRAFT',
  notes = null,
  createdByUserId = null
}) {
  const safeState = String(stateCode || DEFAULT_STATE_CODE).toUpperCase().slice(0, 2);
  const safeName = String(policyName || '').trim();
  const safeVersion = String(versionLabel || '').trim();
  if (!safeName || !safeVersion) {
    const err = new Error('policyName and versionLabel are required');
    err.status = 400;
    throw err;
  }
  const [result] = await pool.execute(
    `INSERT INTO billing_policy_profiles
       (state_code, policy_name, version_label, effective_start_date, effective_end_date, status, notes, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [safeState, safeName, safeVersion, effectiveStartDate, effectiveEndDate, String(status || 'DRAFT').toUpperCase(), notes, createdByUserId]
  );
  return await getBillingPolicyProfileById(result.insertId);
}

export async function updateBillingPolicyProfile(profileId, patch = {}) {
  const id = toInt(profileId, 0);
  if (!id) return null;
  const current = await getBillingPolicyProfileById(id);
  if (!current) return null;
  await pool.execute(
    `UPDATE billing_policy_profiles
     SET policy_name = ?,
         version_label = ?,
         effective_start_date = ?,
         effective_end_date = ?,
         status = ?,
         notes = ?,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      String((patch.policyName ?? current.policy_name) || '').trim(),
      String((patch.versionLabel ?? current.version_label) || '').trim(),
      patch.effectiveStartDate ?? current.effective_start_date ?? null,
      patch.effectiveEndDate ?? current.effective_end_date ?? null,
      String((patch.status ?? current.status) || 'DRAFT').toUpperCase(),
      patch.notes ?? current.notes ?? null,
      id
    ]
  );
  return await getBillingPolicyProfileById(id);
}

export async function publishBillingPolicyProfile({ profileId, publishedByUserId = null }) {
  const id = toInt(profileId, 0);
  if (!id) return null;
  await pool.execute(
    `UPDATE billing_policy_profiles
     SET status = 'PUBLISHED',
         published_by_user_id = ?,
         published_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [publishedByUserId, id]
  );
  return await getBillingPolicyProfileById(id);
}

export async function listPolicyServiceRules({ profileId }) {
  const id = toInt(profileId, 0);
  if (!id) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT sr.*,
              (
                SELECT JSON_ARRAYAGG(
                  JSON_OBJECT(
                    'id', er.id,
                    'credentialTier', er.credential_tier,
                    'providerType', er.provider_type,
                    'allowed', er.allowed,
                    'minMinutesOverride', er.min_minutes_override,
                    'notes', er.notes
                  )
                )
                FROM billing_policy_eligibility_rules er
                WHERE er.service_rule_id = sr.id
              ) AS eligibility_json,
              (
                SELECT JSON_ARRAYAGG(
                  JSON_OBJECT(
                    'id', rs.id,
                    'pageNumber', rs.page_number,
                    'citationSnippet', rs.citation_snippet,
                    'sourceFileName', rs.source_file_name,
                    'sourceStoragePath', rs.source_storage_path
                  )
                )
                FROM billing_policy_rule_sources rs
                WHERE rs.service_rule_id = sr.id
              ) AS sources_json
       FROM billing_policy_service_rules sr
       WHERE sr.billing_policy_profile_id = ?
       ORDER BY sr.service_code ASC`,
      [id]
    );
    return (rows || []).map((row) => ({
      ...row,
      eligibility: parseJson(row.eligibility_json) || [],
      sources: parseJson(row.sources_json) || []
    }));
  } catch (error) {
    if (isMissingPolicySchemaError(error)) return [];
    throw error;
  }
}

export async function upsertPolicyServiceRule({
  profileId,
  serviceCode,
  serviceDescription = null,
  minMinutes = null,
  maxMinutes = null,
  unitMinutes = null,
  unitCalcMode = 'NONE',
  maxUnitsPerDay = null,
  placeOfService = null,
  providerTypeNotes = null,
  metadataJson = null,
  createdByUserId = null
}) {
  const pid = toInt(profileId, 0);
  const code = normalizeCode(serviceCode);
  if (!pid || !code) {
    const err = new Error('profileId and serviceCode are required');
    err.status = 400;
    throw err;
  }
  await pool.execute(
    `INSERT INTO billing_policy_service_rules
       (billing_policy_profile_id, service_code, service_description, min_minutes, max_minutes, unit_minutes, unit_calc_mode, max_units_per_day, place_of_service, provider_type_notes, metadata_json, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       service_description = VALUES(service_description),
       min_minutes = VALUES(min_minutes),
       max_minutes = VALUES(max_minutes),
       unit_minutes = VALUES(unit_minutes),
       unit_calc_mode = VALUES(unit_calc_mode),
       max_units_per_day = VALUES(max_units_per_day),
       place_of_service = VALUES(place_of_service),
       provider_type_notes = VALUES(provider_type_notes),
       metadata_json = VALUES(metadata_json),
       updated_at = CURRENT_TIMESTAMP`,
    [
      pid,
      code,
      serviceDescription,
      toInt(minMinutes, 0) || null,
      toInt(maxMinutes, 0) || null,
      toInt(unitMinutes, 0) || null,
      String(unitCalcMode || 'NONE').toUpperCase(),
      toInt(maxUnitsPerDay, 0) || null,
      placeOfService,
      providerTypeNotes,
      metadataJson ? JSON.stringify(metadataJson) : null,
      createdByUserId
    ]
  );
  const rules = await listPolicyServiceRules({ profileId: pid });
  return rules.find((r) => normalizeCode(r.service_code) === code) || null;
}

export async function upsertPolicyEligibilityRule({
  serviceRuleId,
  credentialTier = null,
  providerType = null,
  allowed = true,
  minMinutesOverride = null,
  notes = null,
  metadataJson = null,
  createdByUserId = null
}) {
  const rid = toInt(serviceRuleId, 0);
  if (!rid) {
    const err = new Error('serviceRuleId is required');
    err.status = 400;
    throw err;
  }
  await pool.execute(
    `INSERT INTO billing_policy_eligibility_rules
       (service_rule_id, credential_tier, provider_type, allowed, min_minutes_override, notes, metadata_json, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       allowed = VALUES(allowed),
       min_minutes_override = VALUES(min_minutes_override),
       notes = VALUES(notes),
       metadata_json = VALUES(metadata_json),
       updated_at = CURRENT_TIMESTAMP`,
    [
      rid,
      normalizeCredentialTier(credentialTier) || null,
      String(providerType || '').trim() || null,
      allowed ? 1 : 0,
      toInt(minMinutesOverride, 0) || null,
      notes,
      metadataJson ? JSON.stringify(metadataJson) : null,
      createdByUserId
    ]
  );
  const [rows] = await pool.execute(
    `SELECT *
     FROM billing_policy_eligibility_rules
     WHERE service_rule_id = ?
     ORDER BY id DESC`,
    [rid]
  );
  return rows || [];
}

export async function addPolicyRuleSource({
  profileId,
  serviceRuleId = null,
  sourceStoragePath = null,
  sourceFileName = null,
  pageNumber = null,
  citationSnippet = null,
  metadataJson = null,
  createdByUserId = null
}) {
  const pid = toInt(profileId, 0);
  if (!pid) {
    const err = new Error('profileId is required');
    err.status = 400;
    throw err;
  }
  const [result] = await pool.execute(
    `INSERT INTO billing_policy_rule_sources
       (billing_policy_profile_id, service_rule_id, source_storage_path, source_file_name, page_number, citation_snippet, metadata_json, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      pid,
      toInt(serviceRuleId, 0) || null,
      sourceStoragePath,
      sourceFileName,
      toInt(pageNumber, 0) || null,
      citationSnippet,
      metadataJson ? JSON.stringify(metadataJson) : null,
      createdByUserId
    ]
  );
  const [rows] = await pool.execute(`SELECT * FROM billing_policy_rule_sources WHERE id = ? LIMIT 1`, [result.insertId]);
  return rows?.[0] || null;
}

export async function getAgencyPolicyActivation({ agencyId }) {
  const aid = toInt(agencyId, 0);
  if (!aid) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT a.*, p.state_code, p.policy_name, p.version_label, p.status AS profile_status
       FROM agency_billing_policy_activation a
       JOIN billing_policy_profiles p ON p.id = a.billing_policy_profile_id
       WHERE a.agency_id = ?
         AND a.is_active = TRUE
       LIMIT 1`,
      [aid]
    );
    return rows?.[0] || null;
  } catch (error) {
    if (isMissingPolicySchemaError(error)) return null;
    throw error;
  }
}

export async function setAgencyPolicyActivation({ agencyId, profileId, activatedByUserId = null }) {
  const aid = toInt(agencyId, 0);
  const pid = toInt(profileId, 0);
  if (!aid || !pid) {
    const err = new Error('agencyId and profileId are required');
    err.status = 400;
    throw err;
  }
  await pool.execute(
    `INSERT INTO agency_billing_policy_activation (agency_id, billing_policy_profile_id, activated_by_user_id, activated_at, is_active)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP, TRUE)
     ON DUPLICATE KEY UPDATE
       billing_policy_profile_id = VALUES(billing_policy_profile_id),
       activated_by_user_id = VALUES(activated_by_user_id),
       activated_at = CURRENT_TIMESTAMP,
       is_active = TRUE,
       updated_at = CURRENT_TIMESTAMP`,
    [aid, pid, activatedByUserId]
  );
  return await getAgencyPolicyActivation({ agencyId: aid });
}

export async function listAgencyServiceCodeActivation({ agencyId }) {
  const aid = toInt(agencyId, 0);
  if (!aid) return [];
  try {
    const [rows] = await pool.execute(
      `SELECT *
       FROM agency_service_code_activation
       WHERE agency_id = ?
       ORDER BY service_code ASC`,
      [aid]
    );
    return rows || [];
  } catch (error) {
    if (isMissingPolicySchemaError(error)) return [];
    throw error;
  }
}

export async function setAgencyServiceCodeActivation({ agencyId, serviceCode, isEnabled = true, updatedByUserId = null }) {
  const aid = toInt(agencyId, 0);
  const code = normalizeCode(serviceCode);
  if (!aid || !code) {
    const err = new Error('agencyId and serviceCode are required');
    err.status = 400;
    throw err;
  }
  await pool.execute(
    `INSERT INTO agency_service_code_activation (agency_id, service_code, is_enabled, updated_by_user_id)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       is_enabled = VALUES(is_enabled),
       updated_by_user_id = VALUES(updated_by_user_id),
       updated_at = CURRENT_TIMESTAMP`,
    [aid, code, isEnabled ? 1 : 0, updatedByUserId]
  );
  const [rows] = await pool.execute(
    `SELECT *
     FROM agency_service_code_activation
     WHERE agency_id = ? AND service_code = ?
     LIMIT 1`,
    [aid, code]
  );
  return rows?.[0] || null;
}

export async function resolvePolicyProfileForAgency({ agencyId, stateCode = DEFAULT_STATE_CODE }) {
  try {
    const activation = await getAgencyPolicyActivation({ agencyId });
    if (activation?.billing_policy_profile_id) {
      const activeProfile = await getBillingPolicyProfileById(activation.billing_policy_profile_id);
      if (activeProfile && String(activeProfile.status || '').toUpperCase() === 'PUBLISHED') {
        return activeProfile;
      }
    }
    const [rows] = await pool.execute(
      `SELECT *
       FROM billing_policy_profiles
       WHERE state_code = ?
         AND status = 'PUBLISHED'
       ORDER BY COALESCE(effective_start_date, '1900-01-01') DESC, id DESC
       LIMIT 1`,
      [String(stateCode || DEFAULT_STATE_CODE).toUpperCase()]
    );
    return rows?.[0] || null;
  } catch (error) {
    if (isMissingPolicySchemaError(error)) return null;
    throw error;
  }
}

export async function isServiceCodeEnabledForAgency({ agencyId, serviceCode }) {
  const aid = toInt(agencyId, 0);
  const code = normalizeCode(serviceCode);
  if (!aid || !code) return true;
  try {
    const [rows] = await pool.execute(
      `SELECT is_enabled
       FROM agency_service_code_activation
       WHERE agency_id = ?
         AND service_code = ?
       LIMIT 1`,
      [aid, code]
    );
    if (!rows?.[0]) return true;
    return Boolean(rows[0].is_enabled);
  } catch (error) {
    if (isMissingPolicySchemaError(error)) return true;
    throw error;
  }
}

function selectEligibilityForTier(eligibilityRows, credentialTier) {
  const tier = normalizeCredentialTier(credentialTier);
  const rows = Array.isArray(eligibilityRows) ? eligibilityRows : [];
  const tierRows = rows.filter((r) => normalizeCredentialTier(r.credential_tier) === tier);
  if (!tierRows.length) return { exists: false, allowed: true, minMinutesOverride: null };
  const allowed = tierRows.some((r) => Boolean(r.allowed));
  const override = tierRows.find((r) => toInt(r.min_minutes_override, 0) > 0);
  return { exists: true, allowed, minMinutesOverride: toInt(override?.min_minutes_override, 0) || null };
}

export async function resolvePolicyRuleForServiceCode({ agencyId, serviceCode, credentialTier = null }) {
  const code = normalizeCode(serviceCode);
  if (!code) return null;
  const profile = await resolvePolicyProfileForAgency({ agencyId });
  if (!profile?.id) return null;

  try {
    const [ruleRows] = await pool.execute(
      `SELECT *
       FROM billing_policy_service_rules
       WHERE billing_policy_profile_id = ?
         AND service_code = ?
         AND is_active = TRUE
       LIMIT 1`,
      [profile.id, code]
    );
    const rule = ruleRows?.[0] || null;
    if (!rule) return null;

    const [eligibilityRows] = await pool.execute(
      `SELECT *
       FROM billing_policy_eligibility_rules
       WHERE service_rule_id = ?`,
      [rule.id]
    );
    const eligibility = selectEligibilityForTier(eligibilityRows, credentialTier);

    const enabled = await isServiceCodeEnabledForAgency({ agencyId, serviceCode: code });
    const [sourceRows] = await pool.execute(
      `SELECT *
       FROM billing_policy_rule_sources
       WHERE service_rule_id = ?
       ORDER BY id DESC`,
      [rule.id]
    );

    return {
      policyProfileId: Number(profile.id),
      policyStateCode: String(profile.state_code || ''),
      policyVersionLabel: String(profile.version_label || ''),
      ruleId: Number(rule.id),
      serviceCode: code,
      serviceDescription: rule.service_description || null,
      minMinutes: eligibility.minMinutesOverride || (toInt(rule.min_minutes, 0) || null),
      maxMinutes: toInt(rule.max_minutes, 0) || null,
      unitMinutes: toInt(rule.unit_minutes, 0) || null,
      unitCalcMode: String(rule.unit_calc_mode || 'NONE').toUpperCase(),
      maxUnitsPerDay: toInt(rule.max_units_per_day, 0) || null,
      placeOfService: rule.place_of_service || null,
      providerTypeNotes: rule.provider_type_notes || null,
      enabledForAgency: enabled,
      allowedForCredentialTier: eligibility.allowed,
      eligibilityRows: eligibilityRows || [],
      sourceCitations: sourceRows || []
    };
  } catch (error) {
    if (isMissingPolicySchemaError(error)) return null;
    throw error;
  }
}

export async function listEligiblePolicyServiceCodes({ agencyId, credentialTier = null }) {
  const aid = toInt(agencyId, 0);
  if (!aid) return [];
  const profile = await resolvePolicyProfileForAgency({ agencyId: aid });
  if (!profile?.id) return [];
  try {
    const [ruleRows] = await pool.execute(
      `SELECT id, service_code
       FROM billing_policy_service_rules
       WHERE billing_policy_profile_id = ?
         AND is_active = TRUE
       ORDER BY service_code ASC`,
      [profile.id]
    );
    if (!Array.isArray(ruleRows) || !ruleRows.length) return [];
    const ruleIds = ruleRows.map((r) => toInt(r.id, 0)).filter(Boolean);
    const placeholders = ruleIds.map(() => '?').join(',');
    const [eligibilityRows] = ruleIds.length
      ? await pool.execute(
          `SELECT service_rule_id, credential_tier, allowed
           FROM billing_policy_eligibility_rules
           WHERE service_rule_id IN (${placeholders})`,
          ruleIds
        )
      : [[]];
    const byRule = new Map();
    for (const row of eligibilityRows || []) {
      const key = toInt(row?.service_rule_id, 0);
      if (!key) continue;
      if (!byRule.has(key)) byRule.set(key, []);
      byRule.get(key).push(row);
    }
    const [agencyRows] = await pool.execute(
      `SELECT service_code, is_enabled
       FROM agency_service_code_activation
       WHERE agency_id = ?`,
      [aid]
    );
    const agencyCodeEnabled = new Map(
      (agencyRows || []).map((r) => [normalizeCode(r?.service_code), Boolean(r?.is_enabled)])
    );
    const tier = normalizeCredentialTier(credentialTier);
    const out = [];
    for (const rule of ruleRows) {
      const code = normalizeCode(rule?.service_code);
      if (!code) continue;
      const ruleEligibility = byRule.get(toInt(rule?.id, 0)) || [];
      let allowedForTier = true;
      if (tier && ruleEligibility.length) {
        const tierRows = ruleEligibility.filter((r) => normalizeCredentialTier(r?.credential_tier) === tier);
        if (tierRows.length) {
          allowedForTier = tierRows.some((r) => Boolean(r?.allowed));
        }
      }
      const enabled = agencyCodeEnabled.has(code) ? agencyCodeEnabled.get(code) : true;
      if (enabled && allowedForTier) out.push(code);
    }
    return out;
  } catch (error) {
    if (isMissingPolicySchemaError(error)) return [];
    throw error;
  }
}

export function computeUnitsFromRule({ minutes, minMinutes = null, maxMinutes = null, unitMinutes = null, unitCalcMode = 'NONE' }) {
  const m = toInt(minutes, 0);
  const min = toInt(minMinutes, 0) || null;
  const max = toInt(maxMinutes, 0) || null;
  const unit = toInt(unitMinutes, 0) || null;
  const mode = String(unitCalcMode || 'NONE').toUpperCase();

  if (m <= 0) return 0;
  if (min && m < min) return 0;
  if (max && m > max && !unit) return 0;

  if (mode === 'MEDICAID_8_MINUTE_LADDER') {
    const effectiveStart = min || MEDICAID_8_MIN_MINUTES;
    if (m < effectiveStart) return 0;
    const assumedUnit = unit || 15;
    return Math.max(1, Math.floor((m - effectiveStart) / assumedUnit) + 1);
  }
  if (mode === 'FIXED_BLOCK' && unit) {
    return Math.floor(m / unit);
  }
  if (unit) {
    return Math.max(1, Math.round(m / unit));
  }
  return 1;
}

export async function getDailyUnitsUsed({ agencyId, clientId, serviceCode, serviceDate, excludeChargeId = null }) {
  const aid = toInt(agencyId, 0);
  const cid = toInt(clientId, 0);
  const code = normalizeCode(serviceCode);
  const date = String(serviceDate || '').slice(0, 10);
  if (!aid || !cid || !code || !date) return 0;
  try {
    const params = [aid, cid, code, date];
    let exclusion = '';
    if (toInt(excludeChargeId, 0) > 0) {
      exclusion = ' AND id <> ?';
      params.push(toInt(excludeChargeId, 0));
    }
    const [rows] = await pool.execute(
      `SELECT COALESCE(SUM(COALESCE(units, 0)), 0) AS used_units
       FROM learning_session_charges
       WHERE agency_id = ?
         AND client_id = ?
         AND service_code = ?
         AND service_date = ?
         AND UPPER(charge_status) NOT IN ('VOIDED', 'REFUNDED')
         ${exclusion}`,
      params
    );
    return toInt(rows?.[0]?.used_units, 0);
  } catch (error) {
    if (isMissingPolicySchemaError(error)) return 0;
    throw error;
  }
}

export async function enforceDailyUnitsCap({
  agencyId,
  clientId,
  serviceCode,
  serviceDate,
  unitsToAdd,
  credentialTier = null,
  excludeChargeId = null
}) {
  const units = toInt(unitsToAdd, 0);
  if (units <= 0) return { ok: true, maxUnitsPerDay: null, usedUnits: 0, projectedUnits: 0 };

  const rule = await resolvePolicyRuleForServiceCode({ agencyId, serviceCode, credentialTier });
  const maxUnitsPerDay = toInt(rule?.maxUnitsPerDay, 0) || null;
  const usedUnits = await getDailyUnitsUsed({ agencyId, clientId, serviceCode, serviceDate, excludeChargeId });
  const projectedUnits = usedUnits + units;
  if (maxUnitsPerDay && projectedUnits > maxUnitsPerDay) {
    const err = new Error(`${normalizeCode(serviceCode)} exceeds daily cap (${projectedUnits}/${maxUnitsPerDay} units) for ${serviceDate}`);
    err.status = 400;
    err.code = 'SERVICE_CODE_DAILY_UNIT_CAP';
    err.meta = {
      serviceCode: normalizeCode(serviceCode),
      serviceDate,
      usedUnits,
      unitsToAdd: units,
      projectedUnits,
      maxUnitsPerDay
    };
    throw err;
  }

  return { ok: true, maxUnitsPerDay, usedUnits, projectedUnits };
}

export async function createIngestionJobFromUpload({
  profileId,
  stateCode = DEFAULT_STATE_CODE,
  fileBuffer,
  originalName,
  mimeType,
  createdByUserId = null
}) {
  const pid = toInt(profileId, 0);
  if (!pid) {
    const err = new Error('profileId is required');
    err.status = 400;
    throw err;
  }
  if (!fileBuffer || !(fileBuffer instanceof Buffer) || fileBuffer.length === 0) {
    const err = new Error('A PDF/text file is required');
    err.status = 400;
    throw err;
  }

  const safeExt = extFromMimeType(mimeType);
  const filename = `billing-policy-${pid}-${Date.now()}.${safeExt}`;
  const stored = await StorageService.saveAdminDoc(fileBuffer, filename, mimeType || 'application/pdf');
  const sourceSha256 = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  const extraction = await extractResumeTextFromUpload({ buffer: fileBuffer, mimeType });
  const extractedText = String(extraction?.text || '');
  const extractionStatus = extraction?.status === 'completed' ? 'COMPLETED' : 'FAILED';

  const [jobInsert] = await pool.execute(
    `INSERT INTO billing_policy_ingestion_jobs
       (billing_policy_profile_id, state_code, source_storage_path, source_file_name, source_sha256, extraction_method, extraction_status, extracted_text, error_text, created_by_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      pid,
      String(stateCode || DEFAULT_STATE_CODE).toUpperCase(),
      stored.relativePath,
      String(originalName || filename),
      sourceSha256,
      extraction?.method || null,
      extractionStatus,
      extractedText || null,
      extraction?.errorText || null,
      createdByUserId
    ]
  );
  const ingestionJobId = toInt(jobInsert.insertId, 0);

  if (extractedText) {
    const parsed = parseCandidateRowsFromExtractedText(extractedText);
    for (const row of parsed) {
      await pool.execute(
        `INSERT INTO billing_policy_ingestion_candidates
           (ingestion_job_id, service_code, service_description, min_minutes, max_minutes, unit_minutes, unit_calc_mode, max_units_per_day, credential_tier, provider_type, source_snippet, raw_text_line)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ingestionJobId,
          row.serviceCode,
          row.serviceDescription,
          row.minMinutes,
          row.maxMinutes,
          row.unitMinutes,
          row.unitCalcMode,
          row.maxUnitsPerDay,
          row.credentialTier,
          row.providerType,
          row.sourceSnippet,
          row.rawTextLine
        ]
      );
    }
  }

  const [rows] = await pool.execute(`SELECT * FROM billing_policy_ingestion_jobs WHERE id = ? LIMIT 1`, [ingestionJobId]);
  return rows?.[0] || null;
}

export async function listIngestionJobs({ profileId = null }) {
  try {
    const pid = toInt(profileId, 0);
    const params = [];
    const where = pid ? 'WHERE j.billing_policy_profile_id = ?' : '';
    if (pid) params.push(pid);
    const [rows] = await pool.execute(
      `SELECT j.*,
              p.policy_name,
              p.version_label,
              (
                SELECT COUNT(*)
                FROM billing_policy_ingestion_candidates c
                WHERE c.ingestion_job_id = j.id
              ) AS candidate_count
       FROM billing_policy_ingestion_jobs j
       JOIN billing_policy_profiles p ON p.id = j.billing_policy_profile_id
       ${where}
       ORDER BY j.created_at DESC, j.id DESC`,
      params
    );
    return rows || [];
  } catch (error) {
    if (isMissingPolicySchemaError(error)) return [];
    throw error;
  }
}

export async function getIngestionJobDetail(jobId) {
  const id = toInt(jobId, 0);
  if (!id) return null;
  try {
    const [jobRows] = await pool.execute(`SELECT * FROM billing_policy_ingestion_jobs WHERE id = ? LIMIT 1`, [id]);
    const job = jobRows?.[0] || null;
    if (!job) return null;
    const [candidateRows] = await pool.execute(
      `SELECT *
       FROM billing_policy_ingestion_candidates
       WHERE ingestion_job_id = ?
       ORDER BY id ASC`,
      [id]
    );
    return { ...job, candidates: candidateRows || [] };
  } catch (error) {
    if (isMissingPolicySchemaError(error)) return null;
    throw error;
  }
}

export async function reviewIngestionCandidate({
  candidateId,
  status,
  serviceDescription = undefined,
  minMinutes = undefined,
  maxMinutes = undefined,
  unitMinutes = undefined,
  unitCalcMode = undefined,
  maxUnitsPerDay = undefined,
  credentialTier = undefined,
  providerType = undefined,
  reviewNotes = undefined,
  reviewedByUserId = null
}) {
  const id = toInt(candidateId, 0);
  if (!id) return null;
  const [rows] = await pool.execute(`SELECT * FROM billing_policy_ingestion_candidates WHERE id = ? LIMIT 1`, [id]);
  const current = rows?.[0] || null;
  if (!current) return null;
  const safeStatus = String(status || current.status || 'PENDING').toUpperCase();
  await pool.execute(
    `UPDATE billing_policy_ingestion_candidates
     SET status = ?,
         service_description = ?,
         min_minutes = ?,
         max_minutes = ?,
         unit_minutes = ?,
         unit_calc_mode = ?,
         max_units_per_day = ?,
         credential_tier = ?,
         provider_type = ?,
         review_notes = ?,
         reviewed_by_user_id = ?,
         reviewed_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [
      safeStatus,
      serviceDescription === undefined ? current.service_description : serviceDescription,
      minMinutes === undefined ? current.min_minutes : (toInt(minMinutes, 0) || null),
      maxMinutes === undefined ? current.max_minutes : (toInt(maxMinutes, 0) || null),
      unitMinutes === undefined ? current.unit_minutes : (toInt(unitMinutes, 0) || null),
      unitCalcMode === undefined ? current.unit_calc_mode : String(unitCalcMode || 'NONE').toUpperCase(),
      maxUnitsPerDay === undefined ? current.max_units_per_day : (toInt(maxUnitsPerDay, 0) || null),
      credentialTier === undefined ? current.credential_tier : (normalizeCredentialTier(credentialTier) || null),
      providerType === undefined ? current.provider_type : (String(providerType || '').trim() || null),
      reviewNotes === undefined ? current.review_notes : (reviewNotes || null),
      reviewedByUserId,
      id
    ]
  );
  const [updatedRows] = await pool.execute(`SELECT * FROM billing_policy_ingestion_candidates WHERE id = ? LIMIT 1`, [id]);
  return updatedRows?.[0] || null;
}

export async function publishApprovedIngestionJob({ ingestionJobId, publishedByUserId = null }) {
  const id = toInt(ingestionJobId, 0);
  if (!id) {
    const err = new Error('ingestionJobId is required');
    err.status = 400;
    throw err;
  }
  const [jobRows] = await pool.execute(`SELECT * FROM billing_policy_ingestion_jobs WHERE id = ? LIMIT 1`, [id]);
  const job = jobRows?.[0] || null;
  if (!job) {
    const err = new Error('Ingestion job not found');
    err.status = 404;
    throw err;
  }

  const [approvedRows] = await pool.execute(
    `SELECT *
     FROM billing_policy_ingestion_candidates
     WHERE ingestion_job_id = ?
       AND status = 'APPROVED'
     ORDER BY id ASC`,
    [id]
  );
  for (const candidate of approvedRows || []) {
    const rule = await upsertPolicyServiceRule({
      profileId: job.billing_policy_profile_id,
      serviceCode: candidate.service_code,
      serviceDescription: candidate.service_description || null,
      minMinutes: candidate.min_minutes,
      maxMinutes: candidate.max_minutes,
      unitMinutes: candidate.unit_minutes,
      unitCalcMode: candidate.unit_calc_mode,
      maxUnitsPerDay: candidate.max_units_per_day,
      metadataJson: { ingestionJobId: id, ingestionCandidateId: candidate.id },
      createdByUserId: publishedByUserId
    });

    await addPolicyRuleSource({
      profileId: job.billing_policy_profile_id,
      serviceRuleId: rule?.id || null,
      sourceStoragePath: job.source_storage_path || null,
      sourceFileName: job.source_file_name || null,
      pageNumber: candidate.source_page_number || null,
      citationSnippet: candidate.source_snippet || null,
      metadataJson: { ingestionCandidateId: candidate.id },
      createdByUserId: publishedByUserId
    });

    if (candidate.credential_tier || candidate.provider_type) {
      await upsertPolicyEligibilityRule({
        serviceRuleId: rule.id,
        credentialTier: candidate.credential_tier || null,
        providerType: candidate.provider_type || null,
        allowed: true,
        createdByUserId: publishedByUserId,
        notes: 'Published from PDF ingestion candidate'
      });
    }

    await pool.execute(
      `UPDATE billing_policy_ingestion_candidates
       SET status = 'PUBLISHED',
           published_service_rule_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [rule?.id || null, candidate.id]
    );
  }

  await pool.execute(
    `UPDATE billing_policy_ingestion_jobs
     SET review_status = 'PUBLISHED',
         published_by_user_id = ?,
         published_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [publishedByUserId, id]
  );

  return await getIngestionJobDetail(id);
}
