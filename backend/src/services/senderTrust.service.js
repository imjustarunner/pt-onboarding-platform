/**
 * Classify inbound email senders for unified inbox routing.
 * Order: blocked → app staff → school staff → school contact → client/guardian → user contact → unknown
 */
import pool from '../config/database.js';
import UserCommunicationContact from '../models/UserCommunicationContact.model.js';
import { getAgencyEmailSettings } from './emailSettings.service.js';
import {
  isUserAvailable,
  nextAvailableAt
} from './availabilityWindow.service.js';

function normEmail(v) {
  return String(v || '').trim().toLowerCase();
}

const STAFF_ROLES = new Set([
  'admin', 'super_admin', 'support', 'staff', 'provider', 'provider_plus',
  'supervisor', 'clinical_practice_assistant', 'intern', 'intern_plus',
  'schedule_manager', 'facilitator'
]);

export async function classifyInboundSender({
  agencyId,
  ownerUserId,
  fromEmail,
  now = new Date()
}) {
  const email = normEmail(fromEmail);
  const aid = Number(agencyId || 0);
  const oid = Number(ownerUserId || 0);
  const result = {
    trust: 'unknown',
    isUnknownSender: true,
    blocked: null,
    linkedUserId: null,
    linkedClientId: null,
    linkedEntityType: null,
    linkedEntityId: null,
    displayName: null,
    visibleAfter: null,
    holdForAvailability: false
  };
  if (!email || !aid) return result;

  if (oid) {
    const blocked = await UserCommunicationContact.isBlocked({
      ownerUserId: oid,
      agencyId: aid,
      email
    });
    if (blocked) {
      return {
        ...result,
        trust: 'blocked',
        isUnknownSender: false,
        blocked,
        linkedUserId: blocked.linked_user_id || null,
        displayName: blocked.display_name || null
      };
    }
  }

  // App staff in same agency
  const [staffRows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.role, u.email, u.work_email, u.personal_email
     FROM users u
     JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
       AND (
         LOWER(TRIM(COALESCE(u.email,''))) = ?
         OR LOWER(TRIM(COALESCE(u.work_email,''))) = ?
         OR LOWER(TRIM(COALESCE(u.personal_email,''))) = ?
       )
     LIMIT 1`,
    [aid, email, email, email]
  ).catch(() => [[]]);
  const staff = staffRows?.[0];
  if (staff) {
    const role = String(staff.role || '').toLowerCase();
    const isSchoolStaff = role === 'school_staff';
    const isStaff = STAFF_ROLES.has(role) || isSchoolStaff;
    if (isStaff) {
      result.trust = isSchoolStaff ? 'school_staff' : 'staff';
      result.isUnknownSender = false;
      result.linkedUserId = staff.id;
      result.displayName = [staff.first_name, staff.last_name].filter(Boolean).join(' ') || email;
      result.linkedEntityType = 'user';
      result.linkedEntityId = staff.id;
    }
  }

  if (result.trust === 'unknown') {
    const [scRows] = await pool.execute(
      `SELECT sc.id, sc.school_organization_id, sc.full_name, sc.email
       FROM school_contacts sc
       WHERE LOWER(TRIM(sc.email)) = ?
       LIMIT 1`,
      [email]
    ).catch(() => [[]]);
    if (scRows?.[0]) {
      result.trust = 'school_contact';
      result.isUnknownSender = false;
      result.displayName = scRows[0].full_name || email;
      result.linkedEntityType = 'school_contact';
      result.linkedEntityId = scRows[0].id;
    }
  }

  if (result.trust === 'unknown') {
    const [gRows] = await pool.execute(
      `SELECT u.id, u.first_name, u.last_name, u.role, cg.client_id
       FROM users u
       LEFT JOIN client_guardians cg ON cg.guardian_user_id = u.id
       WHERE LOWER(TRIM(COALESCE(u.email,''))) = ?
          OR LOWER(TRIM(COALESCE(u.personal_email,''))) = ?
       ORDER BY cg.id ASC
       LIMIT 1`,
      [email, email]
    ).catch(() => [[]]);
    if (gRows?.[0] && String(gRows[0].role || '').toLowerCase() === 'client_guardian') {
      result.trust = 'guardian';
      result.isUnknownSender = false;
      result.linkedUserId = gRows[0].id;
      result.linkedClientId = gRows[0].client_id || null;
      result.displayName = [gRows[0].first_name, gRows[0].last_name].filter(Boolean).join(' ') || email;
      result.linkedEntityType = 'guardian';
      result.linkedEntityId = gRows[0].id;
    }
  }

  if (result.trust === 'unknown') {
    const [cRows] = await pool.execute(
      `SELECT id, initials, contact_email, agency_id
       FROM clients
       WHERE agency_id = ?
         AND LOWER(TRIM(COALESCE(contact_email,''))) = ?
       LIMIT 1`,
      [aid, email]
    ).catch(() => [[]]);
    if (cRows?.[0]) {
      result.trust = 'client';
      result.isUnknownSender = false;
      result.linkedClientId = cRows[0].id;
      result.displayName = cRows[0].initials || email;
      result.linkedEntityType = 'client';
      result.linkedEntityId = cRows[0].id;
    }
  }

  if (result.trust === 'unknown' && oid) {
    const contact = await UserCommunicationContact.findByEmail({
      ownerUserId: oid,
      agencyId: aid,
      email
    });
    if (contact && contact.trust_status === 'safe') {
      result.trust = 'contact';
      result.isUnknownSender = false;
      result.linkedUserId = contact.linked_user_id || null;
      result.linkedClientId = contact.linked_client_id || null;
      result.displayName = contact.display_name || email;
      result.linkedEntityType = contact.linked_entity_type || 'contact';
      result.linkedEntityId = contact.linked_entity_id || contact.id;
    }
  }

  // Availability hold for staff/school mail
  const settings = await getAgencyEmailSettings(aid);
  const holdEnabled = settings.holdStaffSchoolOutsideAvailability !== false;
  const isHoldClass = ['staff', 'school_staff', 'school_contact'].includes(result.trust);
  if (holdEnabled && isHoldClass && oid) {
    const { available, schedule } = await isUserAvailable(oid, now, { agencyId: aid });
    if (!available && schedule?.enabled) {
      result.holdForAvailability = true;
      result.visibleAfter = nextAvailableAt(schedule, now);
    }
  }

  // Unknown sender box
  if (result.trust === 'unknown') {
    result.isUnknownSender = settings.unknownSenderBoxEnabled !== false;
  }

  return result;
}

export async function applySenderClassificationToConversation(conversationId, classification) {
  if (!conversationId || !classification) return;
  await pool.execute(
    `UPDATE communication_conversations
     SET sender_trust = ?,
         is_unknown_sender = ?,
         visible_after = ?,
         released_at = CASE
           WHEN ? IS NULL THEN COALESCE(released_at, CURRENT_TIMESTAMP)
           ELSE released_at
         END
     WHERE id = ?`,
    [
      classification.trust || null,
      classification.isUnknownSender ? 1 : 0,
      classification.visibleAfter || null,
      classification.visibleAfter || null,
      conversationId
    ]
  );
}

/**
 * Release held conversations whose visible_after has passed.
 */
export async function runConversationReleaseTick({ now = new Date() } = {}) {
  const [rows] = await pool.execute(
    `UPDATE communication_conversations
     SET released_at = ?,
         visible_after = NULL
     WHERE visible_after IS NOT NULL
       AND visible_after <= ?
       AND released_at IS NULL`,
    [now, now]
  ).catch(() => [{ affectedRows: 0 }]);
  return { released: rows?.affectedRows || 0 };
}

export default {
  classifyInboundSender,
  applySenderClassificationToConversation,
  runConversationReleaseTick
};
