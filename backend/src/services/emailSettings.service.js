import PlatformEmailSettings from '../models/PlatformEmailSettings.model.js';
import AgencyEmailSettings from '../models/AgencyEmailSettings.model.js';
import SchoolEmailAiPolicyOverride from '../models/SchoolEmailAiPolicyOverride.model.js';

export function normalizeEmailSendingMode(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'manual_only') return 'manual_only';
  if (v === 'all') return 'all';
  return 'all';
}

export function normalizeEmailAiPolicyMode(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'draft_known_contacts_only') return 'draft_known_contacts_only';
  if (v === 'draft_known_accounts_only') return 'draft_known_accounts_only';
  if (v === 'draft_known_contacts_or_accounts') return 'draft_known_contacts_or_accounts';
  return 'human_only';
}

export function normalizeEmailAiIntentClasses(value) {
  const raw = Array.isArray(value) ? value : [value];
  const valid = new Set(['school_status_request']);
  const out = raw
    .map((v) => String(v || '').trim().toLowerCase())
    .filter((v) => valid.has(v));
  return out.length ? Array.from(new Set(out)) : ['school_status_request'];
}

export function normalizeEmailAiConfidenceThreshold(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.75;
  return Math.min(0.99, Math.max(0.5, n));
}

export function normalizeSenderIdentityKeys(value) {
  const raw = Array.isArray(value) ? value : [];
  return Array.from(new Set(raw.map((v) => String(v || '').trim().toLowerCase()).filter(Boolean)));
}

export async function getPlatformEmailSettings() {
  const row = await PlatformEmailSettings.get();
  return {
    sendingMode: normalizeEmailSendingMode(row?.sending_mode || process.env.EMAIL_SENDING_MODE || 'all'),
    notificationsEnabled: row?.notifications_enabled !== undefined ? row.notifications_enabled !== 0 : true,
    missingTable: row?.missingTable === true
  };
}

export async function setEmailSendingMode(sendingMode, actorUserId = null) {
  const normalized = normalizeEmailSendingMode(sendingMode);
  const current = await getPlatformEmailSettings();
  const updated = await PlatformEmailSettings.update({
    sendingMode: normalized,
    notificationsEnabled: current.notificationsEnabled,
    actorUserId
  });
  return normalizeEmailSendingMode(updated?.sending_mode || normalized);
}

export async function setPlatformEmailSettings({ sendingMode, notificationsEnabled, actorUserId }) {
  const updated = await PlatformEmailSettings.update({
    sendingMode: normalizeEmailSendingMode(sendingMode),
    notificationsEnabled: notificationsEnabled !== false,
    actorUserId
  });
  return {
    sendingMode: normalizeEmailSendingMode(updated?.sending_mode || 'all'),
    notificationsEnabled: updated?.notifications_enabled !== 0
  };
}

export async function getAgencyEmailSettings(agencyId) {
  const row = await AgencyEmailSettings.getByAgencyId(agencyId);
  return {
    agencyId,
    notificationsEnabled: row?.notifications_enabled !== 0,
    aiDraftPolicyMode: normalizeEmailAiPolicyMode(row?.ai_draft_policy_mode || 'human_only'),
    allowSchoolOverrides: row?.allow_school_overrides !== 0,
    aiAllowedIntentClasses: normalizeEmailAiIntentClasses(row?.ai_allowed_intents_json || ['school_status_request']),
    aiMatchConfidenceThreshold: normalizeEmailAiConfidenceThreshold(row?.ai_match_confidence_threshold ?? 0.75),
    aiAllowedSenderIdentityKeys: normalizeSenderIdentityKeys(row?.ai_allowed_sender_identity_keys_json || [])
  };
}

export async function listAgencyEmailSettings(agencyIds) {
  const rows = await AgencyEmailSettings.listByAgencyIds(agencyIds);
  const byId = new Map((rows || []).map((r) => [Number(r.agency_id), r]));
  return (agencyIds || []).map((id) => {
    const row = byId.get(Number(id)) || null;
    return {
      agencyId: Number(id),
      notificationsEnabled: row ? row.notifications_enabled !== 0 : true,
      aiDraftPolicyMode: normalizeEmailAiPolicyMode(row?.ai_draft_policy_mode || 'human_only'),
      allowSchoolOverrides: row ? row.allow_school_overrides !== 0 : true,
      aiAllowedIntentClasses: normalizeEmailAiIntentClasses(row?.ai_allowed_intents_json || ['school_status_request']),
      aiMatchConfidenceThreshold: normalizeEmailAiConfidenceThreshold(row?.ai_match_confidence_threshold ?? 0.75),
      aiAllowedSenderIdentityKeys: normalizeSenderIdentityKeys(row?.ai_allowed_sender_identity_keys_json || [])
    };
  });
}

