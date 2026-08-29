import {
  listInboxes,
  listConversations,
  getAttentionSummary,
  getConversationDetail,
  updateConversation,
  replyToConversation,
  composeNewEmail,
  undoOutboundMessage,
  markConversationSpam,
  blockAddress,
  exportConversation
} from '../services/unifiedInbox.service.js';
import {
  ensurePersonalMailbox,
  isPersonalMailboxEligibleRole
} from '../services/personalMailbox.service.js';
import {
  getCommunicationPrefs,
  updateCommunicationPrefs
} from '../services/inboxDigest.service.js';
import {
  searchCommunicationDirectory,
  evaluateSendPreflight
} from '../services/communicationDirectory.service.js';
import {
  attachConversationLink,
  detachConversationLink,
  createTaskFromConversation,
  createTicketFromConversation,
  createReferralFromConversation,
  searchLinkableEntities,
  addSchoolRecordNote
} from '../services/unifiedInboxActions.service.js';
import {
  generateComposerAssist,
  generateThreadInsight
} from '../services/unifiedInboxAi.service.js';
import CommunicationInbox from '../models/CommunicationInbox.model.js';

function resolveAgencyId(req) {
  const raw = req.query.agencyId ?? req.body?.agencyId ?? req.user?.agency_id;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function isAllowedRole(user) {
  const role = String(user?.role || '').toLowerCase();
  return (
    ['admin', 'super_admin', 'support'].includes(role) || isPersonalMailboxEligibleRole(role)
  );
}

function isBackofficeRole(user) {
  return ['admin', 'super_admin', 'support'].includes(String(user?.role || '').toLowerCase());
}

function deny(res) {
  return res.status(403).json({ error: { message: 'Communications inbox access required' } });
}

/**
 * GET /api/communications/inboxes?agencyId=
 */
export async function getUnifiedInboxes(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const inboxes = await listInboxes({ agencyId, userId: req.user.id });
    res.json({ inboxes });
  } catch (e) {
    next(e);
  }
}

/**
 * GET /api/communications/attention-summary?agencyId=
 */
export async function getUnifiedAttentionSummary(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const summary = await getAttentionSummary({ agencyId, userId: req.user.id });
    res.json({ summary });
  } catch (e) {
    next(e);
  }
}

/**
 * GET /api/communications/conversations?agencyId=&inboxId=&channel=&filter=&q=
 */
export async function getUnifiedConversations(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    let inboxId = req.query.inboxId != null && req.query.inboxId !== '' && req.query.inboxId !== 'null'
      ? parseInt(req.query.inboxId, 10)
      : null;
    let ownerUserId = null;
    let filter = String(req.query.filter || 'all');

    if (req.query.inboxId === 'assigned') {
      inboxId = null;
      filter = filter === 'all' ? 'assigned' : filter;
      ownerUserId = req.user.id;
    }

    const conversations = await listConversations({
      agencyId,
      inboxId: Number.isFinite(inboxId) ? inboxId : null,
      channel: req.query.channel || null,
      status: req.query.status || null,
      filter,
      ownerUserId,
      q: req.query.q || null,
      fromEmail: req.query.fromEmail || req.query.from || null,
      hasAttachment:
        req.query.hasAttachment != null && req.query.hasAttachment !== ''
          ? req.query.hasAttachment
          : null,
      dateFrom: req.query.dateFrom || null,
      dateTo: req.query.dateTo || null,
      limit: req.query.limit,
      offset: req.query.offset,
      userId: req.user.id,
      syncTickets: req.query.sync !== '0',
      isAdminViewer: isBackofficeRole(req.user),
      unknownOnly: filter === 'unknown' || req.query.unknown === '1',
      includeHeld: req.query.includeHeld === '1' && isBackofficeRole(req.user)
    });
    res.json({ conversations });
  } catch (e) {
    next(e);
  }
}

/**
 * GET /api/communications/conversations/:id?agencyId=
 */
export async function getUnifiedConversation(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const detail = await getConversationDetail(id, {
      userId: req.user.id,
      markRead: req.query.markRead !== '0'
    });
    if (!detail) return res.status(404).json({ error: { message: 'Conversation not found' } });
    res.json(detail);
  } catch (e) {
    next(e);
  }
}

/**
 * PATCH /api/communications/conversations/:id
 */
