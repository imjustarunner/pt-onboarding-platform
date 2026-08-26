import pool from '../config/database.js';
import CommunicationConversation from '../models/CommunicationConversation.model.js';
import CommunicationInbox from '../models/CommunicationInbox.model.js';

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
  if (s === 'waiting' || s === 'pending_external') return 'waiting_on_them';
  // Inbound email awaiting staff → needs reply
  return 'needs_reply';
}

/**
 * Ensure email support tickets appear as unified inbox conversations.
 * Idempotent via unique support_ticket_id on communication_conversations.
 */
export async function syncEmailTicketsToInbox({ agencyId, limit = 100, forceRefresh = false } = {}) {
  if (!agencyId) return { synced: 0 };

  await CommunicationInbox.ensureFromSenderIdentities(agencyId);

  const [tickets] = await pool.execute(
    `SELECT t.id, t.agency_id, t.school_organization_id, t.client_id, t.subject, t.question,
            t.status, t.priority, t.source_channel, t.source_email_from, t.source_email_subject,
            t.source_email_message_id, t.source_email_thread_id, t.source_email_received_at,
            t.updated_at, t.created_at,
            s.name AS school_name,
            c.full_name AS client_full_name
     FROM support_tickets t
     LEFT JOIN agencies s ON s.id = t.school_organization_id
     LEFT JOIN clients c ON c.id = t.client_id
     WHERE t.source_channel = 'email'
       AND (t.agency_id = ? OR t.agency_id IS NULL)
     ORDER BY COALESCE(t.source_email_received_at, t.updated_at, t.created_at) DESC
     LIMIT ${Math.min(Number(limit) || 100, 300)}`,
    [agencyId]
  );

  // Prefer schoolreply / schools identity inbox for this agency
  const inboxes = await CommunicationInbox.listForAgency({ agencyId });
  const preferred =
    inboxes.find((i) => /schoolreply|school_reply|schools@/i.test(`${i.identity_key || ''} ${i.from_email || ''}`)) ||
    inboxes.find((i) => /school/i.test(i.identity_key || '') || /school/i.test(i.from_email || '')) ||
    inboxes.find((i) => /support/i.test(i.identity_key || '') || /support@/i.test(i.from_email || '')) ||
    inboxes[0] ||
    null;

  let synced = 0;
  for (const ticket of tickets || []) {
    let conv = await CommunicationConversation.findBySupportTicketId(ticket.id);
    const subject = ticket.source_email_subject || ticket.subject || 'Email conversation';
    const lastAt = ticket.source_email_received_at || ticket.updated_at || ticket.created_at;
    const preview = previewFrom(ticket.question);

    if (!conv) {
      conv = await CommunicationConversation.create({
        agencyId: ticket.agency_id || agencyId,
        inboxId: preferred?.id || null,
        channel: 'email',
        subject,
        status: mapTicketStatus(ticket),
        priority: ['low', 'normal', 'high', 'urgent'].includes(String(ticket.priority || '').toLowerCase())
          ? String(ticket.priority).toLowerCase()
          : 'normal',
        supportTicketId: ticket.id,
        lastMessageAt: lastAt,
        lastMessagePreview: preview,
        externalThreadId: ticket.source_email_thread_id || null
      });
      synced += 1;

      if (ticket.source_email_from) {
        await CommunicationConversation.upsertParticipant(conv.id, {
          kind: 'school_contact',
          email: String(ticket.source_email_from).trim().toLowerCase(),
          displayName: ticket.source_email_from,
          isPrimary: true
        });
      }
      if (ticket.client_id) {
        const name = ticket.client_full_name || `Client #${ticket.client_id}`;
        await CommunicationConversation.upsertLink(conv.id, 'client', ticket.client_id, name);
      }
      if (ticket.school_organization_id) {
        await CommunicationConversation.upsertLink(
          conv.id,
          'school',
          ticket.school_organization_id,
          ticket.school_name || `School #${ticket.school_organization_id}`
        );
      }
      await CommunicationConversation.upsertLink(conv.id, 'ticket', ticket.id, `Ticket #${ticket.id}`);

      // Seed first message from ticket question / email body
      await CommunicationConversation.addMessage({
        conversationId: conv.id,
        channel: 'email',
        direction: 'inbound',
        from: ticket.source_email_from
          ? { email: ticket.source_email_from, name: ticket.source_email_from }
          : null,
        subject,
        bodyText: ticket.question || '',
        internetMessageId: ticket.source_email_message_id || null,
        sentAt: lastAt
      });

      // Pull existing ticket thread messages
      const [tmsgs] = await pool.execute(
        `SELECT id, author_user_id, author_role, body, created_at
         FROM support_ticket_messages
         WHERE ticket_id = ?
         ORDER BY created_at ASC
         LIMIT 100`,
        [ticket.id]
      );
      for (const m of tmsgs || []) {
        const role = String(m.author_role || '');
        const isInternal = role.includes('internal');
        const isSystemEmail = role === 'system_email';
        if (isSystemEmail && previewFrom(m.body) === preview) continue;
        await CommunicationConversation.addMessage({
          conversationId: conv.id,
          channel: 'email',
          direction: isInternal ? 'internal' : isSystemEmail ? 'inbound' : 'outbound',
          authorUserId: m.author_user_id || null,
          bodyText: m.body || '',
          isInternalNote: isInternal,
          supportTicketMessageId: m.id,
          sentAt: m.created_at
        });
      }
    } else if (forceRefresh) {
      // Refresh preview/status lightly (only when explicitly requested)
      await CommunicationConversation.update(conv.id, {
        subject,
        status: conv.status === 'resolved' ? 'resolved' : mapTicketStatus(ticket),
        lastMessageAt: lastAt,
        lastMessagePreview: preview || conv.last_message_preview
      });
    }
  }

  return { synced, total: (tickets || []).length };
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
