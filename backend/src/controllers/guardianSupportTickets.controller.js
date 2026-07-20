import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import Notification from '../models/Notification.model.js';
import {
  prepareEncryptedTicketText,
  decryptTicketMessageRow,
  decryptTicketRow,
  ticketDisplayStatus
} from '../utils/supportTicketCrypto.js';
import { isChatEncryptionConfigured } from '../services/chatEncryption.service.js';
import { allowedTopicsForCreatorRole, normalizeTicketTopic } from '../utils/ticketTopics.js';

async function hasSupportTicketMessagesTable() {
  try {
    const [rows] = await pool.execute(
      "SELECT COUNT(*) AS cnt FROM information_schema.tables WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_ticket_messages'"
    );
    return Number(rows?.[0]?.cnt || 0) > 0;
  } catch {
    return false;
  }
}

async function hasSupportTicketEncryptionColumns() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_tickets' AND COLUMN_NAME = 'question_ciphertext'
       LIMIT 1`
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

async function hasSupportTicketPriorityColumn() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_tickets' AND COLUMN_NAME = 'priority'
       LIMIT 1`
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

async function hasMessageInternalColumn() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_ticket_messages' AND COLUMN_NAME = 'is_internal'
       LIMIT 1`
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

async function hasSupportTicketTopicColumn() {
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'support_tickets' AND COLUMN_NAME = 'topic'
       LIMIT 1`
    );
    return (rows || []).length > 0;
  } catch {
    return false;
  }
}

async function listAgencyTopicRecipients({ agencyId, topic = 'general' }) {
  const aid = parseInt(agencyId, 10);
  if (!aid) return [];
  const t = normalizeTicketTopic(topic);
  let flagSql = '';
  if (t === 'billing') flagSql = ' OR COALESCE(ua.has_billing_access, 0) = 1';
  else if (t === 'payroll') flagSql = ' OR COALESCE(ua.has_payroll_access, 0) = 1';
  else if (t === 'credentialing') flagSql = ' OR COALESCE(ua.can_manage_credentialing, 0) = 1';

  try {
    const [rows] = await pool.execute(
      `SELECT u.id
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id
       WHERE ua.agency_id = ?
         AND (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND UPPER(COALESCE(u.status, '')) <> 'ARCHIVED'
         AND (
           LOWER(COALESCE(u.role, '')) = 'admin'
           OR LOWER(COALESCE(u.role, '')) = 'super_admin'
           ${
             t === 'general'
               ? `OR LOWER(COALESCE(u.role, '')) IN ('support','staff','clinical_practice_assistant','provider_plus')`
               : flagSql
           }
         )`,
      [aid]
    );
    return rows || [];
  } catch {
    return [];
  }
}

function enrichTicket(ticket) {
  if (!ticket) return null;
  const decrypted = decryptTicketRow(ticket);
  return {
    ...decrypted,
    display_status: ticketDisplayStatus(decrypted)
  };
}

async function assertGuardianOwnsTicket(guardianUserId, ticketId) {
  const [rows] = await pool.execute(
    `SELECT * FROM support_tickets WHERE id = ? AND created_by_user_id = ? LIMIT 1`,
    [ticketId, guardianUserId]
  );
  return rows?.[0] || null;
}

async function assertGuardianClientAccess(guardianUserId, clientId) {
  const clients = await ClientGuardian.listClientsForGuardian({ guardianUserId });
  return (clients || []).find((c) => Number(c.client_id) === Number(clientId)) || null;
}

/**
 * GET /api/guardian-portal/support-tickets
 */
