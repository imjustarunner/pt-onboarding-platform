import {
  searchHubPeople,
  browseHubPeople,
  resolveHubPerson,
  getHubPersonTimeline,
  getHubPersonFiles,
  getHubPersonActivity,
  prepareHubSend,
  sendHubEmail,
  ensureHubChatThread,
  listHubMessageAliases,
  reactToHubMessage,
  getStartConversationDirectory,
  browseHubContacts,
  ensureHubExternalContact,
  lookupHubExternalIdentity,
  sendHubPortalInvitation
} from '../services/messagesHub.service.js';
import { generateHubSmartReply } from '../services/hubSmartReply.service.js';
import {
  enqueueHubMessage,
  listHubQueuedMessages,
  cancelHubQueuedMessage,
  listDueHubQueue,
  markHubQueueSent,
  markHubQueueFailed,
  clampSendDelaySeconds,
  DEFAULT_DELAY_SECONDS
} from '../services/hubMessageQueue.service.js';
import { getCommunicationPrefs } from '../services/inboxDigest.service.js';
import { sendMessage as sendChatMessage } from './chat.controller.js';
import { sendMessage as sendSmsMessage } from './message.controller.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';
import CommunicationConversation from '../models/CommunicationConversation.model.js';

function parseAgencyId(req) {
  const n = parseInt(String(req.query?.agencyId || req.body?.agencyId || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function wantsAllAgencies(req) {
  const raw = String(req.query?.allAgencies ?? req.body?.allAgencies ?? 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'no';
}

const PROVIDER_ROLES = new Set(['provider', 'provider_plus', 'intern', 'clinical_practice_assistant']);

/**
 * Expand hub agency scope for providers: assigned school orgs + parent agencies.
 * Does not change global User.getAgencies inheritance.
 */
async function expandProviderHubAgencyIds(userId, baseIds = []) {
  const out = new Set((baseIds || []).map(Number).filter((n) => n > 0));
  if (!userId) return [...out];

  try {
    const [psa] = await pool.execute(
      `SELECT DISTINCT school_organization_id AS org_id
       FROM provider_school_assignments
       WHERE provider_user_id = ?
         AND school_organization_id IS NOT NULL
         AND (is_active = 1 OR is_active IS NULL OR is_active = TRUE)`,
      [userId]
    );
    for (const r of psa || []) {
      const id = Number(r.org_id);
      if (id > 0) out.add(id);
    }
  } catch {
    /* table/column variants */
  }

  try {
    const [caseloadSchools] = await pool.execute(
      `SELECT DISTINCT c.agency_id AS org_id
       FROM clients c
       WHERE c.agency_id IS NOT NULL
         AND (
           c.provider_id = ?
           OR EXISTS (
             SELECT 1 FROM client_provider_assignments cpa
             WHERE cpa.client_id = c.id
               AND cpa.provider_user_id = ?
               AND (cpa.is_active = 1 OR cpa.is_active IS TRUE)
           )
         )`,
      [userId, userId]
    );
    for (const r of caseloadSchools || []) {
      const id = Number(r.org_id);
      if (id > 0) out.add(id);
    }
  } catch {
    /* ignore */
  }

  const seedIds = [...out];
  if (!seedIds.length) return [];

  const ph = seedIds.map(() => '?').join(',');
  try {
    const [aff] = await pool.execute(
      `SELECT DISTINCT agency_id
       FROM organization_affiliations
       WHERE organization_id IN (${ph})
         AND agency_id IS NOT NULL
         AND (is_active = 1 OR is_active IS NULL OR is_active = TRUE)`,
      seedIds
    );
    for (const r of aff || []) {
      const id = Number(r.agency_id);
      if (id > 0) out.add(id);
    }
  } catch {
    try {
      const [aff] = await pool.execute(
        `SELECT DISTINCT active_agency_id AS agency_id
         FROM organization_affiliations
         WHERE organization_id IN (${ph})
           AND active_agency_id IS NOT NULL`,
        seedIds
      );
      for (const r of aff || []) {
        const id = Number(r.agency_id);
        if (id > 0) out.add(id);
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const [schools] = await pool.execute(
      `SELECT DISTINCT agency_id
       FROM agency_schools
       WHERE school_organization_id IN (${ph})
         AND agency_id IS NOT NULL
         AND (is_active = 1 OR is_active IS NULL OR is_active = TRUE)`,
      seedIds
    );
    for (const r of schools || []) {
      const id = Number(r.agency_id);
      if (id > 0) out.add(id);
    }
  } catch {
    /* ignore */
  }

  return [...out];
}

/**
 * Agencies the viewer can message across. Defaults to all memberships so
 * multi-tenant staff see every DM in one hub, labeled by agency.
 */
async function resolveHubAgencyIds(req) {
  const preferred = parseAgencyId(req);
  const memberships = await User.getAgencies(req.user.id);
  const memberIds = (memberships || []).map((a) => Number(a.id)).filter((n) => n > 0);
  const role = String(req.user?.role || '').toLowerCase();

  let ids;
  if (!wantsAllAgencies(req)) {
    if (preferred && memberIds.includes(preferred)) ids = [preferred];
    else if (preferred && role === 'super_admin') ids = [preferred];
    else ids = preferred ? [preferred] : memberIds.slice(0, 1);
  } else if (memberIds.length) {
    if (preferred && memberIds.includes(preferred)) {
      ids = [preferred, ...memberIds.filter((id) => id !== preferred)];
    } else {
      ids = memberIds;
    }
  } else {
    ids = preferred ? [preferred] : [];
  }

  if (PROVIDER_ROLES.has(role)) {
    const expanded = await expandProviderHubAgencyIds(req.user.id, ids);
    if (preferred && expanded.includes(preferred)) {
      return [preferred, ...expanded.filter((id) => id !== preferred)];
    }
    return expanded.length ? expanded : ids;
  }

  return ids;
}

/**
 * GET /api/messages/hub/people?q=&agencyId=&browse=&allAgencies=&limit=
 */
export const searchMessagesHubPeople = async (req, res, next) => {
  try {
    const agencyIds = await resolveHubAgencyIds(req);
    if (!agencyIds.length) {
      return res.status(400).json({ error: { message: 'agencyId is required (or join an agency)' } });
    }
    const q = String(req.query?.q || '').trim();
    const browse = String(req.query?.browse || '').trim().toLowerCase();
    const limit = parseInt(String(req.query?.limit || '40'), 10);
    const primaryAgencyId = agencyIds[0];
    const directoryBrowse = ['staff', 'school_staff', 'guardians'].includes(browse);

    let results;
    // Directory browse modes support optional q (search within kind).
    if (directoryBrowse) {
      results = await browseHubPeople({
        agencyId: primaryAgencyId,
        agencyIds,
        userId: req.user.id,
        browse,
        limit,
        q,
        viewerRole: req.user.role
      });
      return res.json({
        results,
        browse,
        agencyIds,
        allAgencies: agencyIds.length > 1
      });
    }

    if (q.length >= 2 && !browse) {
      results = await searchHubPeople({
        agencyId: primaryAgencyId,
        agencyIds,
        userId: req.user.id,
        q,
        limit
      });
      return res.json({ results, browse: null, agencyIds, allAgencies: agencyIds.length > 1 });
    }

    results = await browseHubPeople({
      agencyId: primaryAgencyId,
      agencyIds,
      userId: req.user.id,
      browse: browse || 'suggested',
      limit,
      q,
      viewerRole: req.user.role
    });
    if (q.length === 1) {
      const needle = q.toLowerCase();
      results = results.filter((p) =>
        `${p.displayName} ${p.relationshipMeta || ''} ${p.agencyName || ''} ${p.email || ''} ${p.phone || ''}`
          .toLowerCase()
          .includes(needle)
      );
    }
    res.json({
      results,
      browse: browse || 'suggested',
      agencyIds,
      allAgencies: agencyIds.length > 1
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/messages/hub/people/:personKey
 */
export const getMessagesHubPerson = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const personKey = decodeURIComponent(String(req.params.personKey || ''));
    const person = await resolveHubPerson({
      agencyId,
      userId: req.user.id,
      personKey
    });
    if (!person) return res.status(404).json({ error: { message: 'Person not found' } });
    res.json({ person });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/messages/hub/people/:personKey/timeline?agencyId=
 */
export const getMessagesHubTimeline = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const personKey = decodeURIComponent(String(req.params.personKey || ''));
    const data = await getHubPersonTimeline({
      agencyId,
      userId: req.user.id,
      personKey
    });
    if (!data.person) return res.status(404).json({ error: { message: 'Person not found' } });
    res.json(data);
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/messages/hub/people/:personKey/files?agencyId=
 */
export const getMessagesHubPersonFiles = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const personKey = decodeURIComponent(String(req.params.personKey || ''));
    const data = await getHubPersonFiles({
      agencyId,
      userId: req.user.id,
      personKey,
      limit: req.query?.limit
    });
    if (!data.person) return res.status(404).json({ error: { message: 'Person not found' } });
    res.json(data);
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/messages/hub/people/:personKey/activity?agencyId=
 */
export const getMessagesHubPersonActivity = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const personKey = decodeURIComponent(String(req.params.personKey || ''));
    const data = await getHubPersonActivity({
      agencyId,
      userId: req.user.id,
      personKey,
      limit: req.query?.limit
    });
    if (!data.person) return res.status(404).json({ error: { message: 'Person not found' } });
    res.json(data);
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/messages/hub/aliases?agencyId=
 */
export const getMessagesHubAliases = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const aliases = await listHubMessageAliases({ agencyId });
    res.json({ aliases });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/**
 * GET /api/messages/hub/signature-preview?agencyId=
 * Live staff HTML signature for the logged-in sender (Hub compose).
 */
export const getMessagesHubSignaturePreview = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const { getStaffSignaturePreview } = await import('../services/staffHtmlEmailSignature.service.js');
    const preview = await getStaffSignaturePreview({
      userId: req.user.id,
      agencyId
    });
    res.json({ ok: true, ...(preview || { eligible: false, enabled: false, html: null }) });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/**
 * POST /api/messages/hub/react
 * body: { agencyId, conversationId, messageId?, emoji? }
 */
export const postMessagesHubReact = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const conversationId = Number(req.body?.conversationId);
    const messageId = req.body?.messageId != null ? Number(req.body.messageId) : null;
    const emoji = String(req.body?.emoji || '❤️').slice(0, 32);
    if (!conversationId) {
      return res.status(400).json({ error: { message: 'conversationId is required' } });
    }
    const out = await reactToHubMessage({
      agencyId,
      userId: req.user.id,
      conversationId,
      messageId,
      emoji,
      notifyEmail: req.body?.notifyEmail !== false
    });
    res.json(out);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/**
 * POST /api/messages/hub/ensure-thread
 * body: { agencyId, personKey }
 * Ensures a direct chat thread exists for secure/internal messaging (needed before attachments).
 */
export const postMessagesHubEnsureThread = async (req, res, next) => {
  try {
    let agencyId = parseAgencyId(req);
    const personKey = String(req.body?.personKey || '').trim();
    if (!personKey) return res.status(400).json({ error: { message: 'personKey is required' } });

    const person = await prepareHubSend({
      agencyId,
      userId: req.user.id,
      personKey,
      method: 'internal'
    });
    agencyId = person.agencyId || agencyId;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    if (!person.userId) {
      return res.status(400).json({
        error: { message: 'Secure/internal messaging requires a user account on the recipient' }
      });
    }
    const threadId = await ensureHubChatThread({
      agencyId,
      userId: req.user.id,
      otherUserId: person.userId
    });
    return res.json({ ok: true, threadId, person });
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

/**
 * POST /api/messages/hub/send
 * body: { agencyId, personKey, method, body, subject?, cc?, bcc?, attachments?, fromAliasIdentityId? }
 */
export const postMessagesHubSend = async (req, res, next) => {
  try {
    let agencyId = parseAgencyId(req);
    const personKey = String(req.body?.personKey || '').trim();
    const method = String(req.body?.method || '').trim().toLowerCase();
    const bodyHtmlRaw = String(req.body?.bodyHtml || '').trim();
    const body =
      String(req.body?.body || '').trim() ||
      (bodyHtmlRaw ? bodyHtmlRaw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '');
    const subject = String(req.body?.subject || '').trim();
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

    if (!personKey) return res.status(400).json({ error: { message: 'personKey is required' } });
    if (!['secure', 'sms', 'email', 'internal'].includes(method)) {
      return res.status(400).json({ error: { message: 'method must be secure, sms, email, or internal' } });
    }
    if ((method === 'secure' || method === 'internal') && !body && !attachments.length) {
      return res.status(400).json({ error: { message: 'body or attachments required' } });
    }
    if (method === 'email' && !body && !bodyHtmlRaw) {
      return res.status(400).json({ error: { message: 'body is required' } });
    }
    if (method === 'sms' && !body) {
      return res.status(400).json({ error: { message: 'body is required' } });
    }

    const person = await prepareHubSend({
      agencyId,
      userId: req.user.id,
      personKey,
      method
    });
    agencyId = person.agencyId || agencyId;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    // Per-channel undo delay / schedule → queue (email keeps communication_messages path)
    const prefs = await getCommunicationPrefs(req.user.id).catch(() => null);
    const delayKey =
      method === 'email'
        ? 'sendDelayEmailSeconds'
        : method === 'secure'
          ? 'sendDelaySecureSeconds'
          : method === 'internal'
            ? 'sendDelayInternalSeconds'
            : 'sendDelaySmsSeconds';
    const prefDelay = prefs?.[delayKey] ?? DEFAULT_DELAY_SECONDS;
    const explicitDelay =
      req.body?.undoDelaySeconds != null ? clampSendDelaySeconds(req.body.undoDelaySeconds) : null;
    const schedulePreset = String(req.body?.schedulePreset || '').toLowerCase();
    const hasSchedule =
      !!req.body?.scheduledSendAt ||
      (!!schedulePreset && schedulePreset !== 'null') ||
      req.body?.sendDuringNextAvailable === true;

    if (method === 'email') {
      const out = await sendHubEmail({
        agencyId,
        userId: req.user.id,
        person,
        body,
        bodyHtml: bodyHtmlRaw || null,
        subject,
        cc: req.body?.cc ?? null,
        bcc: req.body?.bcc ?? null,
        attachments: attachments.length ? attachments : null,
        fromAliasIdentityId: req.body?.fromAliasIdentityId || null,
        schedulePreset: req.body?.schedulePreset || null,
        scheduledSendAt: req.body?.scheduledSendAt || null,
        undoDelaySeconds:
          explicitDelay != null ? explicitDelay : hasSchedule ? null : prefDelay,
        sendDuringNextAvailable: !!(
          req.body?.sendDuringNextAvailable === true ||
          req.body?.sendDuringNextAvailable === 1 ||
          req.body?.sendDuringNextAvailable === '1' ||
          schedulePreset === 'next_available'
        )
      });
      return res.json({ ok: true, ...out, person });
    }

    // Queue delayed secure / internal / SMS (unless skipUndo)
    const skipUndo = req.body?.skipUndo === true || req.body?.skipUndo === 1;
    if (!skipUndo && (hasSchedule || (explicitDelay ?? prefDelay) > 0)) {
      let when = null;
      let reason = 'undo_delay';
      if (req.body?.scheduledSendAt) {
        when = new Date(req.body.scheduledSendAt);
        reason = 'schedule';
      } else if (schedulePreset === 'in_1_hour') {
        when = new Date(Date.now() + 60 * 60 * 1000);
        reason = 'schedule';
      } else if (schedulePreset === 'tomorrow_9am' || schedulePreset === 'monday_9am') {
        // Reuse email schedule helper if available
        try {
          const { resolveScheduleAt } = await import('../services/unifiedInbox.service.js');
          when = resolveScheduleAt({ schedulePreset }) || new Date(Date.now() + 60 * 60 * 1000);
          reason = 'schedule';
        } catch {
          when = new Date(Date.now() + 60 * 60 * 1000);
          reason = 'schedule';
        }
      } else if (
        schedulePreset === 'next_available' ||
        req.body?.sendDuringNextAvailable === true
      ) {
        const gate = person.senderGate;
        when = gate?.sendAt ? new Date(gate.sendAt) : new Date(Date.now() + 60 * 60 * 1000);
        reason = 'availability';
      } else {
        const secs = explicitDelay != null ? explicitDelay : prefDelay;
        when = new Date(Date.now() + secs * 1000);
        reason = 'undo_delay';
      }
      if (when && !Number.isNaN(when.getTime()) && when.getTime() > Date.now() + 500) {
        const queued = await enqueueHubMessage({
          agencyId,
          userId: req.user.id,
          personKey,
          channel: method,
          body,
          subject: subject || null,
          payload: {
            attachments: attachments.length ? attachments : null,
            cc: req.body?.cc || null,
            bcc: req.body?.bcc || null
          },
          scheduledSendAt: when,
          queueReason: reason
        });
        return res.json({
          ok: true,
          queued: true,
          scheduled: true,
          queueId: queued.id,
          scheduledSendAt: queued.scheduled_send_at,
          undoExpiresAt: queued.scheduled_send_at,
          queueReason: reason,
          channel: method,
          person,
          threadRef: { queueId: queued.id }
        });
      }
    }

    if (method === 'sms') {
      if (!person.clientId && !person.contactId) {
        return res.status(400).json({ error: { message: 'SMS requires a client or contact' } });
      }
      req.body = {
        ...req.body,
        clientId: person.clientId || undefined,
        contactId: person.contactId || undefined,
        body
      };
      const originalJson = res.json.bind(res);
      res.json = (payload) => {
        if (payload?.error || (res.statusCode && res.statusCode >= 400)) {
          return originalJson(payload);
        }
        return originalJson({
          ok: true,
          channel: 'sms',
          threadRef: {
            clientId: person.clientId || null,
            contactId: person.contactId || null
          },
          person,
          sms: payload
        });
      };
      return sendSmsMessage(req, res, next);
    }

    if (!person.userId) {
      return res.status(400).json({
        error: { message: 'Secure/internal messaging requires a user account on the recipient' }
      });
    }
    const threadId = await ensureHubChatThread({
      agencyId,
      userId: req.user.id,
      otherUserId: person.userId
    });
    req.params = { ...(req.params || {}), threadId: String(threadId) };
    // Chat attachments use filePath from prior upload; strip email-style base64 payloads.
    const chatAttachments = attachments
      .map((a) => {
        if (!a || typeof a !== 'object') return null;
        if (a.filePath || a.file_path) return a;
        return null;
      })
      .filter(Boolean);
    req.body = { ...req.body, body, attachments: chatAttachments };

    const originalJson = res.json.bind(res);
    res.json = (payload) => {
      // Do not wrap error responses as ok:true — that clears the composer and hides the failure.
      if (payload?.error || (res.statusCode && res.statusCode >= 400)) {
        return originalJson(payload);
      }
      return originalJson({
        ok: true,
        channel: method,
        threadRef: { threadId },
        person,
        chat: payload
      });
    };
    return sendChatMessage(req, res, next);
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

/**
 * GET /api/messages/hub/start-directory?agencyId=&q=
 */
export const getMessagesHubStartDirectory = async (req, res, next) => {
  try {
    const agencyIds = await resolveHubAgencyIds(req);
    if (!agencyIds.length) {
      return res.status(400).json({ error: { message: 'agencyId is required (or join an agency)' } });
    }
    const q = String(req.query?.q || '').trim();
    const directory = await getStartConversationDirectory({
      agencyId: agencyIds[0],
      agencyIds,
      userId: req.user.id,
      viewerRole: req.user.role,
      q,
      perSection: parseInt(String(req.query?.perSection || '3'), 10) || 3,
      recentLimit: parseInt(String(req.query?.recentLimit || '6'), 10) || 6
    });
    res.json(directory);
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/messages/hub/contacts?agencyId=&q=
 */
export const getMessagesHubContacts = async (req, res, next) => {
  try {
    const agencyIds = await resolveHubAgencyIds(req);
    if (!agencyIds.length) {
      return res.status(400).json({ error: { message: 'agencyId is required (or join an agency)' } });
    }
    const q = String(req.query?.q || '').trim();
    const results = await browseHubContacts({
      agencyId: agencyIds[0],
      agencyIds,
      userId: req.user.id,
      viewerRole: req.user.role,
      q,
      limit: parseInt(String(req.query?.limit || '50'), 10) || 50
    });
    res.json({ results, browse: 'contacts' });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/messages/hub/external-lookup?email=&phone=&agencyId=
 */
export const getMessagesHubExternalLookup = async (req, res, next) => {
  try {
    const agencyIds = await resolveHubAgencyIds(req);
    if (!agencyIds.length) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    const result = await lookupHubExternalIdentity({
      agencyId: agencyIds[0],
      agencyIds,
      userId: req.user.id,
      email: req.query?.email || null,
      phone: req.query?.phone || null
    });
    res.json(result);
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/messages/hub/external-contact
 * Body: { agencyId, channel, email?, phone?, fullName?, clientId?, relationshipType?, linkUserId?, existingContactId? }
 */
export const postMessagesHubExternalContact = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req) || (await resolveHubAgencyIds(req))[0];
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    const out = await ensureHubExternalContact({
      agencyId,
      userId: req.user.id,
      role: req.user.role,
      channel: req.body?.channel,
      email: req.body?.email,
      phone: req.body?.phone,
      fullName: req.body?.fullName,
      clientId: req.body?.clientId,
      relationshipType: req.body?.relationshipType,
      linkUserId: req.body?.linkUserId,
      existingContactId: req.body?.existingContactId
    });
    res.status(out.created ? 201 : 200).json(out);
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

/**
 * POST /api/messages/hub/portal-invite
 * Body: { agencyId, personKey?, clientId?, guardianUserId? }
 */
export const postMessagesHubPortalInvite = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req) || (await resolveHubAgencyIds(req))[0];
    if (!agencyId) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    const out = await sendHubPortalInvitation({
      agencyId,
      actorUserId: req.user.id,
      personKey: req.body?.personKey || null,
      clientId: req.body?.clientId || null,
      guardianUserId: req.body?.guardianUserId || req.body?.userId || null
    });
    res.json(out);
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};

/**
 * GET /api/messages/hub/smart-reply?agencyId=&personKey=&channel=
 */
export const getMessagesHubSmartReply = async (req, res, next) => {
  try {
    const agencyIds = await resolveHubAgencyIds(req);
    if (!agencyIds.length) {
      return res.status(400).json({ error: { message: 'agencyId is required' } });
    }
    const personKey = String(req.query?.personKey || '').trim();
    if (!personKey) return res.status(400).json({ error: { message: 'personKey is required' } });
    const channel = String(req.query?.channel || req.query?.method || 'secure').toLowerCase();
    const { person, items } = await getHubPersonTimeline({
      agencyId: agencyIds[0],
      userId: req.user.id,
      personKey,
      limit: 16
    });
    if (!person) return res.status(404).json({ error: { message: 'Person not found' } });
    const recent = Array.isArray(items) ? items : [];
    const last = recent.length ? recent[recent.length - 1] : null;
    // Only suggest replies to the other person's latest message — not after our own send,
    // and not on an empty / brand-new thread.
    if (!last || String(last.direction || '').toLowerCase() !== 'inbound') {
      return res.json({ suggestion: null, personKey, channel, reason: 'awaiting_inbound' });
    }
    const suggestion = await generateHubSmartReply({
      channel,
      personName: person.displayName,
      recentMessages: recent
    });
    res.json({ suggestion: suggestion || null, personKey, channel });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/messages/hub/queued?agencyId=
 * Combines hub_message_queue + scheduled email messages for this user.
 */
export const getMessagesHubQueued = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const hubRows = await listHubQueuedMessages({
      userId: req.user.id,
      agencyId: agencyId || null,
      limit: 60
    });
    const items = (hubRows || []).map((r) => ({
      id: `hubq-${r.id}`,
      queueId: Number(r.id),
      source: 'hub_queue',
      channel: r.channel,
      personKey: r.person_key,
      bodyPreview: String(r.body || '').slice(0, 200),
      subject: r.subject || null,
      scheduledSendAt: r.scheduled_send_at,
      queueReason: r.queue_reason,
      agencyId: r.agency_id
    }));

    // Scheduled / undo-delayed emails authored by this user
    try {
      const params = [req.user.id];
      let agencyClause = '';
      if (agencyId) {
        agencyClause = 'AND c.agency_id = ?';
        params.push(agencyId);
      }
      const [emailRows] = await pool.execute(
        `SELECT m.id AS message_id, m.conversation_id, m.body_text, m.subject,
                m.scheduled_send_at, m.undo_expires_at, c.agency_id, c.channel
         FROM communication_messages m
         JOIN communication_conversations c ON c.id = m.conversation_id
         WHERE m.author_user_id = ?
           AND m.direction = 'outbound'
           AND m.send_status = 'scheduled'
           AND COALESCE(m.is_internal_note, 0) = 0
           ${agencyClause}
         ORDER BY COALESCE(m.scheduled_send_at, m.created_at) ASC
         LIMIT 60`,
        params
      );
      for (const r of emailRows || []) {
        items.push({
          id: `email-${r.message_id}`,
          source: 'email',
          channel: 'email',
          conversationId: Number(r.conversation_id),
          messageId: Number(r.message_id),
          bodyPreview: String(r.body_text || '').slice(0, 200),
          subject: r.subject || null,
          scheduledSendAt: r.scheduled_send_at || r.undo_expires_at,
          queueReason:
            r.undo_expires_at &&
            r.scheduled_send_at &&
            Math.abs(new Date(r.scheduled_send_at) - new Date(r.undo_expires_at)) < 2000
              ? 'undo_delay'
              : 'schedule',
          agencyId: r.agency_id
        });
      }
    } catch (e) {
      console.warn('[getMessagesHubQueued] email:', e?.message || e);
    }

    items.sort(
      (a, b) =>
        new Date(a.scheduledSendAt || 0).getTime() - new Date(b.scheduledSendAt || 0).getTime()
    );
    res.json({ items });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/messages/hub/queued/:id/undo
 * Cancels hub queue item OR email scheduled message; returns body for composer restore.
 */
export const postMessagesHubQueuedUndo = async (req, res, next) => {
  try {
    const rawId = String(req.params?.id || '');
    if (rawId.startsWith('hubq-') || /^\d+$/.test(rawId)) {
      const queueId = Number(String(rawId).replace(/^hubq-/, ''));
      const out = await cancelHubQueuedMessage({ id: queueId, userId: req.user.id });
      return res.json({ ok: true, ...out });
    }
    if (rawId.startsWith('email-') || req.body?.conversationId) {
      const messageId = Number(String(rawId).replace(/^email-/, '') || req.body?.messageId);
      const conversationId = Number(req.body?.conversationId || 0);
      if (!messageId || !conversationId) {
        return res.status(400).json({ error: { message: 'conversationId and messageId required' } });
      }
      const { undoOutboundMessage } = await import('../services/unifiedInbox.service.js');
      const out = await undoOutboundMessage(conversationId, messageId, { userId: req.user.id });
      return res.json({ ok: true, ...out, channel: 'email' });
    }
    return res.status(400).json({ error: { message: 'Unknown queued item id' } });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

/**
 * Worker: deliver due hub_message_queue rows (secure/internal/sms).
 */
export async function processHubMessageQueue({ limit = 40 } = {}) {
  const due = await listDueHubQueue({ limit });
  let sent = 0;
  let failed = 0;

  const runWithMockRes = (handler, reqLike) =>
    new Promise((resolve, reject) => {
      const res = {
        statusCode: 200,
        payload: null,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(payload) {
          this.payload = payload;
          if (this.statusCode >= 400 || payload?.error) {
            reject(new Error(payload?.error?.message || `HTTP ${this.statusCode}`));
          } else {
            resolve(payload);
          }
          return this;
        }
      };
      Promise.resolve(handler(reqLike, res, (err) => (err ? reject(err) : resolve(res.payload)))).catch(
        reject
      );
    });

  for (const row of due) {
    try {
      const payload =
        row.payload_json && typeof row.payload_json === 'string'
          ? JSON.parse(row.payload_json)
          : row.payload_json || {};
      const person = await prepareHubSend({
        agencyId: row.agency_id,
        userId: row.user_id,
        personKey: row.person_key,
        method: row.channel
      });
      const user = await User.findById(row.user_id);
      if (!user) throw new Error('Sender user not found');

      if (row.channel === 'sms') {
        await runWithMockRes(sendSmsMessage, {
          user,
          body: {
            clientId: person.clientId || undefined,
            contactId: person.contactId || undefined,
            body: row.body
          }
        });
      } else if (row.channel === 'secure' || row.channel === 'internal') {
        if (!person.userId) throw new Error('Recipient has no user account');
        const threadId = await ensureHubChatThread({
          agencyId: row.agency_id,
          userId: row.user_id,
          otherUserId: person.userId
        });
        const chatAttachments = Array.isArray(payload.attachments)
          ? payload.attachments.filter((a) => a && (a.filePath || a.file_path))
          : [];
        await runWithMockRes(sendChatMessage, {
          user,
          params: { threadId: String(threadId) },
          body: { body: row.body || '', attachments: chatAttachments }
        });
      } else {
        throw new Error(`Unsupported queue channel: ${row.channel}`);
      }
      await markHubQueueSent(row.id);
      sent += 1;
    } catch (e) {
      console.warn('[processHubMessageQueue]', row.id, e?.message || e);
      await markHubQueueFailed(row.id, e?.message || 'send failed').catch(() => {});
      failed += 1;
    }
  }
  return { sent, failed, checked: due.length };
}