export async function patchUnifiedConversation(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const conversation = await updateConversation(id, req.body || {}, { userId: req.user.id });
    res.json({ conversation });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/communications/conversations/:id/reply
 * body: { mode, text, html, to, cc, bcc, subject, isInternalNote, setStatus, attachments }
 */
export async function postUnifiedReply(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const result = await replyToConversation(id, req.body || {}, { userId: req.user.id });
    const detail = await getConversationDetail(id, { userId: req.user.id, markRead: true });
    res.json({ ...result, ...detail });
  } catch (e) {
    const msg = e?.message || 'Reply failed';
    if (e?.status && Number(e.status) >= 400 && Number(e.status) < 500) {
      return res.status(e.status).json({ error: { message: msg, details: e.details || undefined } });
    }
    if (/required|not found|No sender|Select an inbox|opted|texting number|SMS/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    if (/Access denied|disabled|read-only/i.test(msg)) {
      return res.status(403).json({ error: { message: msg } });
    }
    if (/Vonage|502/i.test(msg) || e?.status === 502) {
      return res.status(502).json({ error: { message: msg, details: e.details || undefined } });
    }
    next(e);
  }
}

/**
 * POST /api/communications/conversations
 * Compose new email
 */
export async function postUnifiedCompose(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const inboxId = parseInt(req.body?.inboxId, 10);
    const conversation = await composeNewEmail({
      agencyId,
      inboxId,
      userId: req.user.id,
      payload: req.body || {}
    });
    const detail = await getConversationDetail(conversation.id, { userId: req.user.id, markRead: true });
    res.status(201).json(detail);
  } catch (e) {
    const msg = e?.message || 'Compose failed';
    if (/required|Select an inbox|Recipient/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/**
 * POST /api/communications/inboxes/personal/ensure
 * body: { agencyId, userId? } — userId only for backoffice provisioning another user
 */
export async function postEnsurePersonalInbox(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    let targetUserId = req.user.id;
    if (req.body?.userId != null) {
      if (!isBackofficeRole(req.user)) {
        return res.status(403).json({ error: { message: 'Only admin/support can provision another user mailbox' } });
      }
      targetUserId = parseInt(req.body.userId, 10);
    }
    const inbox = await ensurePersonalMailbox({
      agencyId,
      userId: targetUserId,
      actorUserId: req.user.id
    });
    res.json({ inbox });
  } catch (e) {
    const msg = e?.message || 'Provision failed';
    if (/eligible|required|not found/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/**
 * GET /api/communications/prefs
 */
export async function getUnifiedPrefs(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const prefs = await getCommunicationPrefs(req.user.id);
    res.json({ prefs });
  } catch (e) {
    next(e);
  }
}

/**
 * PATCH /api/communications/prefs
 * body: { personalEmailNotify?, digestHours? }
 */
export async function patchUnifiedPrefs(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const prefs = await updateCommunicationPrefs(req.user.id, {
      personalEmailNotify: req.body?.personalEmailNotify,
      digestHours: req.body?.digestHours
    });
    res.json({ prefs });
  } catch (e) {
    next(e);
  }
}

/**
 * GET /api/communications/directory?q=&agencyId=
 */
export async function getUnifiedDirectory(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const results = await searchCommunicationDirectory({
      agencyId,
      q: req.query.q,
      limit: req.query.limit
    });
    res.json({ results });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/communications/send-preflight
 * body: { agencyId, to, cc, bcc, subject, text, html, fromEmail? }
 */
export async function postSendPreflight(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    let fromEmail = req.body?.fromEmail || null;
    if (!fromEmail && req.body?.inboxId) {
      const inbox = await CommunicationInbox.findById(parseInt(req.body.inboxId, 10));
      fromEmail = inbox?.from_email || null;
    }
    const result = await evaluateSendPreflight({
      agencyId,
      payload: req.body || {},
      fromEmail
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/communications/conversations/:id/links
 */
export async function postConversationLink(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const context = await attachConversationLink(id, req.body || {});
    const detail = await getConversationDetail(id, { userId: req.user.id, markRead: false });
    res.json({ context, ...detail });
  } catch (e) {
    const msg = e?.message || 'Attach failed';
    if (/required|Invalid|not found/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/**
 * DELETE /api/communications/conversations/:id/links/:entityType/:entityId
 */
export async function deleteConversationLink(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const context = await detachConversationLink(id, req.params.entityType, req.params.entityId);
    const detail = await getConversationDetail(id, { userId: req.user.id, markRead: false });
    res.json({ context, ...detail });
  } catch (e) {
    next(e);
  }
}

/**
 * GET /api/communications/link-search?agencyId=&type=client|school&q=
 */
export async function getLinkSearch(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const results = await searchLinkableEntities({
      agencyId,
      type: req.query.type,
      q: req.query.q,
      limit: req.query.limit
    });
    res.json({ results });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/communications/conversations/:id/actions/create-task
 */
export async function postCreateTaskAction(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const result = await createTaskFromConversation(id, { ...req.body, userId: req.user.id });
    const detail = await getConversationDetail(id, { userId: req.user.id, markRead: false });
    res.status(201).json({ ...result, ...detail });
  } catch (e) {
    const msg = e?.message || 'Create task failed';
    if (/not found/i.test(msg)) return res.status(404).json({ error: { message: msg } });
    next(e);
  }
}

/**
 * POST /api/communications/conversations/:id/actions/create-ticket
 */
export async function postCreateTicketAction(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const result = await createTicketFromConversation(id, { ...req.body, userId: req.user.id });
    const detail = await getConversationDetail(id, { userId: req.user.id, markRead: false });
    res.status(201).json({ ...result, ...detail });
  } catch (e) {
    const msg = e?.message || 'Create ticket failed';
    if (/required|not found/i.test(msg)) return res.status(400).json({ error: { message: msg } });
    next(e);
  }
}

/**
 * POST /api/communications/conversations/:id/actions/create-referral
 */
export async function postCreateReferralAction(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const result = await createReferralFromConversation(id, {
      userId: req.user.id,
      organizationId: req.body?.organizationId || req.body?.organization_id,
      studentInitials: req.body?.studentInitials || req.body?.student_initials,
      studentName: req.body?.studentName || req.body?.student_name,
      referralReason: req.body?.referralReason || req.body?.referral_reason,
      additionalNotes: req.body?.additionalNotes || req.body?.additional_notes
    });
    const detail = await getConversationDetail(id, { userId: req.user.id, markRead: false });
    res.status(201).json({ ...result, ...detail });
  } catch (e) {
    const msg = e?.message || 'Create referral failed';
    if (/required|not found|only be created/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/**
 * POST /api/communications/conversations/:id/actions/school-note
 */
export async function postSchoolNoteAction(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const result = await addSchoolRecordNote(id, { userId: req.user.id, note: req.body?.note });
    const detail = await getConversationDetail(id, { userId: req.user.id, markRead: false });
    res.json({ ...result, ...detail });
  } catch (e) {
    const msg = e?.message || 'School note failed';
    if (/required|Attach|not found/i.test(msg)) return res.status(400).json({ error: { message: msg } });
    next(e);
  }
}

/**
 * POST /api/communications/conversations/:id/messages/:messageId/undo
 */
export async function postUndoMessage(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    const messageId = parseInt(req.params.messageId, 10);
    if (!id || !messageId) return res.status(400).json({ error: { message: 'Invalid id' } });
    const result = await undoOutboundMessage(id, messageId, { userId: req.user.id });
    const detail = await getConversationDetail(id, { userId: req.user.id, markRead: false });
    res.json({ ...result, ...detail });
  } catch (e) {
    const msg = e?.message || 'Undo failed';
    if (/cannot|not found|already sent/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    next(e);
  }
}

/**
 * POST /api/communications/conversations/:id/spam
 */
export async function postMarkSpam(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const conversation = await markConversationSpam(id, {
      userId: req.user.id,
      blockSender: req.body?.blockSender !== false
    });
    res.json({ conversation });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/communications/block
 */
export async function postBlockAddress(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const result = await blockAddress({
      agencyId,
      address: req.body?.address,
      addressKind: req.body?.addressKind,
      reason: req.body?.reason,
      createdByUserId: req.user.id
    });
    res.json(result);
  } catch (e) {
    const msg = e?.message || 'Block failed';
    if (/required/i.test(msg)) return res.status(400).json({ error: { message: msg } });
    next(e);
  }
}

/**
 * GET /api/communications/conversations/:id/export?format=html|txt
 */
export async function getConversationExport(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const format = String(req.query.format || 'html').toLowerCase() === 'txt' ? 'txt' : 'html';
    const file = await exportConversation(id, { format });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    res.send(file.body);
  } catch (e) {
    const msg = e?.message || 'Export failed';
    if (/not found/i.test(msg)) return res.status(404).json({ error: { message: msg } });
    next(e);
  }
}

/**
 * POST /api/communications/conversations/:id/ai/draft
 * body: { instruction?, tone? }
 */
export async function postAiDraft(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const result = await generateComposerAssist(id, {
      instruction: req.body?.instruction,
      tone: req.body?.tone
    });
    res.json(result);
  } catch (e) {
    const msg = e?.message || 'AI draft failed';
    if (/not found|empty draft/i.test(msg)) {
      return res.status(400).json({ error: { message: msg } });
    }
    if (e?.status === 503 || /Gemini|Vertex|access token/i.test(msg)) {
      return res.status(503).json({ error: { message: msg } });
    }
    next(e);
  }
}

/**
 * POST /api/communications/conversations/:id/ai/insight
 * body: { force? }
 */
export async function postAiInsight(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: { message: 'Invalid id' } });
    const result = await generateThreadInsight(id, { force: !!req.body?.force });
    res.json(result);
  } catch (e) {
    const msg = e?.message || 'AI insight failed';
    if (/not found/i.test(msg)) return res.status(404).json({ error: { message: msg } });
    if (e?.status === 503 || /Gemini|Vertex|access token/i.test(msg)) {
      return res.status(503).json({ error: { message: msg } });
    }
    next(e);
  }
}

/**
 * GET /api/communications/contacts?agencyId=
 */
export async function getMyCommunicationContacts(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const UserCommunicationContact = (await import('../models/UserCommunicationContact.model.js')).default;
    const contacts = await UserCommunicationContact.listForOwner(req.user.id, {
      agencyId,
      trustStatus: req.query.trustStatus || null
    });
    res.json({ contacts });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/communications/contacts — add/mark known
 */
export async function postMyCommunicationContact(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const UserCommunicationContact = (await import('../models/UserCommunicationContact.model.js')).default;
    const contact = await UserCommunicationContact.upsertSafe({
      agencyId,
      ownerUserId: req.user.id,
      email: req.body?.email,
      displayName: req.body?.displayName || null,
      phone: req.body?.phone || null,
      linkedUserId: req.body?.linkedUserId || null,
      linkedClientId: req.body?.linkedClientId || null,
      source: req.body?.source || 'manual'
    });
    // If marking known from a conversation, clear unknown flag
    const conversationId = Number(req.body?.conversationId || 0);
    if (conversationId) {
      await poolOrUpdateUnknown(conversationId);
    }
    res.json({ contact });
  } catch (e) {
    next(e);
  }
}

async function poolOrUpdateUnknown(conversationId) {
  const pool = (await import('../config/database.js')).default;
  await pool.execute(
    `UPDATE communication_conversations
     SET is_unknown_sender = 0, sender_trust = COALESCE(NULLIF(sender_trust,''), 'contact')
     WHERE id = ?`,
    [conversationId]
  );
}

/**
 * POST /api/communications/contacts/block
 */
export async function postBlockCommunicationContact(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: { message: 'Block reason is required' } });
    const UserCommunicationContact = (await import('../models/UserCommunicationContact.model.js')).default;
    const contact = await UserCommunicationContact.block({
      agencyId,
      ownerUserId: req.user.id,
      email: req.body?.email,
      reason,
      blockedByUserId: req.user.id,
      linkedUserId: req.body?.linkedUserId || null,
      displayName: req.body?.displayName || null
    });

    // If blocked identity is an in-app user, open a support ticket naming the blocker
    if (contact?.linked_user_id) {
      try {
        const pool = (await import('../config/database.js')).default;
        await pool.execute(
          `INSERT INTO support_tickets (agency_id, subject, status, priority, source_channel, created_by_user_id, metadata_json)
           VALUES (?, ?, 'open', 'normal', 'app', ?, ?)`,
          [
            agencyId,
            `Blocked user contact reroute — blocked by user #${req.user.id}`,
            req.user.id,
            JSON.stringify({
              blockedUserId: contact.linked_user_id,
              blockedEmail: contact.email,
              blockerUserId: req.user.id,
              reason
            })
          ]
        );
      } catch (e) {
        console.warn('[unifiedInbox] block ticket failed:', e?.message || e);
      }
    }
    res.json({ contact });
  } catch (e) {
    next(e);
  }
}

