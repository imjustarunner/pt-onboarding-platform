/**
 * Bridge pre-hire portal chat ↔ support tickets (People Operations topic).
 */
import pool from '../config/database.js';
import {
  SUPPORT_TICKET_SOURCE_KEYS,
  normalizeSupportTicketSourceKey
} from '../constants/supportTicketSources.js';
import { normalizeTicketTopic } from '../utils/ticketTopics.js';
import Notification from '../models/Notification.model.js';

const SOURCE_KEY = normalizeSupportTicketSourceKey(SUPPORT_TICKET_SOURCE_KEYS.PREHIRE_PORTAL_CHAT);
const TOPIC = 'people_operations';

async function resolveCandidateAgencyId(candidateUserId) {
  const [rows] = await pool.execute(
    `SELECT agency_id FROM user_agencies WHERE user_id = ? ORDER BY agency_id ASC LIMIT 1`,
    [candidateUserId]
  );
  return Number(rows?.[0]?.agency_id || 0) || null;
}

async function findOpenPortalChatTicket(candidateUserId, agencyId) {
  const [rows] = await pool.execute(
    `SELECT id FROM support_tickets
     WHERE agency_id = ?
       AND created_by_user_id = ?
       AND created_by_source_key = ?
       AND status IN ('open', 'under_review', 'waiting_on_requester')
     ORDER BY id DESC
     LIMIT 1`,
    [agencyId, candidateUserId, SOURCE_KEY]
  );
  return rows?.[0]?.id ? Number(rows[0].id) : null;
}

async function insertTicketMessage({ ticketId, authorUserId, authorRole, body }) {
  try {
    await pool.execute(
      `INSERT INTO support_ticket_messages (ticket_id, parent_message_id, author_user_id, author_role, body)
       VALUES (?, NULL, ?, ?, ?)`,
      [ticketId, authorUserId || null, authorRole || 'requester', String(body || '').slice(0, 20000)]
    );
  } catch (err) {
    console.warn('[prehirePortalChatTicket] message insert failed:', err?.message);
  }
}

async function notifyPeopleOps({ agencyId, ticketId, candidateName, preview }) {
  try {
    const [rows] = await pool.execute(
      `SELECT u.id
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'
         AND (
           LOWER(COALESCE(u.role, '')) IN ('admin', 'super_admin', 'support')
           OR COALESCE(ua.has_payroll_access, 0) = 1
         )
       LIMIT 40`,
      [agencyId]
    );
    const title = `Pre-hire chat: ${candidateName || 'Candidate'}`;
    const message = String(preview || '').slice(0, 240);
    for (const row of rows || []) {
      await Notification.create({
        userId: row.id,
        agencyId,
        type: 'support_ticket_created',
        severity: 'info',
        title,
        message,
        relatedEntityType: 'support_ticket',
        relatedEntityId: ticketId
      }).catch(() => {});
    }
  } catch (err) {
    console.warn('[prehirePortalChatTicket] notify failed:', err?.message);
  }
}

/**
 * Ensure an open People Ops ticket exists for this candidate portal thread,
 * then append the candidate message.
 */
export async function syncCandidatePortalMessageToTicket({
  candidateUserId,
  candidateName,
  message
}) {
  const agencyId = await resolveCandidateAgencyId(candidateUserId);
  if (!agencyId) return { ok: false, reason: 'no_agency' };

  let ticketId = await findOpenPortalChatTicket(candidateUserId, agencyId);
  let created = false;

  if (!ticketId) {
    const subject = `Pre-hire portal chat — ${candidateName || `User ${candidateUserId}`}`;
    const topic = normalizeTicketTopic(TOPIC);
    const [result] = await pool.execute(
      `INSERT INTO support_tickets
        (school_organization_id, client_id, created_by_user_id, created_by_source_key, agency_id,
         subject, question, status, source_channel, topic)
       VALUES (?, NULL, ?, ?, ?, ?, ?, 'open', 'prehire_portal', ?)`,
      [
        agencyId,
        candidateUserId,
        SOURCE_KEY,
        agencyId,
        subject,
        String(message || '').slice(0, 5000),
        topic
      ]
    );
    ticketId = Number(result.insertId);
    created = true;
  } else {
    await insertTicketMessage({
      ticketId,
      authorUserId: candidateUserId,
      authorRole: 'requester',
      body: message
    });
    try {
      await pool.execute(
        `UPDATE support_tickets SET status = 'open', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [ticketId]
      );
    } catch {
      /* ignore */
    }
  }

  if (created) {
    await notifyPeopleOps({
      agencyId,
      ticketId,
      candidateName,
      preview: message
    });
  }

  return { ok: true, ticketId, created };
}

/**
 * Staff reply from Pre-Hire Messages → also land on the ticket thread.
 */
export async function syncStaffPortalReplyToTicket({
  candidateUserId,
  staffUserId,
  message
}) {
  const agencyId = await resolveCandidateAgencyId(candidateUserId);
  if (!agencyId) return { ok: false, reason: 'no_agency' };

  let ticketId = await findOpenPortalChatTicket(candidateUserId, agencyId);
  if (!ticketId) {
    const result = await syncCandidatePortalMessageToTicket({
      candidateUserId,
      candidateName: null,
      message: '(Thread opened by People Operations reply)'
    });
    ticketId = result.ticketId;
  }
  if (!ticketId) return { ok: false, reason: 'no_ticket' };

  await insertTicketMessage({
    ticketId,
    authorUserId: staffUserId,
    authorRole: 'agent',
    body: message
  });
  return { ok: true, ticketId };
}

/**
 * Staff reply on a prehire_portal_chat ticket → mirror into hiring_notes portal chat.
 */
export async function syncTicketReplyToPortalChat({ ticket, authorUserId, body }) {
  const source = String(ticket?.created_by_source_key || '').toLowerCase();
  if (source !== SOURCE_KEY) return { ok: false, reason: 'not_prehire_chat' };
  const candidateUserId = Number(ticket.created_by_user_id || 0);
  if (!candidateUserId || !body) return { ok: false, reason: 'missing_data' };

  const HiringNote = (await import('../models/HiringNote.model.js')).default;
  await HiringNote.create({
    candidateUserId,
    authorUserId: authorUserId || null,
    message: String(body).trim(),
    isPortalMessage: true
  });
  return { ok: true };
}

export default {
  syncCandidatePortalMessageToTicket,
  syncStaffPortalReplyToTicket,
  syncTicketReplyToPortalChat
};
