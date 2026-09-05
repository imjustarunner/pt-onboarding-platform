import {
  searchHubPeople,
  browseHubPeople,
  resolveHubPerson,
  getHubPersonTimeline,
  prepareHubSend,
  sendHubEmail,
  ensureHubChatThread
} from '../services/messagesHub.service.js';
import { sendMessage as sendChatMessage } from './chat.controller.js';
import { sendMessage as sendSmsMessage } from './message.controller.js';

function parseAgencyId(req) {
  const n = parseInt(String(req.query?.agencyId || req.body?.agencyId || ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * GET /api/messages/hub/people?q=&agencyId=&browse=caseload|recent|suggested&limit=
 * Empty q (or browse=) returns caseload / recent so staff can find people without knowing a name.
 */
export const searchMessagesHubPeople = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
    const q = String(req.query?.q || '').trim();
    const browse = String(req.query?.browse || '').trim().toLowerCase();
    const limit = parseInt(String(req.query?.limit || '30'), 10);

    let results;
    if (q.length >= 2 && !browse) {
      results = await searchHubPeople({
        agencyId,
        userId: req.user.id,
        q,
        limit
      });
      return res.json({ results, browse: null });
    }

    results = await browseHubPeople({
      agencyId,
      userId: req.user.id,
      browse: browse || 'suggested',
      limit
    });
    if (q.length === 1) {
      const needle = q.toLowerCase();
      results = results.filter((p) =>
        `${p.displayName} ${p.relationshipMeta || ''} ${p.email || ''} ${p.phone || ''}`
          .toLowerCase()
          .includes(needle)
      );
    }
    res.json({ results, browse: browse || 'suggested' });
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
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
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
    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
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
 * POST /api/messages/hub/send
 * body: { agencyId, personKey, method, body, subject? }
 */
export const postMessagesHubSend = async (req, res, next) => {
  try {
    const agencyId = parseAgencyId(req);
    const personKey = String(req.body?.personKey || '').trim();
    const method = String(req.body?.method || '').trim().toLowerCase();
    const body = String(req.body?.body || '').trim();
    const subject = String(req.body?.subject || '').trim();

    if (!agencyId) return res.status(400).json({ error: { message: 'agencyId is required' } });
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

    if (method === 'email') {
      const out = await sendHubEmail({
        agencyId,
        userId: req.user.id,
        person,
        body,
        subject
      });
      return res.json({ ok: true, ...out, person });
    }

    if (method === 'sms') {
      if (!person.clientId && !person.contactId) {
        return res.status(400).json({ error: { message: 'SMS requires a client or contact' } });
      }
      // Delegate to existing SMS send handler
      req.body = {
        ...req.body,
        clientId: person.clientId || undefined,
        contactId: person.contactId || undefined,
        body
      };
      const originalJson = res.json.bind(res);
      let captured = null;
      res.json = (payload) => {
        captured = payload;
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

    // secure + internal → chat DM
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
