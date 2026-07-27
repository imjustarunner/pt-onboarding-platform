import pool from '../../config/database.js';
import EmailSenderIdentity from '../../models/EmailSenderIdentity.model.js';
import AgencyEmailSettings from '../../models/AgencyEmailSettings.model.js';

const SCHOOLREPLY_KEYS = new Set(['schoolreply', 'school_reply']);
const DEFAULT_FROM = 'schoolreply@itsco.health';
const DEFAULT_REPLY_TO = 'schools@itsco.health';
const DEFAULT_ALIASES = ['schoolreply@itsco.health', 'schools@itsco.health'];

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function uniqueEmails(list) {
  return Array.from(new Set((list || []).map(normalizeEmail).filter((e) => e.includes('@'))));
}

export async function resolveAgencyBySlug(slug = 'itsco') {
  const needle = String(slug || 'itsco').trim().toLowerCase();
  const [rows] = await pool.execute(
    `SELECT id, name, slug
     FROM agencies
     WHERE LOWER(COALESCE(slug, '')) = ?
        OR LOWER(COALESCE(name, '')) = ?
     ORDER BY id ASC
     LIMIT 1`,
    [needle, needle]
  );
  return rows?.[0] || null;
}

export async function listAgencySchoolGroupEmails(agencyId) {
  const aid = Number(agencyId);
  if (!aid) return [];
  const [rows] = await pool.execute(
    `SELECT DISTINCT
        a.id AS school_organization_id,
        a.name AS school_name,
        LOWER(TRIM(sp.itsco_email)) AS itsco_email
     FROM school_profiles sp
     JOIN agencies a ON a.id = sp.school_organization_id
     LEFT JOIN organization_affiliations oa
       ON oa.organization_id = sp.school_organization_id
      AND oa.is_active = TRUE
     LEFT JOIN agency_schools asch
       ON asch.school_organization_id = sp.school_organization_id
      AND asch.is_active = TRUE
     WHERE (oa.agency_id = ? OR asch.agency_id = ?)
       AND sp.itsco_email IS NOT NULL
       AND TRIM(sp.itsco_email) <> ''
     ORDER BY a.name ASC`,
    [aid, aid]
  );
  return (rows || []).map((r) => ({
    schoolOrganizationId: Number(r.school_organization_id),
    schoolName: r.school_name || null,
    itscoEmail: normalizeEmail(r.itsco_email)
  })).filter((r) => r.itscoEmail.includes('@'));
}

async function findSchoolreplyIdentity(agencyId) {
  const aid = Number(agencyId);
  const [rows] = await pool.execute(
    `SELECT *
     FROM email_sender_identities
     WHERE agency_id = ?
       AND LOWER(identity_key) IN ('schoolreply', 'school_reply')
     ORDER BY is_active DESC, id ASC
     LIMIT 1`,
    [aid]
  );
  const row = rows?.[0] || null;
  if (!row) return null;
  let inbound = [];
  try {
    inbound = typeof row.inbound_addresses_json === 'string'
      ? JSON.parse(row.inbound_addresses_json)
      : (row.inbound_addresses_json || []);
  } catch {
    inbound = [];
  }
  return { ...row, inbound_addresses: Array.isArray(inbound) ? inbound : [] };
}

/**
 * Strip shared school aliases off non-schoolreply identities (e.g. job_applications)
 * so routing ownership moves cleanly to schoolreply.
 */
async function reclaimAliasesFromOtherIdentities({ agencyId, keepIdentityId, aliases }) {
  const aid = Number(agencyId);
  const keepId = Number(keepIdentityId);
  const reclaim = new Set(uniqueEmails(aliases));
  if (!aid || !keepId || !reclaim.size) return { cleanedIdentities: 0 };

  const [rows] = await pool.execute(
    `SELECT id, identity_key, inbound_addresses_json
     FROM email_sender_identities
     WHERE (agency_id = ? OR agency_id IS NULL)
       AND id <> ?`,
    [aid, keepId]
  );

  let cleanedIdentities = 0;
  for (const row of rows || []) {
    let list = [];
    try {
      list = typeof row.inbound_addresses_json === 'string'
        ? JSON.parse(row.inbound_addresses_json)
        : (row.inbound_addresses_json || []);
    } catch {
      list = [];
    }
    if (!Array.isArray(list) || !list.length) continue;
    const next = uniqueEmails(list).filter((e) => !reclaim.has(e));
    const prev = uniqueEmails(list);
    if (next.length === prev.length) continue;
    await EmailSenderIdentity.update(row.id, { inboundAddresses: next });
    cleanedIdentities += 1;
  }
  return { cleanedIdentities };
}

/**
 * Ensure ITSCO (or given agency) has an active schoolreply identity whose inbound
 * addresses include schoolreply@, schools@, and every school group (itsco_email).
 * Also sets agency AI draft policy for status + reinit ticket drafting.
 */
