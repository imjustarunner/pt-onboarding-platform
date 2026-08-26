import pool from '../config/database.js';
import Client from '../models/Client.model.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function uniqueIds(list) {
  return [...new Set((list || []).map((n) => safeInt(n)).filter(Boolean))];
}

/**
 * Active tenant memberships for a client (primary + client_agency_assignments).
 */
export async function listClientAgencyMembershipIds(clientId) {
  const cid = safeInt(clientId);
  if (!cid) return [];

  const client = await Client.findById(cid);
  const ids = [];
  const primary = safeInt(client?.agency_id);
  if (primary) ids.push(primary);

  try {
    const [rows] = await pool.execute(
      `SELECT agency_id
       FROM client_agency_assignments
       WHERE client_id = ?
         AND is_active = TRUE`,
      [cid]
    );
    for (const row of rows || []) {
      const id = safeInt(row?.agency_id);
      if (id) ids.push(id);
    }
  } catch (e) {
    const msg = String(e?.message || '');
    if (!(msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE'))) throw e;
  }

  return uniqueIds(ids);
}

/**
 * Resolve draft agency from client ownership (+ optional provider access / preference).
 * Mirrors frontend resolveNoteAidAgencyId.
 */
export function resolveNoteAidAgencyId({
  clientAgencyId = null,
  clientAgencyIds = [],
  providerAgencyIds = null,
  preferredAgencyId = null,
  preferLearningSponsor = false,
  learningSponsorAgencyIds = []
} = {}) {
  const primary = safeInt(clientAgencyId);
  const memberships = uniqueIds([...(primary ? [primary] : []), ...clientAgencyIds]);
  if (!memberships.length) {
    const preferred = safeInt(preferredAgencyId);
    return {
      agencyId: preferred,
      needsChoice: false,
      candidates: preferred ? [preferred] : []
    };
  }

  const providerIds = providerAgencyIds == null ? null : uniqueIds(providerAgencyIds);
  let candidates = memberships;
  if (providerIds && providerIds.length) {
    const providerSet = new Set(providerIds);
    const overlap = memberships.filter((id) => providerSet.has(id));
    if (overlap.length) candidates = overlap;
  }

  const preferred = safeInt(preferredAgencyId);
  if (preferred && candidates.includes(preferred)) {
    return { agencyId: preferred, needsChoice: false, candidates };
  }

  if (preferLearningSponsor) {
    const learningSet = new Set(uniqueIds(learningSponsorAgencyIds));
    const learningHits = candidates.filter((id) => learningSet.has(id));
    if (learningHits.length === 1) {
      return { agencyId: learningHits[0], needsChoice: false, candidates: learningHits };
    }
    if (learningHits.length > 1) {
      if (primary && learningHits.includes(primary)) {
        return { agencyId: primary, needsChoice: false, candidates: learningHits };
      }
      return { agencyId: null, needsChoice: true, candidates: learningHits };
    }
  }

  if (candidates.length === 1) {
    return { agencyId: candidates[0], needsChoice: false, candidates };
  }
  if (primary && candidates.includes(primary)) {
    return { agencyId: primary, needsChoice: false, candidates };
  }
  if (candidates.length > 1) {
    return { agencyId: null, needsChoice: true, candidates };
  }
  return { agencyId: null, needsChoice: false, candidates: [] };
}

/**
 * Coerce a requested agencyId for a linked client to a valid ownership tenant.
 * Returns { agencyId, memberships, error? }.
 */
export async function coerceNoteAidAgencyForClient({
  clientId,
  preferredAgencyId = null,
  providerAgencyIds = null,
  preferLearningSponsor = false,
  learningSponsorAgencyIds = []
} = {}) {
  const cid = safeInt(clientId);
  if (!cid) {
    return { agencyId: safeInt(preferredAgencyId), memberships: [] };
  }

  const memberships = await listClientAgencyMembershipIds(cid);
  if (!memberships.length) {
    return { agencyId: safeInt(preferredAgencyId), memberships: [] };
  }

  const client = await Client.findById(cid);
  const resolved = resolveNoteAidAgencyId({
    clientAgencyId: client?.agency_id,
    clientAgencyIds: memberships,
    providerAgencyIds,
    preferredAgencyId,
    preferLearningSponsor,
    learningSponsorAgencyIds
  });

  if (resolved.agencyId) {
    return { agencyId: resolved.agencyId, memberships, needsChoice: false };
  }

  if (resolved.needsChoice) {
    return {
      agencyId: null,
      memberships: resolved.candidates,
      needsChoice: true,
      error: 'Choose which tenant this note belongs to for this multi-tenant client'
    };
  }

  return {
    agencyId: memberships[0] || safeInt(preferredAgencyId),
    memberships,
    needsChoice: false
  };
}

/**
 * Allow remapping a draft onto another agency when the target is a valid client membership.
 */
export function canRemapDraftAgency({ existingAgencyId, nextAgencyId, memberships = [] } = {}) {
  const next = safeInt(nextAgencyId);
  const existing = safeInt(existingAgencyId);
  if (!next) return false;
  if (!existing || existing === next) return true;
  const set = new Set(uniqueIds(memberships));
  if (!set.size) return false;
  // Always allow move onto a client-owned tenant (corrects workspace-stamped drafts).
  return set.has(next);
}