export const listGuardianSupportTickets = async (req, res, next) => {
  try {
    if (req.guardianPreviewMode) {
      return res.json({ tickets: [] });
    }
    const [rows] = await pool.execute(
      `SELECT t.*,
              u.first_name AS answered_by_first_name,
              u.last_name AS answered_by_last_name,
              s.name AS school_name,
              a.name AS agency_name,
              c.initials AS client_initials,
              c.full_name AS client_full_name
       FROM support_tickets t
       LEFT JOIN users u ON u.id = t.answered_by_user_id
       LEFT JOIN agencies s ON s.id = t.school_organization_id
       LEFT JOIN agencies a ON a.id = t.agency_id
       LEFT JOIN clients c ON c.id = t.client_id
       WHERE t.created_by_user_id = ?
       ORDER BY t.created_at DESC`,
      [req.user.id]
    );
    res.json({ tickets: (rows || []).map((t) => enrichTicket(t)) });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/guardian-portal/support-tickets
 * body: { clientId, question, subject?, priority?, topic? }
 * Guardians: general | billing only.
 */
export const createGuardianSupportTicket = async (req, res, next) => {
  try {
    if (req.guardianPreviewMode) {
      return res.status(403).json({ error: { message: 'Preview cannot create tickets' } });
    }
    if (String(req.user?.role || '').toLowerCase() !== 'client_guardian') {
      return res.status(403).json({ error: { message: 'Guardian access required' } });
    }
    const clientId = parseInt(req.body?.clientId, 10);
    const question = String(req.body?.question || '').trim();
    const subject = req.body?.subject ? String(req.body.subject).trim().slice(0, 255) : null;
    const topic = normalizeTicketTopic(req.body?.topic, {
      allowed: allowedTopicsForCreatorRole('client_guardian')
    });
    if (!clientId || !question) {
      return res.status(400).json({ error: { message: 'clientId and question are required' } });
    }

    const client = await assertGuardianClientAccess(req.user.id, clientId);
    if (!client) {
      return res.status(403).json({ error: { message: 'Access denied to this child' } });
    }

    const schoolOrganizationId = Number(client.organization_id || 0);
    const agencyId = Number(client.agency_id || 0);
    if (!schoolOrganizationId || !agencyId) {
      return res.status(400).json({ error: { message: 'Child is missing organization affiliation' } });
    }

    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && !isChatEncryptionConfigured()) {
      return res.status(503).json({
        error: { message: 'Message encryption is required. Configure CLIENT_CHAT_ENCRYPTION_KEY_BASE64.' }
      });
    }

    const hasEnc = await hasSupportTicketEncryptionColumns();
    const hasPriority = await hasSupportTicketPriorityColumn();
    const qEnc = hasEnc
      ? prepareEncryptedTicketText(question)
      : { plain: question, ciphertext: null, iv: null, authTag: null, keyId: null };
    const priorityRaw = String(req.body?.priority || 'medium').trim().toLowerCase();
    const priority = ['low', 'medium', 'high'].includes(priorityRaw) ? priorityRaw : 'medium';
    const ticketSubject = subject || `Guardian support — ${client.full_name || client.initials || `Client #${clientId}`}`;

    let result;
    if (hasEnc && hasPriority) {
      [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status, priority,
           question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`,
        [
          schoolOrganizationId,
          clientId,
          req.user.id,
          agencyId,
          ticketSubject,
          qEnc.plain,
          priority,
          qEnc.ciphertext,
          qEnc.iv,
          qEnc.authTag,
          qEnc.keyId
        ]
      );
    } else if (hasEnc) {
      [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status,
           question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
        [
          schoolOrganizationId,
          clientId,
          req.user.id,
          agencyId,
          ticketSubject,
          qEnc.plain,
          qEnc.ciphertext,
          qEnc.iv,
          qEnc.authTag,
          qEnc.keyId
        ]
      );
    } else if (hasPriority) {
      [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status, priority)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
        [schoolOrganizationId, clientId, req.user.id, agencyId, ticketSubject, question, priority]
      );
    } else {
      [result] = await pool.execute(
        `INSERT INTO support_tickets
          (school_organization_id, client_id, created_by_user_id, agency_id, subject, question, status)
         VALUES (?, ?, ?, ?, ?, ?, 'open')`,
        [schoolOrganizationId, clientId, req.user.id, agencyId, ticketSubject, question]
      );
    }

    const ticketId = result.insertId;
    if (ticketId && (await hasSupportTicketMessagesTable())) {
      const hasEncMsg = await hasSupportTicketEncryptionColumns();
      const mEnc = hasEncMsg
        ? prepareEncryptedTicketText(question)
        : { plain: question, ciphertext: null, iv: null, authTag: null, keyId: null };
      const hasInternal = await hasMessageInternalColumn();
      if (hasEncMsg && hasInternal) {
        await pool.execute(
          `INSERT INTO support_ticket_messages
            (ticket_id, parent_id, author_user_id, author_role, body, is_internal,
             body_ciphertext, body_iv, body_auth_tag, encryption_key_id)
           VALUES (?, NULL, ?, ?, ?, 0, ?, ?, ?, ?)`,
          [
            ticketId,
            req.user.id,
            'client_guardian',
            mEnc.plain,
            mEnc.ciphertext,
            mEnc.iv,
            mEnc.authTag,
            mEnc.keyId
          ]
        );
      } else if (hasInternal) {
        await pool.execute(
          `INSERT INTO support_ticket_messages
            (ticket_id, parent_id, author_user_id, author_role, body, is_internal)
           VALUES (?, NULL, ?, ?, ?, 0)`,
          [ticketId, req.user.id, 'client_guardian', question]
        );
      } else {
        await pool.execute(
          `INSERT INTO support_ticket_messages
            (ticket_id, parent_id, author_user_id, author_role, body)
           VALUES (?, NULL, ?, ?, ?)`,
          [ticketId, req.user.id, 'client_guardian', question]
        );
      }
    }

    if (ticketId && (await hasSupportTicketTopicColumn())) {
      try {
        await pool.execute(`UPDATE support_tickets SET topic = ? WHERE id = ?`, [topic, ticketId]);
      } catch {
        /* ignore */
      }
    }

    const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ?`, [ticketId]);
    const created = enrichTicket(rows?.[0] || null);

    try {
      if (created?.id && agencyId) {
        const topicLabel = topic === 'billing' ? 'Billing' : 'Support';
        const recipients = await listAgencyTopicRecipients({ agencyId, topic });
        for (const r of recipients) {
          if (Number(r.id) === Number(req.user?.id)) continue;
          try {
            await Notification.create({
              type: 'support_ticket_created',
              severity: 'info',
              title: `New ${topicLabel.toLowerCase()} ticket`,
              message: ticketSubject || 'Guardian support request',
              userId: r.id,
              agencyId,
              relatedEntityType: 'support_ticket',
              relatedEntityId: created.id,
              actorUserId: req.user.id
            });
          } catch {
            /* per-recipient */
          }
        }
      }
    } catch {
      /* never block create */
    }

    res.status(201).json({ ticket: created });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/guardian-portal/support-tickets/:ticketId
 */
export const getGuardianSupportTicket = async (req, res, next) => {
  try {
    if (req.guardianPreviewMode) {
      return res.json({ ticket: null, messages: [] });
    }
    const ticketId = parseInt(req.params.ticketId, 10);
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });
    const ticket = await assertGuardianOwnsTicket(req.user.id, ticketId);
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });

    if (!(await hasSupportTicketMessagesTable())) {
      return res.json({ ticket: enrichTicket(ticket), messages: [] });
    }
    const hasInternal = await hasMessageInternalColumn();
    const internalClause = hasInternal ? ' AND COALESCE(m.is_internal, 0) = 0' : '';
    const [mRows] = await pool.execute(
      `SELECT m.*,
              u.first_name AS author_first_name,
              u.last_name AS author_last_name
       FROM support_ticket_messages m
       LEFT JOIN users u ON u.id = m.author_user_id
       WHERE m.ticket_id = ?
         ${internalClause}
       ORDER BY m.created_at ASC, m.id ASC`,
      [ticketId]
    );
    const messages = (mRows || []).map((m) => decryptTicketMessageRow(m));
    res.json({ ticket: enrichTicket(ticket), messages });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/guardian-portal/support-tickets/:ticketId/messages
 * body: { body }
 */
export const sendGuardianSupportTicketMessage = async (req, res, next) => {
  try {
    if (req.guardianPreviewMode) {
      return res.status(403).json({ error: { message: 'Preview cannot reply' } });
    }
    const ticketId = parseInt(req.params.ticketId, 10);
    const body = String(req.body?.body || '').trim();
    if (!ticketId) return res.status(400).json({ error: { message: 'Invalid ticket id' } });
    if (!body) return res.status(400).json({ error: { message: 'body is required' } });

    const ticket = await assertGuardianOwnsTicket(req.user.id, ticketId);
    if (!ticket) return res.status(404).json({ error: { message: 'Ticket not found' } });
    if (String(ticket.status || '').toLowerCase() === 'closed') {
      return res.status(400).json({ error: { message: 'This ticket is closed' } });
    }
    if (!(await hasSupportTicketMessagesTable())) {
      return res.status(409).json({ error: { message: 'Ticket messages are not enabled' } });
    }
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && !isChatEncryptionConfigured()) {
      return res.status(503).json({
        error: { message: 'Message encryption is required. Configure CLIENT_CHAT_ENCRYPTION_KEY_BASE64.' }
      });
    }

    const hasEnc = await hasSupportTicketEncryptionColumns();
    const enc = hasEnc
      ? prepareEncryptedTicketText(body)
      : { plain: body, ciphertext: null, iv: null, authTag: null, keyId: null };
    const hasInternal = await hasMessageInternalColumn();
    if (hasEnc && hasInternal) {
      await pool.execute(
        `INSERT INTO support_ticket_messages
          (ticket_id, parent_id, author_user_id, author_role, body, is_internal,
           body_ciphertext, body_iv, body_auth_tag, encryption_key_id)
         VALUES (?, NULL, ?, ?, ?, 0, ?, ?, ?, ?)`,
        [ticketId, req.user.id, 'client_guardian', enc.plain, enc.ciphertext, enc.iv, enc.authTag, enc.keyId]
      );
    } else if (hasInternal) {
      await pool.execute(
        `INSERT INTO support_ticket_messages
          (ticket_id, parent_id, author_user_id, author_role, body, is_internal)
         VALUES (?, NULL, ?, ?, ?, 0)`,
        [ticketId, req.user.id, 'client_guardian', body]
      );
    } else {
      await pool.execute(
        `INSERT INTO support_ticket_messages
          (ticket_id, parent_id, author_user_id, author_role, body)
         VALUES (?, NULL, ?, ?, ?)`,
        [ticketId, req.user.id, 'client_guardian', body]
      );
    }

    // Re-open if previously answered
    if (String(ticket.status || '').toLowerCase() === 'answered') {
      await pool.execute(`UPDATE support_tickets SET status = 'open' WHERE id = ?`, [ticketId]);
    }

    return getGuardianSupportTicket(req, res, next);
  } catch (e) {
    next(e);
  }
};
