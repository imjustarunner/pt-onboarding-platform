import { listMessageReactions } from '../services/hubMessageReactions.service.js';
import {
  listInboxes,
  listConversations,
  getAttentionSummary,
  getConversationDetail,
  updateConversation,
  reviewInboxNotices,
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
import { groupKeyForIdentity, listUserDepartmentalGroupKeys } from '../services/departmentalGroupAccess.service.js';
import { claimGroupEmailConversation } from '../services/groupEmailClaim.service.js';

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

export async function postReviewInboxNotices(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    res.json(await reviewInboxNotices({ agencyId, userId: req.user.id, category: req.body?.category,
      conversationIds: Array.isArray(req.body?.conversationIds) ? req.body.conversationIds : [] }));
  } catch (error) { next(error); }
}

/**
 * GET /api/communications/inboxes?agencyId=
 */
export async function getUnifiedInboxes(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const inboxes = await listInboxes({
      agencyId,
      userId: req.user.id,
      includeShared: isBackofficeRole(req.user)
    });
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
    // Match Hub / conversation list: non-ops see assigned + personal App inbox only.
    // Messages Hub always personal-scopes (even for admins) so shared school/ticket mail stays in Communications Center.
    const hubScope = req.query.hubScope === '1' || req.query.hubScope === 'true';
    const scopeToUserId =
      hubScope || !isBackofficeRole(req.user) ? req.user.id : null;
    const summary = await getAttentionSummary({
      agencyId,
      userId: req.user.id,
      scopeToUserId,
      includeResponseTime: !hubScope,
      includeGlobal: req.query.includeGlobal !== '0',
      channel: req.query.channel === 'group' ? 'email' : req.query.channel,
      groupOnly: req.query.channel === 'group',
      excludeGroup: req.query.channel === 'email' && hubScope,
      inboxId: Number(req.query.inboxId) || null,
      claimState: req.query.claimState
    });
    // Hub Unread badge = email unread + unread chat/channel threads
    if (hubScope && !req.query.channel && !req.query.inboxId && !req.query.claimState) {
      try {
        const { countHubChatUnreadThreads } = await import('../services/messagesHub.service.js');
        const chatByChannel = await countHubChatUnreadThreads({
          agencyId,
          userId: req.user.id,
          byChannel: true
        });
        const unreadByChannel = { ...(summary.unreadByChannel || {}) };
        for (const [channel, count] of Object.entries(chatByChannel)) {
          unreadByChannel[channel] = Number(unreadByChannel[channel] || 0) + count;
        }
        summary.emailUnread = Number(unreadByChannel.email || 0);
        summary.chatUnread = Object.values(chatByChannel).reduce((total, count) => total + count, 0);
        summary.unreadByChannel = unreadByChannel;
        summary.unread = Object.values(unreadByChannel).reduce((total, count) => total + count, 0);
      } catch (e) {
        console.warn('[attention-summary] chat unread:', e?.message || e);
      }
    }
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

    if (req.query.agencyScopes == null) {
      const conversations = await listUnifiedConversationsForAgency(req.user, agencyId, req.query);
      return res.json({ conversations });
    }

    if (!['1', 'true'].includes(req.query.hubScope)) return deny(res);
    const scopes = readConversationScopes(req.query.agencyScopes);
    const { default: User } = await import('../models/User.model.js');
    const memberships = new Set((await User.getAgencies(req.user.id)).map(agency => Number(agency.id)));
    if (scopes.some(scope => !memberships.has(scope.agencyId))) return deny(res);

    // Keep at most four agency reads in flight per request. A canceled folder
    // navigation stops launching further reads for the old view.
    const pages = new Array(scopes.length);
    let cursor = 0;
    let failed = false;
    await Promise.all(Array.from({ length: Math.min(4, scopes.length) }, async () => {
      while (!failed && !res.destroyed && cursor < scopes.length) {
        const index = cursor++;
        const { agencyId, offset, groupInboxId } = scopes[index];
        try {
          const rows = await listUnifiedConversationsForAgency(req.user, agencyId, {
            ...req.query, offset, groupInboxId, includeGlobal: index === 0 ? '1' : '0'
          }, { confirmedMembership: true });
          pages[index] = rows.map(row => ({ ...row, agency_id: row.agency_id || agencyId }));
        } catch (error) {
          failed = true;
          throw error;
        }
      }
    }));
    if (!res.destroyed) res.json({ conversations: pages.flat() });
  } catch (e) {
    if (e.conversationListError) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
}

