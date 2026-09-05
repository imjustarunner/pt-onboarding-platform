/**
 * Promote an unknown-sender conversation to known + optional personal agency contact.
 * Provider-created contacts stay personal (share_with_all=false). Reusing another
 * staff member's limited contact is not allowed — creates a personal duplicate instead.
 * Attaching to a client requires client record access.
 */
import CommunicationConversation from '../models/CommunicationConversation.model.js';
import UserCommunicationContact from '../models/UserCommunicationContact.model.js';
import AgencyContact from '../models/AgencyContact.model.js';
import { userCanSeeContact } from './contactAccess.service.js';
import { resolveClientRecordAccess } from './clientRecordAccess.service.js';

function normEmail(v) {
  return String(v || '').trim().toLowerCase() || null;
}

async function clearUnknownFlag(conversationId) {
  const pool = (await import('../config/database.js')).default;
  await pool.execute(
    `UPDATE communication_conversations
     SET is_unknown_sender = 0,
         sender_trust = CASE
           WHEN COALESCE(NULLIF(sender_trust,''), 'unknown') IN ('unknown', '') THEN 'contact'
           ELSE sender_trust
         END
     WHERE id = ?`,
    [conversationId]
  );
}

async function assertClientAttachAllowed({ userId, role, clientId }) {
  const cid = Number(clientId);
  if (!cid) return null;
  const access = await resolveClientRecordAccess({
    userId,
    role,
    clientId: cid
  });
  if (!access?.ok) {
    const err = new Error(
      access?.message ||
        'You do not have access to attach this contact to that client. Save a personal contact without a client link instead.'
    );
    err.status = access?.status || 403;
    throw err;
  }
  return cid;
}

/**
 * Prefer an existing agency contact only if this user can already see it.
 * Otherwise return null so the caller creates a personal duplicate.
 */
async function findReusableAgencyContact({ agencyId, userId, role, email }) {
  const e = normEmail(email);
  if (!e) return null;
  const existing = await AgencyContact.findByEmail(e, agencyId);
  if (!existing) return null;
  const canSee = await userCanSeeContact(existing, userId, role);
  return canSee ? existing : null;
}

/**
 * @param {object} opts
 * @param {'known_only'|'existing_contact'|'new_contact'} opts.mode
 */
