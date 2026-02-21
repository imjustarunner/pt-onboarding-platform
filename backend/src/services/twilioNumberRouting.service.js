import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import Agency from '../models/Agency.model.js';
import TwilioNumber from '../models/TwilioNumber.model.js';
import TwilioNumberAssignment from '../models/TwilioNumberAssignment.model.js';
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
  const numbers = await TwilioNumber.listByAgency(agencyId, { includeInactive: false });
  return pickFirst(numbers);
}

async function findAssignedUserForNumber(numberId) {
  if (!numberId) return null;
  const assignments = await TwilioNumberAssignment.listByNumberId(numberId);
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
    const number = await TwilioNumber.findById(requestedNumberId);
    if (!number || !number.is_active || number.status === 'released') {
      return { error: 'number_unavailable' };
    }
    const assigned = await findAssignedUserForNumber(number.id);
    const eligibleIds = await TwilioNumberAssignment.listEligibleUserIdsForNumber(number.id);
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

  const primary = await TwilioNumberAssignment.findPrimaryForUser(userId);
  if (primary?.number_id) {
    const number = await TwilioNumber.findById(primary.number_id);
    if (number && number.is_active && number.status !== 'released') {
      return { number, assignment: primary, ownerType: 'staff' };
    }
  }

  const agencyId = clientId
    ? (await Client.findById(clientId, { includeSensitive: false }))?.agency_id
    : (await findAgencyIdForUser(userId));
  const agencyNumber = await findFallbackAgencyNumber(agencyId);
  if (agencyNumber) return { number: agencyNumber, assignment: null, ownerType: 'agency' };

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

export async function resolveInboundRoute({ toNumber, fromNumber }) {
  const number = await TwilioNumber.findByPhoneNumber(toNumber);
  let ownerUser = null;
  let assignment = null;
  let ownerType = null;
  /** Eligible user IDs for multi-recipient SMS. When set, all receive notifications. */
  let eligibleUserIds = [];

  if (number) {
    // Multi-recipient: check for users with SMS access on this number
    eligibleUserIds = await TwilioNumberAssignment.listEligibleUserIdsForNumber(number.id);
    if (eligibleUserIds.length > 0) {
      ownerUser = await User.findById(eligibleUserIds[0]);
      assignment = await findAssignedUserForNumber(number.id);
      ownerType = 'staff';
    } else {
      assignment = await findAssignedUserForNumber(number.id);
      if (assignment?.user_id) {
        ownerUser = await User.findById(assignment.user_id);
        ownerType = 'staff';
      } else {
        ownerType = 'agency';
      }
    }
  } else {
    // Legacy fallback: system phone number on users table
    ownerUser = await User.findBySystemPhoneNumber(toNumber);
    ownerType = ownerUser ? 'staff' : null;
    if (ownerUser?.id) eligibleUserIds = [ownerUser.id];
  }

  const client = await Client.findByContactPhone(fromNumber);
  const agencyId = number?.agency_id || client?.agency_id || (ownerUser ? await findAgencyIdForUser(ownerUser.id) : null);

  if (!ownerUser && number && client?.provider_id) {
    const provider = await User.findById(client.provider_id);
    if (provider?.id && (await userHasAgency(provider.id, agencyId))) {
      ownerUser = provider;
      ownerType = 'staff';
      eligibleUserIds = [provider.id];
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
    }
  }

  if (!ownerUser && number && agencyId) {
    const supportIds = await findSupportStaffIdsForAgency(agencyId);
    if (supportIds?.length) {
      ownerUser = await User.findById(supportIds[0]);
      ownerType = 'agency';
      eligibleUserIds = supportIds;
    } else {
      const adminId = await findAnyAdminForAgency(agencyId);
      if (adminId) {
        ownerUser = await User.findById(adminId);
        ownerType = 'agency';
        eligibleUserIds = [adminId];
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
    clientId: client?.id || null
  };
}