function conversationListError(status, message) {
  return Object.assign(new Error(message), { status, conversationListError: true });
}

function readConversationScopes(raw) {
  const invalid = () => conversationListError(400, 'Invalid conversation organization scope');
  let scopes;
  try { scopes = typeof raw === 'string' ? JSON.parse(raw) : null; }
  catch { throw invalid(); }
  if (!Array.isArray(scopes) || !scopes.length || scopes.length > 100) throw invalid();
  const ids = new Set();
  for (const scope of scopes) {
    if (!scope || !Number.isSafeInteger(scope.agencyId) || scope.agencyId < 1 || ids.has(scope.agencyId)
      || !Number.isSafeInteger(scope.offset) || scope.offset < 0
      || (scope.groupInboxId != null && (!Number.isSafeInteger(scope.groupInboxId) || scope.groupInboxId < 1))) throw invalid();
    ids.add(scope.agencyId);
  }
  return scopes;
}

async function listUnifiedConversationsForAgency(user, agencyId, query, { confirmedMembership = false } = {}) {
  const adminViewer = isBackofficeRole(user);
  const hubScope = query.hubScope === '1' || query.hubScope === 'true';
  const rawInbox = query.inboxId;
  let inboxId =
    rawInbox != null && rawInbox !== '' && rawInbox !== 'null' && rawInbox !== 'assigned' && rawInbox !== 'my_inbox' && rawInbox !== 'group_email' && rawInbox !== 'school_groups'
      ? parseInt(String(rawInbox), 10)
      : null;
  let ownerUserId = null;
  let filter = String(query.filter || 'all');
  let scopeToUserId = null;

  if (rawInbox === 'assigned') {
    inboxId = null;
    filter = filter === 'all' ? 'assigned' : filter;
    ownerUserId = user.id;
  }

  // Non-ops roles: never browse shared agency/tickets mailboxes (messages@, etc.).
  // Their Hub "Inbox" is assigned-to-me + personal App inbox only.
  // Messages Hub (hubScope) uses the same personal scope even for admins.
  if (!adminViewer || hubScope) {
    scopeToUserId = user.id;
    if (Number.isFinite(inboxId)) {
      const box = await CommunicationInbox.findById(inboxId);
      if (!box || (box.agency_id != null && Number(box.agency_id) !== Number(agencyId))) {
        throw conversationListError(404, 'Inbox not found');
      }
      if (String(box.kind || '') === 'shared') {
        const groupKey = groupKeyForIdentity(box);
        const permitted = groupKey ? (await listUserDepartmentalGroupKeys({ agencyId, userId: user.id })).includes(groupKey) : (await (await import('../services/unifiedInbox.service.js')).loadGroupEmailInboxScope({agencyId,userId:user.id})).allowedGroupInboxIds.includes(Number(box.id));
        if (!permitted) throw conversationListError(403, 'Communications inbox access required');
      } else if (
        String(box.kind || '') === 'personal' &&
        Number(box.owner_user_id) !== Number(user.id)
      ) {
        throw conversationListError(403, 'Communications inbox access required');
      }
    }
    if (rawInbox === 'my_inbox') {
      const personal = await CommunicationInbox.findPersonalForUser(agencyId, user.id);
      inboxId = personal?.id || null;
      // Still keep scopeToUserId so empty personal inbox does not fall open to shared
    }
  }

  // Sender trust is refreshed by the policy scheduler. Reading a folder must
  // not wait for agency-wide directory checks or classify other owners' mail.

  if (filter === 'sent' && [undefined, 'all', 'sms'].includes(query.channel)) {
    const { default: User } = await import('../models/User.model.js');
    const allowed = confirmedMembership || user.role === 'super_admin' || (await User.getAgencies(user.id)).some(agency => Number(agency.id) === agencyId);
    if (!allowed) throw conversationListError(403, 'Communications inbox access required');
    const { syncSmsThreads } = await import('../services/channelInboxAdapter.service.js');
    await syncSmsThreads({ agencyId, sentByUserId: user.id, limit: (Number(query.offset) || 0) + (Number(query.limit) || 80) });
  }

  return listConversations({
    agencyId,
    inboxId: Number(query.groupInboxId) > 0 ? Number(query.groupInboxId) : Number.isFinite(inboxId) ? inboxId : null,
    channel: ['group','groups'].includes(query.channel) ? 'email' : query.channel || null,
    includeGlobal: query.includeGlobal !== '0',
    claimState: query.claimState,
    category: String(query.category || '') || null, sort: query.sort,
    status: query.status || null,
    filter,
    ownerUserId,
    q: query.q || null,
    fromEmail: query.fromEmail || query.from || null,
    hasAttachment:
      query.hasAttachment != null && query.hasAttachment !== ''
        ? query.hasAttachment
        : null,
    dateFrom: query.dateFrom || null,
    dateTo: query.dateTo || null,
    limit: query.limit,
    offset: query.offset,
    userId: user.id,
    syncTickets: query.sync !== '0' && adminViewer && !hubScope,
    isAdminViewer: adminViewer && !hubScope,
    scopeToUserId,
    groupOnly: rawInbox === 'group_email' || (['group','groups'].includes(query.channel) && !query.category),
    excludeGroup: query.channel === 'email' && hubScope,
    schoolGroupsOnly: rawInbox === 'school_groups',
    unknownOnly: filter === 'unknown' || query.unknown === '1',
    includeHeld: query.includeHeld === '1' && adminViewer && !hubScope
  });
}