export async function resolveUnknownSenderConversation({
  agencyId,
  userId,
  role = null,
  conversationId,
  mode = 'known_only',
  existingContactId = null,
  clientId = null,
  fullName = null,
  email = null,
  phone = null,
  relationshipType = null,
  attachEmailToContact = true,
  markUnreadIfNeeded = true
} = {}) {
  const aid = Number(agencyId);
  const uid = Number(userId);
  const cid = Number(conversationId);
  if (!aid || !uid || !cid) {
    const err = new Error('agencyId, userId, and conversationId are required');
    err.status = 400;
    throw err;
  }

  const participants = await CommunicationConversation.listParticipants(cid);
  const primary = participants.find((p) => p.is_primary) || participants[0];
  const senderEmail = normEmail(email) || normEmail(primary?.email);
  const senderName =
    String(fullName || primary?.display_name || '').trim() || senderEmail || 'Unknown sender';

  if (!senderEmail) {
    const err = new Error('No sender email on this conversation');
    err.status = 400;
    throw err;
  }

  const allowedClientId = await assertClientAttachAllowed({
    userId: uid,
    role,
    clientId
  });

  const trustContact = await UserCommunicationContact.upsertSafe({
    agencyId: aid,
    ownerUserId: uid,
    email: senderEmail,
    displayName: senderName,
    phone: phone || null,
    linkedClientId: allowedClientId,
    source: mode === 'known_only' ? 'mark_known' : 'resolve_unknown'
  });

  let agencyContact = null;
  const rel = relationshipType ? String(relationshipType).trim().slice(0, 64) : null;

  if (mode === 'existing_contact') {
    const existingId = Number(existingContactId);
    if (!existingId) {
      const err = new Error('existingContactId is required');
      err.status = 400;
      throw err;
    }
    agencyContact = await AgencyContact.findById(existingId);
    if (!agencyContact || Number(agencyContact.agency_id) !== aid || !agencyContact.is_active) {
      const err = new Error('Contact not found');
      err.status = 404;
      throw err;
    }
    const canSee = await userCanSeeContact(agencyContact, uid, role);
    if (!canSee) {
      const err = new Error(
        'That contact is not available to you. Create a new personal contact instead (admins can link duplicates later).'
      );
      err.status = 403;
      throw err;
    }

    const patch = {};
    if (allowedClientId) patch.client_id = allowedClientId;
    if (rel) patch.relationship_type = rel;
    if (phone && !agencyContact.phone) patch.phone = phone;

    const existingEmail = normEmail(agencyContact.email);
    const existingAlt = normEmail(agencyContact.email_alt);
    if (attachEmailToContact) {
      if (!existingEmail) {
        patch.email = senderEmail;
      } else if (existingEmail !== senderEmail && existingAlt !== senderEmail) {
        patch.email_alt = senderEmail;
      }
    }
    if (Object.keys(patch).length) {
      try {
        agencyContact = await AgencyContact.update(agencyContact.id, patch);
      } catch (e) {
        if (String(e?.message || '').includes('email_alt')) {
          if (!existingEmail) {
            agencyContact = await AgencyContact.update(agencyContact.id, {
              ...patch,
              email: senderEmail
            });
          } else if (existingEmail !== senderEmail) {
            // Personal sibling rather than overwriting someone else's primary email
            agencyContact = await AgencyContact.create({
              agencyId: aid,
              createdByUserId: uid,
              shareWithAll: false,
              clientId: allowedClientId || agencyContact.client_id || null,
              fullName: agencyContact.full_name || senderName,
              email: senderEmail,
              phone: phone || null,
              source: 'manual',
              relationshipType: rel || agencyContact.relationship_type || null
            });
          }
        } else {
          throw e;
        }
      }
    }
    // Own the personal copy for this staff member — does not expand agency-wide visibility
    await AgencyContact.addProviderAssignment(agencyContact.id, uid).catch(() => {});

    if (allowedClientId) {
      try {
        const { upsertClientAffiliatedContact } = await import('./clientContactAffiliation.service.js');
        await upsertClientAffiliatedContact({
          agencyId: aid,
          clientId: allowedClientId,
          userId: uid,
          existingContactId: agencyContact.id,
          email: senderEmail,
          fullName: agencyContact.full_name || senderName,
          phone: agencyContact.phone || phone || null,
          relationshipType: rel || 'other'
        });
      } catch (e) {
        console.warn('[resolveUnknownSender] affiliation:', e?.message || e);
      }
    }
  } else if (mode === 'new_contact') {
    // Only reuse a contact this user can already see; otherwise create a personal duplicate
    agencyContact = await findReusableAgencyContact({
      agencyId: aid,
      userId: uid,
      role,
      email: senderEmail
    });
    if (!agencyContact) {
      agencyContact = await AgencyContact.create({
        agencyId: aid,
        createdByUserId: uid,
        shareWithAll: false,
        clientId: allowedClientId,
        fullName: senderName,
        email: senderEmail,
        phone: phone || null,
        source: 'manual',
        relationshipType: rel
      });
    } else {
      const patch = {};
      if (allowedClientId && !agencyContact.client_id) patch.client_id = allowedClientId;
      if (fullName && !agencyContact.full_name) patch.full_name = senderName;
      if (phone && !agencyContact.phone) patch.phone = phone;
      if (rel && !agencyContact.relationship_type) patch.relationship_type = rel;
      if (Object.keys(patch).length) {
        agencyContact = await AgencyContact.update(agencyContact.id, patch);
      }
    }
    if (agencyContact?.id) {
      await AgencyContact.addProviderAssignment(agencyContact.id, uid).catch(() => {});
    }
    if (allowedClientId && agencyContact?.id) {
      try {
        const { upsertClientAffiliatedContact } = await import('./clientContactAffiliation.service.js');
        await upsertClientAffiliatedContact({
          agencyId: aid,
          clientId: allowedClientId,
          userId: uid,
          existingContactId: agencyContact.id,
          email: senderEmail,
          fullName: senderName,
          phone: phone || null,
          relationshipType: rel || 'other'
        });
      } catch (e) {
        console.warn('[resolveUnknownSender] affiliation:', e?.message || e);
      }
    }
  }

  await clearUnknownFlag(cid);

  let markedUnread = false;
  if (markUnreadIfNeeded) {
    try {
      await CommunicationConversation.markUnread(cid, uid);
      markedUnread = true;
    } catch (e) {
      console.warn('[resolveUnknownSender] markUnread:', e?.message || e);
    }
  }

  return {
    conversationId: cid,
    trustContact,
    agencyContact,
    markedUnread,
    senderEmail,
    senderName,
    personalContact: agencyContact ? !agencyContact.share_with_all : false
  };
}
