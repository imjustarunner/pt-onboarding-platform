/**
 * Classify inbound email senders for unified inbox routing.
 * Known = anyone already in the app (any role, including archived), plus
 * personal trust rows and agency contacts visible to the mailbox owner.
 * Personal / limited agency contacts do NOT make a sender known for other staff.
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

function trustFromUserRole(role) {
  const r = String(role || '').toLowerCase();
  if (r === 'school_staff') return 'school_staff';
  if (r === 'client_guardian') return 'guardian';
  if (r === 'client') return 'client';
  if (STAFF_ROLES.has(r)) return 'staff';
  return 'user';
}

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

  // Anyone in the app (any role / agency), including archived — prefer same-agency membership
  const [userRows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.role, u.is_archived,
            EXISTS (
              SELECT 1 FROM user_agencies ua
              WHERE ua.user_id = u.id AND ua.agency_id = ?
            ) AS in_agency
     FROM users u
     WHERE LOWER(TRIM(COALESCE(u.email,''))) = ?
        OR LOWER(TRIM(COALESCE(u.work_email,''))) = ?
        OR LOWER(TRIM(COALESCE(u.personal_email,''))) = ?
     ORDER BY in_agency DESC, (u.is_archived = TRUE) ASC, u.id ASC
     LIMIT 1`,
    [aid, email, email, email]
  ).catch(() => [[]]);
  const appUser = userRows?.[0];
  if (appUser) {
    const trust = trustFromUserRole(appUser.role);
    result.trust = trust;
    result.isUnknownSender = false;
    result.linkedUserId = appUser.id;
    result.displayName =
      [appUser.first_name, appUser.last_name].filter(Boolean).join(' ') || email;
    result.linkedEntityType = trust === 'guardian' ? 'guardian' : 'user';
    result.linkedEntityId = appUser.id;
    if (trust === 'guardian') {
      const [gLink] = await pool.execute(
        `SELECT client_id FROM client_guardians WHERE guardian_user_id = ? ORDER BY id ASC LIMIT 1`,
        [appUser.id]
      ).catch(() => [[]]);
      result.linkedClientId = gLink?.[0]?.client_id || null;
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

  // Personal mailbox trust book (mark-known / resolve for this owner)
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

  // Agency contacts visible to this mailbox owner only (not other staff's personal copies)
  if (result.trust === 'unknown' && oid) {
    try {
      const [acRows] = await pool.execute(
        `SELECT ac.id, ac.full_name, ac.client_id
         FROM agency_contacts ac
         LEFT JOIN contact_provider_assignments cpa
           ON cpa.contact_id = ac.id AND cpa.provider_user_id = ?
         WHERE ac.agency_id = ? AND ac.is_active = TRUE
           AND (
             LOWER(TRIM(COALESCE(ac.email,''))) = ?
             OR LOWER(TRIM(COALESCE(ac.email_alt,''))) = ?
           )
           AND (
             ac.share_with_all = TRUE
             OR ac.created_by_user_id = ?
             OR cpa.provider_user_id IS NOT NULL
           )
         LIMIT 1`,
        [oid, aid, email, email, oid]
      );
      if (acRows?.[0]) {
        result.trust = 'contact';
        result.isUnknownSender = false;
        result.linkedClientId = acRows[0].client_id || null;
        result.displayName = acRows[0].full_name || email;
        result.linkedEntityType = 'agency_contact';
        result.linkedEntityId = acRows[0].id;
      }
    } catch (e) {
      if (String(e?.message || '').includes('email_alt')) {
        const [acRows] = await pool.execute(
          `SELECT ac.id, ac.full_name, ac.client_id
           FROM agency_contacts ac
           LEFT JOIN contact_provider_assignments cpa
             ON cpa.contact_id = ac.id AND cpa.provider_user_id = ?
           WHERE ac.agency_id = ? AND ac.is_active = TRUE
             AND LOWER(TRIM(COALESCE(ac.email,''))) = ?
             AND (
               ac.share_with_all = TRUE
               OR ac.created_by_user_id = ?
               OR cpa.provider_user_id IS NOT NULL
             )
           LIMIT 1`,
          [oid, aid, email, oid]
        ).catch(() => [[]]);
        if (acRows?.[0]) {
          result.trust = 'contact';
          result.isUnknownSender = false;
          result.linkedClientId = acRows[0].client_id || null;
          result.displayName = acRows[0].full_name || email;
          result.linkedEntityType = 'agency_contact';
          result.linkedEntityId = acRows[0].id;
        }
      }
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