export async function syncSchoolEmailInboundForAgency({
  agencyId = null,
  agencySlug = 'itsco',
  fromEmail = DEFAULT_FROM,
  replyTo = DEFAULT_REPLY_TO,
  displayName = 'ITSCO School Reply',
  configureAiPolicy = true,
  actorUserId = null
} = {}) {
  let agency = null;
  if (agencyId) {
    const [rows] = await pool.execute(`SELECT id, name, slug FROM agencies WHERE id = ? LIMIT 1`, [Number(agencyId)]);
    agency = rows?.[0] || null;
  } else {
    agency = await resolveAgencyBySlug(agencySlug);
  }
  if (!agency?.id) {
    const err = new Error(`Agency not found for slug/id (${agencySlug || agencyId})`);
    err.status = 404;
    throw err;
  }

  const aid = Number(agency.id);
  const schools = await listAgencySchoolGroupEmails(aid);
  const schoolEmails = uniqueEmails(schools.map((s) => s.itscoEmail));
  const aliasEmails = uniqueEmails([fromEmail, replyTo, ...DEFAULT_ALIASES]);
  const inboundAddresses = uniqueEmails([...aliasEmails, ...schoolEmails]);

  let identity = await findSchoolreplyIdentity(aid);
  if (!identity) {
    identity = await EmailSenderIdentity.create({
      agencyId: aid,
      identityKey: 'schoolreply',
      displayName,
      fromEmail: normalizeEmail(fromEmail) || DEFAULT_FROM,
      replyTo: normalizeEmail(replyTo) || DEFAULT_REPLY_TO,
      inboundAddresses,
      isActive: true
    });
  } else {
    const merged = uniqueEmails([...(identity.inbound_addresses || []), ...inboundAddresses]);
    identity = await EmailSenderIdentity.update(identity.id, {
      identityKey: 'schoolreply',
      displayName: displayName || identity.display_name || 'ITSCO School Reply',
      fromEmail: normalizeEmail(fromEmail) || identity.from_email || DEFAULT_FROM,
      replyTo: normalizeEmail(replyTo) || identity.reply_to || DEFAULT_REPLY_TO,
      inboundAddresses: merged,
      isActive: true
    });
  }

  const reclaim = await reclaimAliasesFromOtherIdentities({
    agencyId: aid,
    keepIdentityId: identity.id,
    aliases: aliasEmails
  });

  // Re-apply inbound on schoolreply after reclaim (ON DUPLICATE KEY moves ownership).
  identity = await EmailSenderIdentity.update(identity.id, {
    inboundAddresses: uniqueEmails([...(identity.inbound_addresses || []), ...inboundAddresses])
  });

  let aiPolicy = null;
  if (configureAiPolicy) {
    const current = await AgencyEmailSettings.getByAgencyId(aid);
    const existingKeys = Array.isArray(current.ai_allowed_sender_identity_keys_json)
      ? current.ai_allowed_sender_identity_keys_json.map((k) => String(k || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const keySet = Array.from(new Set([...existingKeys, 'schoolreply']));

    // Prefer drafting for known school contacts/accounts; keep human review via tickets.
    const desiredMode = current.ai_draft_policy_mode === 'human_only'
      ? 'draft_known_contacts_or_accounts'
      : (current.ai_draft_policy_mode || 'draft_known_contacts_or_accounts');

    const existingIntents = Array.isArray(current.ai_allowed_intents_json)
      ? current.ai_allowed_intents_json
      : ['school_status_request'];
    const intents = Array.from(new Set([
      ...existingIntents.map((x) => String(x || '').trim().toLowerCase()).filter(Boolean),
      'school_status_request',
      'school_reinit_update'
    ]));

    aiPolicy = await AgencyEmailSettings.update({
      agencyId: aid,
      notificationsEnabled: current.notifications_enabled !== 0,
      aiDraftPolicyMode: desiredMode,
      allowSchoolOverrides: current.allow_school_overrides !== 0,
      aiAllowedIntents: intents,
      aiMatchConfidenceThreshold: current.ai_match_confidence_threshold ?? 0.75,
      // Empty keys = allow all; if they already restricted keys, ensure schoolreply is included.
      aiAllowedSenderIdentityKeys: existingKeys.length ? keySet : [],
      actorUserId
    });
  }

  const missingSchools = await listSchoolsMissingGroupEmail(aid);

  return {
    agency: { id: aid, name: agency.name, slug: agency.slug },
    identity: {
      id: Number(identity.id),
      identityKey: identity.identity_key,
      fromEmail: identity.from_email,
      replyTo: identity.reply_to,
      inboundCount: (identity.inbound_addresses || []).length,
      inboundAddresses: identity.inbound_addresses || []
    },
    schoolsRouted: schools.length,
    schoolEmails,
    missingGroupEmailCount: missingSchools.length,
    missingGroupEmails: missingSchools,
    cleanedOtherIdentities: reclaim.cleanedIdentities,
    aiPolicy: aiPolicy
      ? {
          mode: aiPolicy.ai_draft_policy_mode,
          intents: aiPolicy.ai_allowed_intents_json,
          allowedSenderIdentityKeys: aiPolicy.ai_allowed_sender_identity_keys_json
        }
      : null
  };
}

async function listSchoolsMissingGroupEmail(agencyId) {
  const aid = Number(agencyId);
  const [rows] = await pool.execute(
    `SELECT DISTINCT a.id AS school_organization_id, a.name AS school_name
     FROM agencies a
     LEFT JOIN organization_affiliations oa
       ON oa.organization_id = a.id AND oa.is_active = TRUE
     LEFT JOIN agency_schools asch
       ON asch.school_organization_id = a.id AND asch.is_active = TRUE
     LEFT JOIN school_profiles sp ON sp.school_organization_id = a.id
     WHERE (oa.agency_id = ? OR asch.agency_id = ?)
       AND LOWER(COALESCE(a.organization_type, 'school')) IN ('school', 'program', 'learning', '')
       AND (sp.itsco_email IS NULL OR TRIM(sp.itsco_email) = '')
     ORDER BY a.name ASC
     LIMIT 200`,
    [aid, aid]
  );
  return (rows || []).map((r) => ({
    schoolOrganizationId: Number(r.school_organization_id),
    schoolName: r.school_name || null
  }));
}

export {
  DEFAULT_FROM,
  DEFAULT_REPLY_TO,
  SCHOOLREPLY_KEYS
};