export async function postClaimGroupEmail(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const conversationId = Number(req.params.id);
    if (!Number.isSafeInteger(conversationId) || conversationId < 1) return res.status(400).json({ error: { message: 'Invalid id' } });
    res.json(await claimGroupEmailConversation({ conversationId, userId: req.user.id }));
  } catch (error) { next(error); }
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

    const reactions = await listMessageReactions(detail.messages.map(m => Number(m.id)),req.user.id);
    detail.messages = detail.messages.map(m => ({...m,reactions:reactions.get(Number(m.id)) || []}));
    res.set('Cache-Control','private, no-store');
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
    const result = await replyToConversation(id, {...req.body,deliveryPlan:undefined,availabilityChoiceRequired:true}, { userId: req.user.id });
    const detail = await getConversationDetail(result.forwardedConversationId || id, { userId: req.user.id, markRead: true });
    res.json({ ...result, ...detail });
  } catch (e) {
    const msg = e?.message || 'Reply failed';
    if (e?.status && Number(e.status) >= 400 && Number(e.status) < 500) {
      return res.status(e.status).json({ error: { message: msg, code:e.code, availability:e.availability, details: e.details || undefined } });
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
      payload: {...req.body,deliveryPlan:undefined,availabilityChoiceRequired:true}
    });
    const detail = await getConversationDetail(conversation.id, { userId: req.user.id, markRead: true });
    res.status(201).json(detail);
  } catch (e) {
    if(e.availability) return res.status(409).json({error:{message:e.message,code:e.code,availability:e.availability}});
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
    const { personalMessageSettingsEligibility } = await import('../services/messageReminderRecipient.service.js');
    res.json({ prefs, personalDelivery: await personalMessageSettingsEligibility(req.user.id) });
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
      personalEmailDeliveryMode: req.body?.personalEmailDeliveryMode,
      personalEmailDelayMode: req.body?.personalEmailDelayMode,
      personalEmailDelayHours: req.body?.personalEmailDelayHours,
      digestHours: req.body?.digestHours,
      digestBusinessHours: req.body?.digestBusinessHours,
      availabilityHoursEnabled: req.body?.availabilityHoursEnabled,
      meetingReminderBypassAvailability: req.body?.meetingReminderBypassAvailability,
      sendDelayEmailSeconds: req.body?.sendDelayEmailSeconds,
      sendDelaySecureSeconds: req.body?.sendDelaySecureSeconds,
      sendDelayInternalSeconds: req.body?.sendDelayInternalSeconds,
      sendDelaySmsSeconds: req.body?.sendDelaySmsSeconds
    });
    const { personalMessageSettingsEligibility } = await import('../services/messageReminderRecipient.service.js');
    res.json({ prefs, personalDelivery: await personalMessageSettingsEligibility(req.user.id) });
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
 * Marks sender as known (trust contact) and surfaces unread mail in Unread.
 */
