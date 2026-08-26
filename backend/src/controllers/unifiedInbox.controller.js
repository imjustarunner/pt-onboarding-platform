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
      syncTickets: req.query.sync !== '0'
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
