import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import Agency from '../models/Agency.model.js';
import PhoneNumber from '../models/PhoneNumber.model.js';
import PhoneNumberAssignment from '../models/PhoneNumberAssignment.model.js';
import UserPreferences from '../models/UserPreferences.model.js';

const pickFirst = (rows) => (rows && rows.length ? rows[0] : null);

async function findAgencyIdForUser(userId) {
  const agencies = await User.getAgencies(userId);
  return agencies?.[0]?.id || null;
}

async function userHasAgency(userId, agencyId) {
  if (!userId || !agencyId) return false;
  const agencies = await User.getAgencies(userId);
  return (agencies || []).some((a) => Number(a?.id) === Number(agencyId));
}

async function findFallbackAgencyNumber(agencyId) {
  if (!agencyId) return null;
  const numbers = await PhoneNumber.listByAgency(agencyId, { includeInactive: false });
  return pickFirst(numbers);
}

async function findAssignedUserForNumber(numberId) {
  if (!numberId) return null;
  const assignments = await PhoneNumberAssignment.listByNumberId(numberId);
  return pickFirst(assignments);
}

async function findSupportStaffIdsForAgency(agencyId) {
  if (!agencyId) return [];
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     JOIN user_agencies ua ON u.id = ua.user_id
     WHERE ua.agency_id = ?
       AND u.role = 'support'
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)`,
    [agencyId]
  );
  return rows.map((r) => r.id);
}

async function findAnyAdminForAgency(agencyId) {
  if (!agencyId) return null;
  const [rows] = await pool.execute(
    `SELECT u.id
     FROM users u
     JOIN user_agencies ua ON u.id = ua.user_id
     WHERE ua.agency_id = ?
       AND u.role IN ('admin','support','super_admin','clinical_practice_assistant')
       AND u.is_active = TRUE
       AND (u.is_archived = FALSE OR u.is_archived IS NULL)
     ORDER BY u.role = 'admin' DESC
     LIMIT 1`,
    [agencyId]
  );
  return rows?.[0]?.id || null;
}

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

export async function resolveOutboundNumber({ userId, clientId, requestedNumberId = null }) {
  if (!userId) return { error: 'user_required' };

  if (requestedNumberId) {
    const number = await PhoneNumber.findById(requestedNumberId);
    if (!number || !number.is_active || number.status === 'released') {
      return { error: 'number_unavailable' };
    }
    const assigned = await findAssignedUserForNumber(number.id);
    const eligibleIds = await PhoneNumberAssignment.listEligibleUserIdsForNumber(number.id);
    const userInPool = eligibleIds.some((id) => Number(id) === Number(userId));
    if (assigned && Number(assigned.user_id) !== Number(userId) && !userInPool) {
      return { error: 'number_not_assigned' };
    }
    if (!assigned && !userInPool) {
      const ok = await userHasAgency(userId, number.agency_id);
      if (!ok) return { error: 'number_not_accessible' };
    }
    return { number, assignment: assigned || null, ownerType: assigned || userInPool ? 'staff' : 'agency' };
  }

  const primary = await PhoneNumberAssignment.findPrimaryForUser(userId);
  if (primary?.number_id) {
    const number = await PhoneNumber.findById(primary.number_id);
    if (number && number.is_active && number.status !== 'released') {
      return { number, assignment: primary, ownerType: 'staff' };
    }
  }

  // Healthcare tenant type check: if they have a "Provider and Support Number" configured,
  // we use that as the fallback for providers who don't have a personal number.
  if (userId) {
    const agencyId = await findAgencyIdForUser(userId);
    const agency = agencyId ? await Agency.findById(agencyId) : null;
    const orgType = String(agency?.organization_type || '').toLowerCase();
    
    if (orgType === 'clinical' || orgType === 'healthcare') {
      const agencyNumber = await findFallbackAgencyNumber(agencyId);
      if (agencyNumber) {
        return { number: agencyNumber, assignment: null, ownerType: 'agency' };
      }
    }
  }

  // Provider-only model: no agency fallback for client texting/calling for other types.
  return { number: null, assignment: null, ownerType: null };
}

export async function resolveReminderNumber({ providerUserId, clientId = null }) {
  const uid = Number(providerUserId || 0);
  if (!uid) return { number: null, assignment: null, ownerType: null };

  const agencyId = clientId
    ? (await Client.findById(clientId, { includeSensitive: false }))?.agency_id
    : (await findAgencyIdForUser(uid));
  const agency = agencyId ? await Agency.findById(agencyId) : null;
  const flags = parseFeatureFlags(agency?.feature_flags);
  const senderMode = String(flags.smsReminderSenderMode || 'agency_default');
  const prefs = await UserPreferences.findByUserId(uid);
  const useOwnNumber = prefs?.sms_use_own_number_for_reminders !== false && prefs?.sms_use_own_number_for_reminders !== 0;
  if (senderMode !== 'provider_optional' || !useOwnNumber) {
    const agencyNumber = await findFallbackAgencyNumber(agencyId);
    return agencyNumber
      ? { number: agencyNumber, assignment: null, ownerType: 'agency' }
      : { number: null, assignment: null, ownerType: null };
  }

  return resolveOutboundNumber({ userId: uid, clientId, requestedNumberId: null });
}

/**
 * Active caregivers for a client from client_provider_assignments (+ legacy provider_id).
 * Returns { ownerUserId, caregiverIds } with primary preferred as owner.
 */
export async function resolveClientCaregivers(clientId, agencyId = null) {
  if (!clientId) return { ownerUserId: null, caregiverIds: [] };
  const params = [clientId];
  let orgFilter = '';
  if (agencyId) {
    // Prefer CPA rows tied to orgs under this agency when possible; otherwise all active CPA.
    orgFilter = '';
  }
  const [rows] = await pool.execute(
    `SELECT provider_user_id, is_primary
     FROM client_provider_assignments
     WHERE client_id = ?
       AND is_active = TRUE
       ${orgFilter}
     ORDER BY is_primary DESC, id ASC`,
    params
  );
  const caregiverIds = [];
  let ownerUserId = null;
  for (const r of rows || []) {
    const id = Number(r.provider_user_id);
    if (!Number.isFinite(id) || id < 1) continue;
    if (!caregiverIds.includes(id)) caregiverIds.push(id);
    if (!ownerUserId && (r.is_primary || r.is_primary === 1)) ownerUserId = id;
  }
  if (!ownerUserId && caregiverIds.length) ownerUserId = caregiverIds[0];

  if (!ownerUserId) {
    const client = await Client.findById(clientId, { includeSensitive: false });
    const legacy = Number(client?.provider_id || 0);
    if (legacy > 0) {
      ownerUserId = legacy;
      if (!caregiverIds.includes(legacy)) caregiverIds.push(legacy);
    }
  }

  if (agencyId && caregiverIds.length) {
    const filtered = [];
    for (const id of caregiverIds) {
      if (await userHasAgency(id, agencyId)) filtered.push(id);
    }
    if (filtered.length) {
      const ownerOk = ownerUserId && filtered.includes(Number(ownerUserId));
      return {
        ownerUserId: ownerOk ? ownerUserId : filtered[0],
        caregiverIds: filtered
      };
    }
  }

  return { ownerUserId, caregiverIds };
}

export async function resolveInboundRoute({ toNumber, fromNumber }) {
  const { normalizeNumberPurpose, skipsClinicalInbox, resolveProfilePhoneMatch } = await import(
    './smsProfileAudit.service.js'
  );
  const number = await PhoneNumber.findByPhoneNumber(toNumber);
  const purpose = normalizeNumberPurpose(number?.number_purpose || 'clinical_care');
  let ownerUser = null;
  let assignment = null;
  let ownerType = null;
  /** Eligible user IDs for notifications (care team + optional support observe). */
  let eligibleUserIds = [];
  let careOwnerUserId = null;
  let careState = 'under_care';
  let supportAccess = 'observe';
  let matchedUserId = null;

  // Non-clinical purposes (notification, tenant/platform contact, provider contact) skip care inbox.
  if (number && skipsClinicalInbox(purpose)) {
    const profile = await resolveProfilePhoneMatch(fromNumber, { agencyId: number.agency_id || null });
    const client = profile.clients?.[0] || (await Client.findByContactPhone(fromNumber));
    let supportOwner = null;
    let supportEligible = [];
    if (purpose === 'provider_contact' && number.id) {
      assignment = await findAssignedUserForNumber(number.id);
      if (assignment?.user_id) {
        supportOwner = await User.findById(assignment.user_id);
        supportEligible = [assignment.user_id];
      }
    }
    if (!supportOwner && number.agency_id) {
      const supportIds = await findSupportStaffIdsForAgency(number.agency_id);
      if (supportIds?.length) {
        supportOwner = await User.findById(supportIds[0]);
        supportEligible = supportIds;
      }
    }
    return {
      number,
      assignment: assignment || null,
      ownerUser: supportOwner,
      ownerType: supportOwner ? 'agency' : null,
      eligibleUserIds: supportEligible,
      agencyId: number.agency_id || client?.agency_id || null,
      client,
      clientId: client?.id || profile.clientId || null,
      matchedUserId: profile.userId || null,
      numberPurpose: purpose,
      careOwnerUserId: null,
      careState: null,
      supportAccess: purpose === 'tenant_contact' || purpose === 'platform_contact' ? 'respond' : 'none',
      skipClinicalInbox: true
    };
  }

  const poolEligible = number
    ? await PhoneNumberAssignment.listEligibleUserIdsForNumber(number.id)
    : [];
  if (number) {
    assignment = await findAssignedUserForNumber(number.id);
  } else {
    ownerUser = await User.findBySystemPhoneNumber(toNumber);
    ownerType = ownerUser ? 'staff' : null;
    if (ownerUser?.id) eligibleUserIds = [ownerUser.id];
  }

  const profile = await resolveProfilePhoneMatch(fromNumber, {
    agencyId: number?.agency_id || null
  });
  const client =
    profile.clients?.[0] ||
    (profile.clientId ? await Client.findById(profile.clientId, { includeSensitive: false }) : null) ||
    (await Client.findByContactPhone(fromNumber));
  matchedUserId = profile.userId || null;
  const agencyId = number?.agency_id || client?.agency_id || (ownerUser ? await findAgencyIdForUser(ownerUser.id) : null);

  // Prefer CPA-based ownership over "first pool member owns everything".
  if (client?.id && agencyId) {
    const care = await resolveClientCaregivers(client.id, agencyId);
    if (care.ownerUserId) {
      careOwnerUserId = care.ownerUserId;
      ownerUser = await User.findById(care.ownerUserId);
      ownerType = 'staff';
      eligibleUserIds = [...care.caregiverIds];
      careState = 'under_care';
      supportAccess = 'observe';
    }
  }

  if (!ownerUser && poolEligible.length > 0) {
    ownerUser = await User.findById(poolEligible[0]);
    ownerType = 'staff';
    eligibleUserIds = [...poolEligible];
  } else if (!ownerUser && assignment?.user_id) {
    ownerUser = await User.findById(assignment.user_id);
    ownerType = 'staff';
    eligibleUserIds = [assignment.user_id];
  }

  if (!ownerUser && number && client?.provider_id) {
    const provider = await User.findById(client.provider_id);
    if (provider?.id && (await userHasAgency(provider.id, agencyId))) {
      ownerUser = provider;
      ownerType = 'staff';
      eligibleUserIds = [provider.id];
      careOwnerUserId = provider.id;
    }
  }

  if (!ownerUser && number && agencyId) {
    const agency = await Agency.findById(agencyId);
    const flags = parseFeatureFlags(agency?.feature_flags);
    const defaultUserId = flags.smsDefaultUserId ? Number(flags.smsDefaultUserId) : null;
    if (defaultUserId && (await userHasAgency(defaultUserId, agencyId))) {
      ownerUser = await User.findById(defaultUserId);
      ownerType = 'agency';
      eligibleUserIds = [defaultUserId];
      careState = 'observing';
      supportAccess = 'respond';
    }
  }

  if (!ownerUser && number && agencyId) {
    const supportIds = await findSupportStaffIdsForAgency(agencyId);
    if (supportIds?.length) {
      ownerUser = await User.findById(supportIds[0]);
      ownerType = 'agency';
      eligibleUserIds = supportIds;
      careState = 'observing';
      supportAccess = 'respond';
    } else {
      const adminId = await findAnyAdminForAgency(agencyId);
      if (adminId) {
        ownerUser = await User.findById(adminId);
        ownerType = 'agency';
        eligibleUserIds = [adminId];
        careState = 'observing';
        supportAccess = 'respond';
      }
    }
  }

  // Support staff may observe clinical care threads quietly (notify separately / quieter prefs).
  if (agencyId && careState === 'under_care') {
    const supportIds = await findSupportStaffIdsForAgency(agencyId);
    for (const sid of supportIds) {
      if (!eligibleUserIds.includes(sid)) {
        // Do not add support to noisy notify list by default; keep caregiver-only notifies.
      }
    }
  }

  return {
    number,
    assignment,
    ownerUser,
    ownerType,
    eligibleUserIds: eligibleUserIds.length > 0 ? eligibleUserIds : (ownerUser ? [ownerUser.id] : []),
    agencyId,
    client,
    clientId: client?.id || null,
    matchedUserId,
    numberPurpose: purpose,
    careOwnerUserId: careOwnerUserId || ownerUser?.id || null,
    careState,
    supportAccess,
    skipClinicalInbox: false
  };
}
