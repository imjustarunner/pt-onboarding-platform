import pool from '../config/database.js';
import CommunicationConversation from '../models/CommunicationConversation.model.js';
import Client from '../models/Client.model.js';
import Agency from '../models/Agency.model.js';
import Task from '../models/Task.model.js';
import { buildConversationContext } from './ticketEmailInboxAdapter.service.js';

const LINK_TYPES = new Set(['client', 'school', 'guardian', 'provider', 'referral', 'task', 'ticket']);

export async function attachConversationLink(conversationId, { entityType, entityId, label } = {}) {
  const conv = await CommunicationConversation.findById(conversationId);
  if (!conv) throw new Error('Conversation not found');
  const type = String(entityType || '').toLowerCase();
  const id = parseInt(entityId, 10);
  if (!LINK_TYPES.has(type)) throw new Error('Invalid entityType');
  if (!id) throw new Error('entityId is required');

  let resolvedLabel = label || null;
  if (type === 'client') {
    const client = await Client.findById(id);
    if (!client) throw new Error('Client not found');
    resolvedLabel = resolvedLabel || client.full_name || client.initials || `Client #${id}`;
  } else if (type === 'school') {
    const org = await Agency.findById(id);
    if (!org) throw new Error('School not found');
    resolvedLabel = resolvedLabel || org.name || `School #${id}`;
  }

  await CommunicationConversation.upsertLink(conversationId, type, id, resolvedLabel);
  return buildConversationContext(await CommunicationConversation.findById(conversationId));
}

export async function detachConversationLink(conversationId, entityType, entityId) {
  const conv = await CommunicationConversation.findById(conversationId);
  if (!conv) throw new Error('Conversation not found');
  await CommunicationConversation.removeLink(conversationId, String(entityType).toLowerCase(), parseInt(entityId, 10));
  return buildConversationContext(await CommunicationConversation.findById(conversationId));
}

export async function createTaskFromConversation(conversationId, { userId, title, description, urgency } = {}) {
  const conv = await CommunicationConversation.findById(conversationId);
  if (!conv) throw new Error('Conversation not found');
  const task = await Task.create({
    taskType: 'custom',
    title: title || `Follow up: ${conv.subject || 'Conversation'}`,
    description:
      description ||
      `From Communications Inbox conversation #${conv.id}\n\n${conv.last_message_preview || ''}`,
    urgency: urgency || 'medium',
    assignedByUserId: userId,
    sourceRefType: 'communication_conversation',
    sourceRefId: conv.id
  });
  await CommunicationConversation.upsertLink(conversationId, 'task', task.id, task.title);
  return { task, context: await buildConversationContext(await CommunicationConversation.findById(conversationId)) };
}

export async function createTicketFromConversation(
  conversationId,
  { userId, schoolOrganizationId, subject, question, clientId, priority } = {}
) {
  const conv = await CommunicationConversation.findById(conversationId);
  if (!conv) throw new Error('Conversation not found');
  const links = await CommunicationConversation.listLinks(conversationId);
  const linkedSchool = links.find((l) => l.entity_type === 'school');
  const linkedClient = links.find((l) => l.entity_type === 'client');

  const schoolId = parseInt(schoolOrganizationId || linkedSchool?.entity_id, 10);
  if (!schoolId) throw new Error('schoolOrganizationId is required (attach a school first or pass one)');

  const q =
    String(question || '').trim() ||
    [
      `Created from Communications Inbox conversation #${conv.id}`,
      conv.subject ? `Subject: ${conv.subject}` : null,
      conv.last_message_preview || null
    ]
      .filter(Boolean)
      .join('\n\n');

  const subj = String(subject || conv.subject || 'Inbox follow-up').trim().slice(0, 255);
  const cid = parseInt(clientId || linkedClient?.entity_id, 10) || null;
  const pri = ['low', 'medium', 'high'].includes(String(priority || '').toLowerCase())
    ? String(priority).toLowerCase()
    : 'medium';

  const [result] = await pool.execute(
    `INSERT INTO support_tickets
     (school_organization_id, agency_id, client_id, subject, question, status, priority,
      source_channel, created_by_user_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'open', ?, 'app', ?, NOW(), NOW())`,
    [schoolId, conv.agency_id || null, cid, subj, q, pri, userId || null]
  );
  const ticketId = result.insertId;
  await CommunicationConversation.update(conversationId, {});
  await pool.execute(
    `UPDATE communication_conversations SET support_ticket_id = COALESCE(support_ticket_id, ?) WHERE id = ?`,
    [ticketId, conversationId]
  ).catch(() => {});
  await CommunicationConversation.upsertLink(conversationId, 'ticket', ticketId, subj);
  if (cid) await CommunicationConversation.upsertLink(conversationId, 'client', cid, null);
  await CommunicationConversation.upsertLink(conversationId, 'school', schoolId, null);

  const [rows] = await pool.execute(`SELECT * FROM support_tickets WHERE id = ? LIMIT 1`, [ticketId]);
  return {
    ticket: rows[0] || { id: ticketId },
    context: await buildConversationContext(await CommunicationConversation.findById(conversationId))
  };
}

