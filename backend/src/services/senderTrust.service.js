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

  // ITSCO / tenant school-site Google Groups (russell@, north@, sabin@, …)
  if (result.trust === 'unknown') {
    const [siteRows] = await pool.execute(
      `SELECT sp.school_organization_id, sp.itsco_email, a.name AS school_name
       FROM school_profiles sp
       LEFT JOIN agencies a ON a.id = sp.school_organization_id
       WHERE LOWER(TRIM(COALESCE(sp.itsco_email,''))) = ?
       LIMIT 1`,
      [email]
    ).catch(() => [[]]);
    if (siteRows?.[0]) {
      result.trust = 'school_contact';
      result.isUnknownSender = false;
      result.displayName = siteRows[0].school_name
        ? `${siteRows[0].school_name} (site mailbox)`
        : email;
      result.linkedEntityType = 'school_site';
      result.linkedEntityId = siteRows[0].school_organization_id || null;
    }
  }

  // Agency sender identities + inbound routes (messages@, support@, schoolreply@, …)
  if (result.trust === 'unknown') {
    const [idRows] = await pool.execute(
      `SELECT esi.id, esi.from_email, esi.display_name, esi.identity_key
       FROM email_sender_identities esi
       WHERE esi.agency_id = ?
         AND esi.is_active = 1
         AND LOWER(TRIM(esi.from_email)) = ?
       LIMIT 1`,
      [aid, email]
    ).catch(() => [[]]);
    if (idRows?.[0]) {
      result.trust = 'staff';
      result.isUnknownSender = false;
      result.displayName = idRows[0].display_name || email;
      result.linkedEntityType = 'email_identity';
      result.linkedEntityId = idRows[0].id;
    }
  }
  if (result.trust === 'unknown') {
    const [routeRows] = await pool.execute(
      `SELECT r.id, r.email_address, esi.display_name, esi.id AS identity_id
       FROM email_inbound_routes r
       JOIN email_sender_identities esi ON esi.id = r.sender_identity_id
       WHERE esi.agency_id = ?
         AND r.is_active = 1
         AND esi.is_active = 1
         AND LOWER(TRIM(r.email_address)) = ?
       LIMIT 1`,
      [aid, email]
    ).catch(() => [[]]);
    if (routeRows?.[0]) {
      result.trust = 'school_contact';
      result.isUnknownSender = false;
      result.displayName = routeRows[0].display_name || email;
      result.linkedEntityType = 'inbound_route';
      result.linkedEntityId = routeRows[0].id;
    }
  }

  // Same-domain as this agency's outbound identities → org mailbox, not spam
  if (result.trust === 'unknown') {
    const domain = email.includes('@') ? email.split('@').pop() : '';
    if (domain && !['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com'].includes(domain)) {
      const [domRows] = await pool.execute(
        `SELECT id, from_email, display_name
         FROM email_sender_identities
         WHERE agency_id = ?
           AND is_active = 1
           AND LOWER(TRIM(SUBSTRING_INDEX(from_email, '@', -1))) = ?
         LIMIT 1`,
        [aid, domain]
      ).catch(() => [[]]);
      if (domRows?.[0]) {
        result.trust = 'staff';
        result.isUnknownSender = false;
        result.displayName = email;
        result.linkedEntityType = 'agency_domain';
        result.linkedEntityId = domRows[0].id;
      }
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

  // Agency contacts in this agency (org address book) — not only mailbox-owner-visible copies
  if (result.trust === 'unknown') {
    try {
      const [acRows] = await pool.execute(
        `SELECT ac.id, ac.full_name, ac.client_id, ac.relationship_type
         FROM agency_contacts ac
         WHERE ac.agency_id = ? AND ac.is_active = TRUE
           AND (
             LOWER(TRIM(COALESCE(ac.email,''))) = ?
             OR LOWER(TRIM(COALESCE(ac.email_alt,''))) = ?
           )
         ORDER BY
           CASE
             WHEN ac.relationship_type IN ('school_staff','school_contact','school','counselor','teacher') THEN 0
             WHEN ac.share_with_all = TRUE THEN 1
             ELSE 2
           END,
           ac.id ASC
         LIMIT 1`,
        [aid, email, email]
      );
      if (acRows?.[0]) {
        const rel = String(acRows[0].relationship_type || '').toLowerCase();
        result.trust = /school|counselor|teacher/.test(rel) ? 'school_contact' : 'contact';
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
           WHERE ac.agency_id = ? AND ac.is_active = TRUE
             AND LOWER(TRIM(COALESCE(ac.email,''))) = ?
           LIMIT 1`,
          [aid, email]
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

/**
 * Re-run sender classification for unknown conversations (fixes stale flags when
 * school site mailboxes / contacts become known).
 */
export async function reclassifyUnknownConversationsForAgency({
  agencyId,
  ownerUserId = null,
  limit = 80
} = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return { checked: 0, updated: 0 };
  const lim = Math.min(Math.max(Number(limit) || 80, 1), 200);
  const [rows] = await pool.execute(
    `SELECT c.id, c.owner_user_id,
            (
              SELECT p.email FROM communication_participants p
              WHERE p.conversation_id = c.id
              ORDER BY p.is_primary DESC, p.id ASC
              LIMIT 1
            ) AS from_email
     FROM communication_conversations c
     WHERE c.agency_id = ?
       AND c.archived_at IS NULL
       AND COALESCE(c.is_unknown_sender, 0) = 1
     ORDER BY c.last_message_at DESC
     LIMIT ${lim}`,
    [aid]
  ).catch(() => [[]]);

  let updated = 0;
  for (const row of rows || []) {
    const fromEmail = String(row.from_email || '').trim();
    if (!fromEmail) continue;
    const classification = await classifyInboundSender({
      agencyId: aid,
      ownerUserId: ownerUserId || row.owner_user_id || null,
      fromEmail
    });
    if (classification.isUnknownSender) continue;
    await applySenderClassificationToConversation(row.id, classification);
    if (classification.displayName) {
      await pool.execute(
        `UPDATE communication_participants
         SET display_name = COALESCE(NULLIF(display_name, ''), ?),
             kind = CASE
               WHEN ? IN ('school_contact','school_staff') THEN 'school_contact'
               WHEN ? = 'staff' THEN 'staff'
               ELSE kind
             END
         WHERE conversation_id = ? AND is_primary = 1`,
        [
          classification.displayName,
          classification.trust,
          classification.trust,
          row.id
        ]
      ).catch(() => null);
    }
    updated += 1;
  }
  return { checked: (rows || []).length, updated };
}

export default {
  classifyInboundSender,
  applySenderClassificationToConversation,
  runConversationReleaseTick,
  reclassifyUnknownConversationsForAgency
};