export async function listSchoolEmailAiPolicyOverrides(agencyId) {
  const rows = await SchoolEmailAiPolicyOverride.listByAgencyId(agencyId);
  return (rows || []).map((r) => ({
    id: Number(r.id),
    agencyId: Number(r.agency_id),
    schoolOrganizationId: Number(r.school_organization_id),
    schoolName: r.school_name || null,
    policyMode: normalizeEmailAiPolicyMode(r.policy_mode),
    allowedIntentClasses: r.allowed_intents_json ? normalizeEmailAiIntentClasses(r.allowed_intents_json) : null,
    matchConfidenceThreshold: r.match_confidence_threshold === null || r.match_confidence_threshold === undefined
      ? null
      : normalizeEmailAiConfidenceThreshold(r.match_confidence_threshold),
    allowedSenderIdentityKeys: Array.isArray(r.allowed_sender_identity_keys_json)
      ? normalizeSenderIdentityKeys(r.allowed_sender_identity_keys_json)
      : null,
    isActive: r.is_active !== 0
  }));
}

export async function upsertSchoolEmailAiPolicyOverride({
  agencyId,
  schoolOrganizationId,
  policyMode,
  allowedIntentClasses,
  matchConfidenceThreshold,
  allowedSenderIdentityKeys,
  isActive,
  updatedByUserId
}) {
  const row = await SchoolEmailAiPolicyOverride.upsert({
    agencyId,
    schoolOrganizationId,
    policyMode: normalizeEmailAiPolicyMode(policyMode),
    allowedIntents: Array.isArray(allowedIntentClasses) ? normalizeEmailAiIntentClasses(allowedIntentClasses) : null,
    matchConfidenceThreshold: matchConfidenceThreshold === null || matchConfidenceThreshold === undefined
      ? null
      : normalizeEmailAiConfidenceThreshold(matchConfidenceThreshold),
    allowedSenderIdentityKeys: Array.isArray(allowedSenderIdentityKeys)
      ? normalizeSenderIdentityKeys(allowedSenderIdentityKeys)
      : null,
    isActive: isActive !== false,
    updatedByUserId
  });
  if (!row) return null;
  return {
    id: Number(row.id),
    agencyId: Number(row.agency_id),
    schoolOrganizationId: Number(row.school_organization_id),
    schoolName: row.school_name || null,
    policyMode: normalizeEmailAiPolicyMode(row.policy_mode),
    allowedIntentClasses: row.allowed_intents_json ? normalizeEmailAiIntentClasses(row.allowed_intents_json) : null,
    matchConfidenceThreshold: row.match_confidence_threshold === null || row.match_confidence_threshold === undefined
      ? null
      : normalizeEmailAiConfidenceThreshold(row.match_confidence_threshold),
    allowedSenderIdentityKeys: Array.isArray(row.allowed_sender_identity_keys_json)
      ? normalizeSenderIdentityKeys(row.allowed_sender_identity_keys_json)
      : null,
    isActive: row.is_active !== 0
  };
}

export async function removeSchoolEmailAiPolicyOverride(schoolOrganizationId) {
  return await SchoolEmailAiPolicyOverride.removeBySchoolId(schoolOrganizationId);
}

export async function resolveEffectiveEmailAiPolicy({ agencyId, schoolOrganizationId }) {
  const agency = await getAgencyEmailSettings(agencyId);
  if (!agency.allowSchoolOverrides || !schoolOrganizationId) {
    return {
      mode: agency.aiDraftPolicyMode,
      allowedIntentClasses: agency.aiAllowedIntentClasses,
      matchConfidenceThreshold: agency.aiMatchConfidenceThreshold,
      allowedSenderIdentityKeys: agency.aiAllowedSenderIdentityKeys,
      source: 'agency_default'
    };
  }
  const row = await SchoolEmailAiPolicyOverride.findActiveBySchoolId(schoolOrganizationId);
  if (!row) {
    return {
      mode: agency.aiDraftPolicyMode,
      allowedIntentClasses: agency.aiAllowedIntentClasses,
      matchConfidenceThreshold: agency.aiMatchConfidenceThreshold,
      allowedSenderIdentityKeys: agency.aiAllowedSenderIdentityKeys,
      source: 'agency_default'
    };
  }
  return {
    mode: normalizeEmailAiPolicyMode(row.policy_mode),
    allowedIntentClasses: row.allowed_intents_json
      ? normalizeEmailAiIntentClasses(row.allowed_intents_json)
      : agency.aiAllowedIntentClasses,
    matchConfidenceThreshold: row.match_confidence_threshold === null || row.match_confidence_threshold === undefined
      ? agency.aiMatchConfidenceThreshold
      : normalizeEmailAiConfidenceThreshold(row.match_confidence_threshold),
    allowedSenderIdentityKeys: Array.isArray(row.allowed_sender_identity_keys_json)
      ? normalizeSenderIdentityKeys(row.allowed_sender_identity_keys_json)
      : agency.aiAllowedSenderIdentityKeys,
    source: 'school_override'
  };
}

export async function getEmailSendingMode() {
  const platform = await getPlatformEmailSettings();
  return platform.sendingMode;
}

export async function isEmailNotificationsEnabled({ agencyId, source } = {}) {
  if (String(source || '').trim().toLowerCase() === 'manual') return true;
  const platform = await getPlatformEmailSettings();
  if (!platform.notificationsEnabled) return false;
  if (!agencyId) return true;
  const agency = await getAgencyEmailSettings(agencyId);
  return agency.notificationsEnabled !== false;
}