export async function postMarkSenderKnown(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'agencyId and id required' } });
    const { resolveUnknownSenderConversation } = await import('../services/resolveUnknownSender.service.js');
    const result = await resolveUnknownSenderConversation({
      agencyId,
      userId: req.user.id,
      role: req.user.role,
      conversationId: id,
      mode: 'known_only',
      markUnreadIfNeeded: true
    });
    res.json({
      contact: result.trustContact,
      conversationId: id,
      markedUnread: result.markedUnread
    });
  } catch (e) {
    next(e);
  }
}

/**
 * POST /api/communications/conversations/:id/resolve-unknown
 * One-click: mark known + add to existing / create agency contact, then unread if needed.
 * Body: {
 *   mode: 'known_only' | 'existing_contact' | 'new_contact',
 *   existingContactId?, clientId?, fullName?, email?, phone?, relationshipType?,
 *   attachEmailToContact?: boolean (default true)
 * }
 */
export async function postResolveUnknownSender(req, res, next) {
  try {
    if (!isAllowedRole(req.user)) return deny(res);
    const agencyId = resolveAgencyId(req);
    const id = parseInt(req.params.id, 10);
    if (!agencyId || !id) return res.status(400).json({ error: { message: 'agencyId and id required' } });
    const mode = String(req.body?.mode || 'new_contact').trim();
    if (!['known_only', 'existing_contact', 'new_contact'].includes(mode)) {
      return res.status(400).json({ error: { message: 'Invalid mode' } });
    }
    const { resolveUnknownSenderConversation } = await import('../services/resolveUnknownSender.service.js');
    const result = await resolveUnknownSenderConversation({
      agencyId,
      userId: req.user.id,
      role: req.user.role,
      conversationId: id,
      mode,
      existingContactId: req.body?.existingContactId || null,
      clientId: req.body?.clientId || null,
      fullName: req.body?.fullName || null,
      email: req.body?.email || null,
      phone: req.body?.phone || null,
      relationshipType: req.body?.relationshipType || null,
      attachEmailToContact: req.body?.attachEmailToContact !== false,
      markUnreadIfNeeded: true
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
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
    const recipientEmail = String(req.body?.recipientEmail || req.body?.to || '').trim().toLowerCase();
    const body = String(req.body?.body || req.body?.text || req.body?.note || '').trim();
    if (!agencyId || !recipientEmail || !body) {
      return res.status(400).json({ error: { message: 'An agency, recipient and secure message are required' } });
    }
    const pool = (await import('../config/database.js')).default;
    const [users] = await pool.execute(
      `SELECT id FROM users WHERE LOWER(email) = ? OR LOWER(COALESCE(personal_email, '')) = ?
       OR LOWER(COALESCE(work_email, '')) = ? LIMIT 2`, [recipientEmail, recipientEmail, recipientEmail]);
    if (users.length !== 1) {
      return res.status(400).json({ error: { message: 'Select a recipient with a portal account in Messages by Conversa before sending securely' } });
    }
    // prepareHubSend checks recipient access and channel eligibility for the actor and agency.
    req.body = { agencyId, personKey: `user:${users[0].id}@${agencyId}`, method: 'secure',
      body, clientId: req.body?.clientId || null, subject: String(req.body?.subject || '').trim(), newTopic: true };
    const { postMessagesHubSend } = await import('./messagesHub.controller.js');
    return postMessagesHubSend(req, res, next);
  } catch (e) { next(e); }
}
