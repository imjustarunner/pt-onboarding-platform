import {
  searchHubPeople,
  browseHubPeople,
  resolveHubPerson,
  getHubPersonTimeline,
  prepareHubSend,
  sendHubEmail,
  ensureHubChatThread,
  listHubMessageAliases,
  reactToHubMessage
} from '../services/messagesHub.service.js';
import { sendMessage as sendChatMessage } from './chat.controller.js';
import { sendMessage as sendSmsMessage } from './message.controller.js';
import User from '../models/User.model.js';

function parseAgencyId(req) {
  const n = parseInt(String(req.query?.agencyId || req.body?.agencyId || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function wantsAllAgencies(req) {
  const raw = String(req.query?.allAgencies ?? req.body?.allAgencies ?? 'true').toLowerCase();
  return raw !== '0' && raw !== 'false' && raw !== 'no';
}

/**
 * Agencies the viewer can message across. Defaults to all memberships so
 * multi-tenant staff see every DM in one hub, labeled by agency.
 */
async function resolveHubAgencyIds(req) {
  const preferred = parseAgencyId(req);
  const memberships = await User.getAgencies(req.user.id);
  const memberIds = (memberships || []).map((a) => Number(a.id)).filter((n) => n > 0);

  if (!wantsAllAgencies(req)) {
    if (preferred && memberIds.includes(preferred)) return [preferred];
    if (preferred && String(req.user?.role || '').toLowerCase() === 'super_admin') return [preferred];
    return preferred ? [preferred] : memberIds.slice(0, 1);
  }

  if (memberIds.length) {
    if (preferred && memberIds.includes(preferred)) {
      return [preferred, ...memberIds.filter((id) => id !== preferred)];
    }
    return memberIds;
  }
  return preferred ? [preferred] : [];
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

    let results;
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
      limit
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
 * POST /api/messages/hub/send
 * body: { agencyId, personKey, method, body, subject?, cc?, bcc?, attachments?, fromAliasIdentityId? }
 */
export const postMessagesHubSend = async (req, res, next) => {
  try {
    let agencyId = parseAgencyId(req);
    const personKey = String(req.body?.personKey || '').trim();
    const method = String(req.body?.method || '').trim().toLowerCase();
    const body = String(req.body?.body || '').trim();
    const subject = String(req.body?.subject || '').trim();

    if (!personKey) return res.status(400).json({ error: { message: 'personKey is required' } });
    if (!['secure', 'sms', 'email', 'internal'].includes(method)) {
      return res.status(400).json({ error: { message: 'method must be secure, sms, email, or internal' } });
    }
    if (!body) return res.status(400).json({ error: { message: 'body is required' } });

    const person = await prepareHubSend({
      agencyId,
      userId: req.user.id,
      personKey,
      method
    });
    agencyId = person.agencyId || agencyId;
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });

    if (method === 'email') {
      const out = await sendHubEmail({
        agencyId,
        userId: req.user.id,
        person,
        body,
        subject,
        cc: req.body?.cc ?? null,
        bcc: req.body?.bcc ?? null,
        attachments: Array.isArray(req.body?.attachments) ? req.body.attachments : null,
        fromAliasIdentityId: req.body?.fromAliasIdentityId || null,
        schedulePreset: req.body?.schedulePreset || null,
        scheduledSendAt: req.body?.scheduledSendAt || null,
        undoDelaySeconds:
          req.body?.undoDelaySeconds != null ? req.body.undoDelaySeconds : null
      });
      return res.json({ ok: true, ...out, person });
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
      res.json = (payload) =>
        originalJson({
          ok: true,
          channel: 'sms',
          threadRef: {
            clientId: person.clientId || null,
            contactId: person.contactId || null
          },
          person,
          sms: payload
        });
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
    req.body = { ...req.body, body };

    const originalJson = res.json.bind(res);
    res.json = (payload) =>
      originalJson({
        ok: true,
        channel: method,
        threadRef: { threadId },
        person,
        chat: payload
      });
    return sendChatMessage(req, res, next);
  } catch (e) {
    if (e?.status) {
      return res.status(e.status).json({ error: { message: e.message } });
    }
    next(e);
  }
};
