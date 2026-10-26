import { decryptTicketRow, decryptTicketMessageRow } from '../utils/supportTicketCrypto.js';
import pool from '../config/database.js';
import CommunicationConversation from '../models/CommunicationConversation.model.js';
import CommunicationInbox from '../models/CommunicationInbox.model.js';
import { classifyTicketHistoryMessage, parseEmailList } from './supportTicketEmailPolicy.js';

function previewFrom(text) {
  return String(text || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240) || null;
}

function mapTicketStatus(ticket) {
  const s = String(ticket?.status || '').toLowerCase();
  if (s === 'closed' || s === 'resolved' || s === 'done') return 'resolved';
  if (s === 'answered' || s === 'waiting' || s === 'pending_external') return 'waiting_on_them';
  // Inbound email awaiting staff → needs reply
  return 'needs_reply';
}

/**
 * Ensure email support tickets appear as unified inbox conversations.
 * Idempotent via unique support_ticket_id on communication_conversations.
 */
export async function syncEmailTicketsToInbox({ agencyId, ticketId = null, limit = 100 } = {}) {
  if (!agencyId) return { synced: 0 };
  await CommunicationInbox.ensureFromSenderIdentities(agencyId);
  const [tickets] = await pool.execute(`SELECT t.*, s.name AS school_name
    FROM support_tickets t LEFT JOIN agencies s ON s.id=t.school_organization_id
    WHERE t.source_channel='email' AND t.agency_id=? ${ticketId ? 'AND t.id=?' : ''}
    ORDER BY t.updated_at DESC LIMIT ${Math.min(Number(limit) || 100, 300)}`,
  ticketId ? [agencyId, ticketId] : [agencyId]);
  const inboxes = await CommunicationInbox.listForAgency({ agencyId });
  let synced = 0;
  for (const raw of tickets) {
    const ticket = decryptTicketRow(raw);
    const db = await pool.getConnection();
    const lockName = `support-inbox:${ticket.id}`;
    let locked = false;
    try {
      const [[lock]] = await db.execute('SELECT GET_LOCK(?,3) AS acquired', [lockName]);
      if (Number(lock?.acquired) !== 1) continue;
      locked = true;
      const preferred = ticket.topic === 'technology'
        ? inboxes.find((i) => i.identity_key === 'technology')
        : inboxes.find((i) => /schoolreply|school_reply|schools@/i.test(`${i.identity_key} ${i.from_email}`))
          || inboxes.find((i) => /support@/i.test(i.from_email || ''));
      let conversation = await CommunicationConversation.findBySupportTicketId(ticket.id);
      if (!conversation) {
        conversation = await CommunicationConversation.create({ agencyId, inboxId: preferred?.id || null,
          channel: 'email', subject: ticket.source_email_subject || ticket.subject,
          supportTicketId: ticket.id, ownerUserId: ticket.claimed_by_user_id || null,
          status: mapTicketStatus(ticket), externalThreadId: ticket.source_email_thread_id || null });
        synced += 1;
      }
      await CommunicationConversation.upsertLink(conversation.id, 'ticket', ticket.id, `Ticket #${ticket.id}`);
      if (ticket.school_organization_id) await CommunicationConversation.upsertLink(conversation.id, 'school', ticket.school_organization_id, ticket.school_name);
      if (ticket.client_id) await CommunicationConversation.upsertLink(conversation.id, 'client', ticket.client_id, `Client #${ticket.client_id}`);
      if (ticket.source_email_from) await CommunicationConversation.upsertParticipant(conversation.id,
        { kind: 'school_contact', email: ticket.source_email_from, displayName: ticket.source_email_from, isPrimary: true });
      const [messages] = await db.execute(`SELECT m.*, e.id AS email_id,e.direction AS email_direction,
        e.send_status AS email_send_status,e.from_email,e.from_name,e.to_json,e.cc_json,e.subject AS email_subject,
        e.internet_message_id,e.in_reply_to,e.references_header,e.sent_at AS email_sent_at
        FROM support_ticket_messages m LEFT JOIN support_ticket_email_messages e ON e.ticket_message_id=m.id
        WHERE m.ticket_id=? ORDER BY m.created_at ASC,m.id ASC`, [ticket.id]);
      const [mirrors] = await db.execute('SELECT id,support_ticket_message_id,internet_message_id,direction FROM communication_messages WHERE conversation_id=? ORDER BY id', [conversation.id]);
      const [attachments] = await db.execute('SELECT * FROM support_ticket_attachments WHERE ticket_id=?', [ticket.id]);
      let lastAt = ticket.source_email_received_at || ticket.created_at;
      let firstInbound = true;
      let seedMessageId = null;
      for (const rawMessage of messages) {
        const m = decryptTicketMessageRow(rawMessage);
        const state = classifyTicketHistoryMessage(m, m.email_id ? { direction: m.email_direction, send_status: m.email_send_status } : null);
        let mirror = mirrors.find((r) => Number(r.support_ticket_message_id) === Number(m.id));
        // Link the old question seed to its canonical first inbound message.
        if (!mirror && firstInbound && state?.direction === 'inbound') {
          mirror = mirrors.find((r) => !r.support_ticket_message_id && r.direction === 'inbound'
            && r.internet_message_id && r.internet_message_id === ticket.source_email_message_id);
        }
        if (!state) {
          if (mirror) await db.execute("UPDATE communication_messages SET send_status='cancelled',body_text=NULL,body_html=NULL WHERE id=?", [mirror.id]);
          continue;
        }
        if (state.direction === 'inbound' && firstInbound) seedMessageId = m.id;
        if (state.direction === 'inbound') firstInbound = false;
        const from = m.from_email ? { email: m.from_email, name: m.from_name || m.from_email }
          : state.direction === 'inbound' ? { email: ticket.source_email_from, name: ticket.source_email_from } : null;
        const sentAt = m.email_sent_at || (state.sendStatus === 'sent' || state.direction === 'inbound' ? m.created_at : null);
        const data = { conversationId: conversation.id, channel: 'email', ...state,
          authorUserId: m.author_user_id || null, from,
          to: parseEmailList(m.to_json).map((email) => ({ email })), cc: parseEmailList(m.cc_json).map((email) => ({ email })),
          subject: m.email_subject || ticket.source_email_subject || ticket.subject,
          bodyText: null, bodyHtml: null, supportTicketMessageId: m.id,
          internetMessageId: m.internet_message_id || null, inReplyTo: m.in_reply_to || null,
          referencesHeader: m.references_header || null, sentAt };
        if (mirror) {
          await db.execute(`UPDATE communication_messages SET support_ticket_message_id=?,direction=?,is_internal_note=?,
            send_status=?,from_json=?,to_json=?,cc_json=?,internet_message_id=?,in_reply_to=?,references_header=?,
            body_text=NULL,body_html=NULL,sent_at=? WHERE id=?`,
          [m.id,state.direction,state.isInternalNote ? 1 : 0,state.sendStatus,from ? JSON.stringify(from) : null,
            JSON.stringify(data.to),JSON.stringify(data.cc),data.internetMessageId,data.inReplyTo,data.referencesHeader,sentAt,mirror.id]);
        } else {
          mirror = { id: await CommunicationConversation.addMessage(data) };
        }
        for (const attachment of attachments.filter((a) => Number(a.support_ticket_message_id || seedMessageId) === Number(m.id))) {
          const [[present]] = await db.execute('SELECT id FROM communication_attachments WHERE message_id=? AND storage_key=? LIMIT 1', [mirror.id, attachment.file_path]);
          if (!present) await CommunicationConversation.addAttachment(mirror.id, { filename: attachment.file_name,
            contentType: attachment.mime_type, sizeBytes: attachment.file_size, storageKey: attachment.file_path });
        }
        const messageAt = m.email_sent_at || m.created_at;
        if (messageAt && (!lastAt || new Date(messageAt).getTime() > new Date(lastAt).getTime())) lastAt = messageAt;
      }
      // The linked ticket owns status, claim, and the body. Metadata mirrors
      // cannot expose stale plaintext after deletion or turn a closure into mail.
      await CommunicationConversation.update(conversation.id, { status: mapTicketStatus(ticket),
        ownerUserId: ticket.claimed_by_user_id || null, subject: ticket.source_email_subject || ticket.subject,
        externalThreadId: ticket.source_email_thread_id || null, lastMessageAt: lastAt,
        lastMessagePreview: ticket.source_email_subject || ticket.subject || 'Email conversation' });
    } finally {
      if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
      db.release();
    }
  }
  return { synced, total: tickets.length };
}