/**
 * DELETE /api/communications/contacts/:id
 */
export async function deleteMyCommunicationContact(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const UserCommunicationContact = (await import('../models/UserCommunicationContact.model.js')).default;
    await UserCommunicationContact.remove({
      ownerUserId: req.user.id,
      agencyId,
      id: parseInt(req.params.id, 10)
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/communications/conversations/:id/mark-known
 */
export async function postMarkSenderKnown(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'agencyId and id required' } });
    const detail = await getConversationDetail(id, { userId: req.user.id, markRead: false });
    if (!detail?.conversation) return res.status(404).json({ error: { message: 'Not found' } });
    const participants = await (await import('../models/CommunicationConversation.model.js')).default
      .listParticipants(id);
    const primary = participants.find((p) => p.is_primary) || participants[0];
    if (!primary?.email) return res.status(400).json({ error: { message: 'No sender email' } });
    const UserCommunicationContact = (await import('../models/UserCommunicationContact.model.js')).default;
    const contact = await UserCommunicationContact.upsertSafe({
      agencyId,
      ownerUserId: req.user.id,
      email: primary.email,
      displayName: primary.display_name || null,
      source: 'mark_known'
    });
    await poolOrUpdateUnknown(id);
    res.json({ contact, conversationId: id });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/communications/secure-notify
 * Staff-initiated secure message notification email (no PHI).
 * Clinical + school only; learning clients should use regular Email compose.
 */
export async function postSecureNotify(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    const recipientEmail = String(req.body?.recipientEmail || req.body?.to || '').trim();
    if (!agencyId || !recipientEmail) {
      return res.status(400).json({ error: { message: 'agencyId and recipientEmail required' } });
    }
    const {
      sendSecureMessageNotification,
      sendLearningClientMessageEmail,
      resolveClientContextForMessageNotify,
      isSecureMessageEligibleClientType
    } = await import('../services/secureMessageNotify.service.js');

    let recipientUserId = req.body?.recipientUserId || null;
    if (!recipientUserId && recipientEmail) {
      const pool = (await import('../config/database.js')).default;
      const [urows] = await pool.execute(
        `SELECT id FROM users
         WHERE LOWER(email) = ? OR LOWER(COALESCE(personal_email, '')) = ?
         LIMIT 1`,
        [recipientEmail.toLowerCase(), recipientEmail.toLowerCase()]
      );
      recipientUserId = urows?.[0]?.id || null;
    }

    const ctx = await resolveClientContextForMessageNotify({
      agencyId,
      recipientUserId,
      clientId: req.body?.clientId || null
    });

    if (String(ctx.clientType || '').toLowerCase() === 'learning') {
      const note = String(req.body?.note || req.body?.body || req.body?.text || '').trim();
      if (!note) {
        return res.status(400).json({
          error: {
            message:
              'Learning clients receive regular emails (not secure messages). Use Email compose, or include a message body.'
          },
          result: { sent: false, reason: 'learning_uses_regular_email', clientType: 'learning' }
        });
      }
      const result = await sendLearningClientMessageEmail({
        agencyId,
        senderUserId: req.user.id,
        recipientUserId,
        recipientEmail,
        clientId: ctx.clientId,
        chatThreadId: req.body?.chatThreadId || null,
        messageBody: note
      });
      return res.json({ ok: true, channel: 'email', ...result });
    }

    if (ctx.clientType && !isSecureMessageEligibleClientType(ctx.clientType)) {
      return res.status(400).json({
        error: {
          message: 'Secure messages are only for clinical and school clients/guardians. Use Email for other recipients.'
        },
        result: { sent: false, reason: 'client_type_not_eligible', clientType: ctx.clientType }
      });
    }

    const result = await sendSecureMessageNotification({
      agencyId,
      senderUserId: req.user.id,
      recipientUserId,
      recipientEmail,
      clientId: ctx.clientId || req.body?.clientId || null,
      chatThreadId: req.body?.chatThreadId || null,
      conversationId: req.body?.conversationId || null,
      messageId: req.body?.messageId || null,
      messageSource: req.body?.messageSource || 'compose'
    });
    if (!result.sent) {
      const msg =
        result.reason === 'learning_uses_regular_email'
          ? 'Learning clients receive regular emails — use Email compose.'
          : result.reason === 'client_type_not_eligible'
            ? 'Secure messages are only for clinical and school clients/guardians.'
            : result.reason || 'Not sent';
      return res.status(400).json({ error: { message: msg }, result });
    }
    res.json({ ok: true, channel: 'secure', ...result });
  } catch (e) {
    next(e);
  }
}
