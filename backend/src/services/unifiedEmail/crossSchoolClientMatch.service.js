/**
 * Cross-school client matching for school support tickets.
 *
 * When a status email lands at Russell (or any school) naming students who may
 * already exist at a prior school, search the agency roster by name / initials
 * and surface candidates with prior-school context so staff can link the ticket
 * and optionally add an affiliation at the inbound school.
 */
import pool from '../../config/database.js';
import { deriveSchoolClientInitials } from '../../utils/schoolClientInitials.js';
import {
  extractClientReferencesHeuristic,
  matchSchoolClient
} from './inboundEmailPolicy.service.js';

function normalizeSpace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeAlphaNum(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Load agency clients (non-archived) with primary/current org name and whether
 * they already have an active affiliation at the target school.
 */
export async function listAgencyClientsForCrossSchoolMatch({
  agencyId,
  targetSchoolOrganizationId = null,
  limit = 2000
}) {
  const aid = Number(agencyId || 0);
  const tid = Number(targetSchoolOrganizationId || 0);
  if (!aid) return [];

  try {
    const [rows] = await pool.execute(
      `SELECT c.id,
              c.agency_id,
              c.organization_id,
              c.identifier_code,
              c.initials,
              c.full_name,
              c.first_name,
              c.last_name,
              c.status,
              org.name AS organization_name,
              CASE
                WHEN ? > 0 AND EXISTS (
                  SELECT 1 FROM client_organization_assignments coa
                  WHERE coa.client_id = c.id
                    AND coa.organization_id = ?
                    AND coa.is_active = TRUE
                ) THEN 1
                WHEN ? > 0 AND c.organization_id = ? THEN 1
                ELSE 0
              END AS at_target_school
       FROM clients c
       LEFT JOIN agencies org ON org.id = c.organization_id
       WHERE c.agency_id = ?
         AND (c.status IS NULL OR UPPER(c.status) <> 'ARCHIVED')
       ORDER BY c.id DESC
       LIMIT ${Math.min(Math.max(Number(limit) || 2000, 1), 5000)}`,
      [tid, tid, tid, tid, aid]
    );
    return (rows || []).map((r) => ({
      ...r,
      at_target_school: Number(r.at_target_school) === 1,
      priorSchoolName: r.organization_name || null
    }));
  } catch (e) {
    console.warn('[cross-school-match] listAgencyClients failed:', e?.message || e);
    return [];
  }
}

/**
 * Score a single query against the agency pool and annotate each candidate.
 */
export function scoreCrossSchoolCandidates({ query, clients, targetSchoolName = null }) {
  const result = matchSchoolClient({ query, clients });
  const annotated = (result.candidates || []).map((c) => {
    const client = c.client || {};
    const atTarget = Boolean(client.at_target_school);
    return {
      clientId: Number(client.id) || null,
      fullName: client.full_name || [client.first_name, client.last_name].filter(Boolean).join(' ') || null,
      initials: client.initials || deriveSchoolClientInitials(client.full_name || query) || null,
      identifierCode: client.identifier_code || null,
      score: Number(c.score) || 0,
      reason: c.reason || null,
      atTargetSchool: atTarget,
      priorSchoolName: atTarget ? null : (client.priorSchoolName || client.organization_name || null),
      organizationId: Number(client.organization_id) || null,
      needsSchoolTransfer: !atTarget,
      targetSchoolName: targetSchoolName || null,
      query
    };
  });
  return {
    match: result.match
      ? {
          clientId: Number(result.match.id) || null,
          fullName: result.match.full_name || null,
          initials: result.match.initials || null,
          atTargetSchool: Boolean(result.match.at_target_school),
          priorSchoolName: result.match.at_target_school
            ? null
            : (result.match.priorSchoolName || result.match.organization_name || null),
          needsSchoolTransfer: !result.match.at_target_school,
          organizationId: Number(result.match.organization_id) || null
        }
      : null,
    confidence: Number(result.confidence) || 0,
    reason: result.reason || null,
    candidates: annotated
  };
}

/**
 * Run full cross-school match for a ticket's subject/body.
 * Returns extracted references + per-query match results + flat candidate list
 * suitable for response-plan Match step UI.
 */
export async function rematchTicketClientsAcrossSchools({
  agencyId,
  schoolOrganizationId,
  schoolName = null,
  subject = '',
  bodyText = '',
  existingExtracted = null
}) {
  const refs = extractClientReferencesHeuristic({ subject, bodyText });
  if (existingExtracted && !refs.includes(existingExtracted)) {
    refs.unshift(String(existingExtracted).trim());
  }
  const uniqueRefs = Array.from(new Set(refs.map((r) => normalizeSpace(r)).filter(Boolean)));

  if (!uniqueRefs.length) {
    return {
      extractedReferences: [],
      primaryReference: null,
      match: null,
      confidence: 0,
      reason: 'no_extracted_reference',
      candidates: [],
      perReference: []
    };
  }

  const clients = await listAgencyClientsForCrossSchoolMatch({
    agencyId,
    targetSchoolOrganizationId: schoolOrganizationId
  });

  const perReference = uniqueRefs.map((query) => {
    const scored = scoreCrossSchoolCandidates({
      query,
      clients,
      targetSchoolName: schoolName
    });
    return { query, ...scored };
  });

  // Prefer a match already at the target school; otherwise take the strongest overall.
  let best = null;
  for (const entry of perReference) {
    if (!entry.match) continue;
    if (!best || entry.confidence > best.confidence) best = entry;
    if (entry.match.atTargetSchool && entry.confidence >= 0.75) {
      best = entry;
      break;
    }
  }

  // Flatten unique candidates (by clientId) across all references, best score first.
  const byId = new Map();
  for (const entry of perReference) {
    for (const c of entry.candidates || []) {
      if (!c.clientId) continue;
      const prev = byId.get(c.clientId);
      if (!prev || c.score > prev.score) byId.set(c.clientId, c);
    }
  }
  const candidates = Array.from(byId.values()).sort((a, b) => b.score - a.score).slice(0, 8);

  return {
    extractedReferences: uniqueRefs,
    primaryReference: best?.query || uniqueRefs[0] || null,
    match: best?.match || null,
    confidence: best?.confidence || 0,
    reason: best?.reason || (candidates.length ? 'candidates_only' : 'no_match'),
    candidates,
    perReference
  };
}

/**
 * Add (or reactivate) a client affiliation at the target school.
 * Does NOT change primary org unless makePrimary is true.
 */
export async function addClientSchoolAffiliation({
  clientId,
  schoolOrganizationId,
  makePrimary = false,
  actorUserId = null
}) {
  const cid = Number(clientId || 0);
  const sid = Number(schoolOrganizationId || 0);
  if (!cid || !sid) {
    throw Object.assign(new Error('clientId and schoolOrganizationId required'), { status: 400 });
  }

  await pool.execute(
    `INSERT INTO client_organization_assignments (client_id, organization_id, is_primary, is_active)
     VALUES (?, ?, ?, TRUE)
     ON DUPLICATE KEY UPDATE is_active = TRUE, is_primary = GREATEST(is_primary, VALUES(is_primary))`,
    [cid, sid, makePrimary ? 1 : 0]
  );

  if (makePrimary) {
    await pool.execute(
      `UPDATE client_organization_assignments
       SET is_primary = CASE WHEN organization_id = ? THEN TRUE ELSE FALSE END
       WHERE client_id = ?`,
      [sid, cid]
    );
    await pool.execute(
      `UPDATE clients SET organization_id = ?, updated_by_user_id = ? WHERE id = ?`,
      [sid, actorUserId || null, cid]
    );
  }

  return { clientId: cid, schoolOrganizationId: sid, makePrimary: !!makePrimary };
}