export async function createReferralFromConversation(
  conversationId,
  { userId, organizationId, studentInitials, studentName, referralReason, additionalNotes } = {}
) {
  const conv = await CommunicationConversation.findById(conversationId);
  if (!conv) throw new Error('Conversation not found');
  const links = await CommunicationConversation.listLinks(conversationId);
  const linkedSchool = links.find((l) => l.entity_type === 'school');
  const orgId = parseInt(organizationId || linkedSchool?.entity_id, 10);
  if (!orgId) throw new Error('organizationId (school) is required');

  const initials = String(studentInitials || '').toUpperCase().trim();
  const reason = String(referralReason || '').trim() || `Referral from inbox conversation #${conv.id}`;
  if (!initials) throw new Error('studentInitials is required');

  const organization = await Agency.findById(orgId);
  if (!organization) throw new Error('Organization not found');
  const orgType = organization.organization_type || 'agency';
  if (orgType !== 'school') throw new Error('Referrals can only be created for school organizations');

  let agencyId = conv.agency_id || organization.id;
  const client = await Client.create({
    organization_id: orgId,
    agency_id: agencyId,
    provider_id: null,
    initials,
    full_name: studentName || null,
    client_type: 'school',
    status: 'PENDING_REVIEW',
    submission_date: new Date().toISOString().split('T')[0],
    document_status: 'NONE',
    created_by_user_id: userId || null,
    internal_notes: [
      reason,
      additionalNotes || null,
      `Linked from Communications conversation #${conv.id}`,
      conv.subject ? `Email subject: ${conv.subject}` : null
    ]
      .filter(Boolean)
      .join('\n\n')
  });

  await CommunicationConversation.upsertLink(
    conversationId,
    'client',
    client.id,
    client.full_name || client.initials
  );
  await CommunicationConversation.upsertLink(conversationId, 'school', orgId, organization.name);
  await CommunicationConversation.upsertLink(conversationId, 'referral', client.id, initials);

  return {
    client,
    context: await buildConversationContext(await CommunicationConversation.findById(conversationId))
  };
}

export async function searchLinkableEntities({ agencyId, type, q, limit = 15 } = {}) {
  const query = String(q || '').trim();
  if (!agencyId || query.length < 2) return [];
  const like = `%${query.replace(/[%_]/g, '')}%`;
  const lim = Math.min(Math.max(Number(limit) || 15, 1), 40);
  const t = String(type || 'client').toLowerCase();

  if (t === 'school') {
    const [rows] = await pool.execute(
      `SELECT a.id, a.name AS label, 'school' AS entity_type
       FROM agencies a
       WHERE a.organization_type = 'school'
         AND (
           a.id IN (SELECT school_organization_id FROM agency_schools WHERE agency_id = ? AND is_active = TRUE)
           OR a.parent_agency_id = ?
           OR a.id = ?
         )
         AND a.name LIKE ?
       ORDER BY a.name ASC
       LIMIT ${lim}`,
      [agencyId, agencyId, agencyId, like]
    );
    return rows || [];
  }

  const [rows] = await pool.execute(
    `SELECT c.id, COALESCE(c.full_name, c.initials, CONCAT('Client #', c.id)) AS label, 'client' AS entity_type,
            c.status
     FROM clients c
     WHERE c.agency_id = ?
       AND (c.is_archived IS NULL OR c.is_archived = 0)
       AND (c.full_name LIKE ? OR c.initials LIKE ? OR CAST(c.id AS CHAR) = ?)
     ORDER BY c.full_name ASC
     LIMIT ${lim}`,
    [agencyId, like, like, query]
  );
  return rows || [];
}

export async function addSchoolRecordNote(conversationId, { userId, note } = {}) {
  const conv = await CommunicationConversation.findById(conversationId);
  if (!conv) throw new Error('Conversation not found');
  const links = await CommunicationConversation.listLinks(conversationId);
  const school = links.find((l) => l.entity_type === 'school');
  if (!school) throw new Error('Attach a school first');
  const text =
    String(note || '').trim() ||
    `Inbox note from conversation #${conv.id}: ${conv.subject || ''}\n${conv.last_message_preview || ''}`.trim();

  await CommunicationConversation.addMessage({
    conversationId,
    channel: conv.channel || 'email',
    direction: 'internal',
    authorUserId: userId,
    bodyText: `[School record · org #${school.entity_id}] ${text}`,
    isInternalNote: true,
    sentAt: new Date()
  });
  return { ok: true, schoolId: school.entity_id };
}