/**
 * Resolve school/client context for a conversation (recognized contact + Linked To).
 */
export async function buildConversationContext(conversation) {
  const links = await CommunicationConversation.listLinks(conversation.id);
  const participants = await CommunicationConversation.listParticipants(conversation.id);
  const primary = participants.find((p) => p.is_primary) || participants[0] || null;

  let client = null;
  let school = null;
  let guardian = null;
  let ticket = null;

  const clientLink = links.find((l) => l.entity_type === 'client');
  const schoolLink = links.find((l) => l.entity_type === 'school');
  const ticketLink = links.find((l) => l.entity_type === 'ticket');

  if (clientLink) {
    const [rows] = await pool.execute(
      `SELECT id, full_name, status, date_of_birth
       FROM clients WHERE id = ? LIMIT 1`,
      [clientLink.entity_id]
    );
    if (rows[0]) {
      client = {
        id: rows[0].id,
        name: rows[0].full_name || `Client #${rows[0].id}`,
        status: rows[0].status,
        dateOfBirth: rows[0].date_of_birth
      };
      const [gRows] = await pool.execute(
        `SELECT u.id, u.first_name, u.last_name, u.email, cg.relationship_title
         FROM client_guardians cg
         JOIN users u ON u.id = cg.guardian_user_id
         WHERE cg.client_id = ? AND (cg.access_enabled IS NULL OR cg.access_enabled = 1)
         ORDER BY cg.id ASC LIMIT 1`,
        [client.id]
      ).catch(() => [[]]);
      if (gRows?.[0]) {
        guardian = {
          id: gRows[0].id,
          name: [gRows[0].first_name, gRows[0].last_name].filter(Boolean).join(' '),
          email: gRows[0].email,
          relationship: gRows[0].relationship_title
        };
      }
    }
  }

  if (schoolLink) {
    const [rows] = await pool.execute(
      `SELECT id, name FROM agencies WHERE id = ? LIMIT 1`,
      [schoolLink.entity_id]
    );
    if (rows[0]) {
      school = { id: rows[0].id, name: rows[0].name };
      // Enrich with referral / enrollment counts when tables exist
      let activeReferrals = null;
      let enrolledClients = null;
      try {
        const [refRows] = await pool.execute(
          `SELECT COUNT(*) AS n FROM client_referrals
           WHERE school_organization_id = ? AND status IN ('active', 'open', 'pending')`,
          [school.id]
        );
        activeReferrals = Number(refRows[0]?.n || 0);
      } catch {
        activeReferrals = null;
      }
      try {
        const [enRows] = await pool.execute(
          `SELECT COUNT(*) AS n FROM clients
           WHERE organization_id = ? AND (is_archived IS NULL OR is_archived = 0)`,
          [school.id]
        );
        enrolledClients = Number(enRows[0]?.n || 0);
      } catch {
        enrolledClients = null;
      }
      school.activeReferrals = activeReferrals;
      school.enrolledClients = enrolledClients;
    }
  }

  if (ticketLink || conversation.support_ticket_id) {
    const tid = ticketLink?.entity_id || conversation.support_ticket_id;
    const [rows] = await pool.execute(
      `SELECT id, subject, status, priority FROM support_tickets WHERE id = ? LIMIT 1`,
      [tid]
    );
    if (rows[0]) ticket = rows[0];
  }

  let recognized = null;
  const fromEmail = String(primary?.email || '').trim().toLowerCase();
  if (fromEmail && school) {
    recognized = {
      label: school.name,
      kind: 'School Partner',
      email: fromEmail,
      activeReferrals: school.activeReferrals,
      enrolledClients: school.enrolledClients
    };
  } else if (fromEmail) {
    // Try match school contact by email
    try {
      const [rows] = await pool.execute(
        `SELECT sc.id, sc.full_name AS name, sc.email, sc.school_organization_id AS agency_id, a.name AS school_name
         FROM school_contacts sc
         LEFT JOIN agencies a ON a.id = sc.school_organization_id
         WHERE LOWER(sc.email) = ?
         LIMIT 1`,
        [fromEmail]
      );
      if (rows[0]) {
        recognized = {
          label: rows[0].school_name || rows[0].name || fromEmail,
          kind: 'School Partner',
          email: fromEmail,
          contactName: rows[0].name
        };
        if (!school && rows[0].agency_id) {
          school = { id: rows[0].agency_id, name: rows[0].school_name };
        }
      }
    } catch {
      // school_contacts may not exist / different schema — ignore
    }
  }

  return {
    linkedTo: { client, guardian, school, ticket },
    links,
    participants,
    recognized
  };
}
