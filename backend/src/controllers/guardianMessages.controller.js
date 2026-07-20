import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import {
  findOrCreateDirectThread,
  listMessages as listChatMessages,
  sendMessage as sendChatMessage
} from './chat.controller.js';
import { isChatEncryptionConfigured } from '../services/chatEncryption.service.js';

async function resolveAssignedProvider(clientId, organizationId) {
  const cid = Number(clientId);
  const oid = Number(organizationId);
  if (!cid) return null;
  try {
    const [rows] = await pool.execute(
      `SELECT cpa.provider_user_id AS id, u.first_name, u.last_name, u.email, u.role
       FROM client_provider_assignments cpa
       INNER JOIN users u ON u.id = cpa.provider_user_id
       WHERE cpa.client_id = ?
         AND cpa.is_active = TRUE
         ${oid ? 'AND cpa.organization_id = ?' : ''}
       ORDER BY cpa.id ASC
       LIMIT 1`,
      oid ? [cid, oid] : [cid]
    );
    if (rows?.[0]) return rows[0];
  } catch {
    // table may vary
  }
  try {
    const [rows] = await pool.execute(
      `SELECT c.provider_id AS id, u.first_name, u.last_name, u.email, u.role
       FROM clients c
       INNER JOIN users u ON u.id = c.provider_id
       WHERE c.id = ? AND c.provider_id IS NOT NULL
       LIMIT 1`,
      [cid]
    );
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

async function assertGuardianClientAccess(guardianUserId, clientId) {
  const clients = await ClientGuardian.listClientsForGuardian({ guardianUserId });
  return (clients || []).find((c) => Number(c.client_id) === Number(clientId)) || null;
}

async function hasThreadAccess(userId, threadId) {
  const [rows] = await pool.execute(
    `SELECT 1 FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? LIMIT 1`,
    [threadId, userId]
  );
  return (rows || []).length > 0;
}

/**
 * GET /api/guardian-portal/sms-audit
 * Encrypted SMS history for the guardian (self + linked clients). Decrypt-on-authorize.
 */
export const listGuardianSmsAudit = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Unauthorized' } });

    const clientIdRaw = parseInt(String(req.query?.clientId || ''), 10);
    const clientId = Number.isFinite(clientIdRaw) ? clientIdRaw : null;
    if (clientId) {
      const link = await assertGuardianClientAccess(userId, clientId);
      if (!link && !req.guardianPreviewMode) {
        return res.status(403).json({ error: { message: 'No access to this client' } });
      }
    }

    const limitRaw = parseInt(String(req.query?.limit || ''), 10);
    const offsetRaw = parseInt(String(req.query?.offset || ''), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const SmsProfileAudit = (await import('../models/SmsProfileAudit.model.js')).default;
    const items = await SmsProfileAudit.listForUser(userId, { clientId, limit, offset });
    res.json({ items });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/guardian-portal/messages
 * List guardian↔provider conversations for each linked child.
 */
export const listGuardianMessageThreads = async (req, res, next) => {
  try {
    if (req.guardianPreviewMode) {
      return res.json({ threads: [] });
    }
    const clients = await ClientGuardian.listClientsForGuardian({ guardianUserId: req.user.id });
    const threads = [];
    for (const c of clients || []) {
      const provider = await resolveAssignedProvider(c.client_id, c.organization_id);
      if (!provider?.id) {
        threads.push({
          client_id: c.client_id,
          client_label: c.full_name || c.initials || `Child #${c.client_id}`,
          organization_name: c.organization_name,
          agency_id: c.agency_id,
          organization_id: c.organization_id,
          provider: null,
          thread_id: null,
          available: false
        });
        continue;
      }
      let threadId = null;
      try {
        threadId = await findOrCreateDirectThread(
          c.agency_id,
          c.organization_id || null,
          req.user.id,
          provider.id
        );
      } catch {
        threadId = null;
      }
      threads.push({
        client_id: c.client_id,
        client_label: c.full_name || c.initials || `Child #${c.client_id}`,
        organization_name: c.organization_name,
        agency_id: c.agency_id,
        organization_id: c.organization_id,
        provider: {
          id: provider.id,
          first_name: provider.first_name,
          last_name: provider.last_name,
          email: provider.email
        },
        thread_id: threadId,
        available: !!threadId
      });
    }
    res.json({ threads });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/guardian-portal/messages/:threadId
 * Reuse chat listMessages by forging params (same auth via participant check).
 */
export const listGuardianThreadMessages = async (req, res, next) => {
  try {
    if (req.guardianPreviewMode) {
      return res.json({ messages: [] });
    }
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'Invalid thread id' } });
    if (!(await hasThreadAccess(req.user.id, threadId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    // Delegate to chat listMessages
    req.params.threadId = String(threadId);
    return listChatMessages(req, res, next);
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/guardian-portal/messages/:threadId
 */
export const sendGuardianThreadMessage = async (req, res, next) => {
  try {
    if (req.guardianPreviewMode) {
      return res.status(403).json({ error: { message: 'Preview cannot send messages' } });
    }
    const threadId = parseInt(req.params.threadId, 10);
    if (!threadId) return res.status(400).json({ error: { message: 'Invalid thread id' } });
    if (!(await hasThreadAccess(req.user.id, threadId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && !isChatEncryptionConfigured()) {
      return res.status(503).json({
        error: { message: 'Message encryption is required. Configure CLIENT_CHAT_ENCRYPTION_KEY_BASE64.' }
      });
    }
    req.params.threadId = String(threadId);
    return sendChatMessage(req, res, next);
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/guardian-portal/messages/open
 * body: { clientId }
 * Ensure guardian can message assigned provider; return thread.
 */
export const openGuardianClientThread = async (req, res, next) => {
  try {
    if (req.guardianPreviewMode) {
      return res.status(403).json({ error: { message: 'Preview cannot open messages' } });
    }
    const clientId = parseInt(req.body?.clientId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });
    const client = await assertGuardianClientAccess(req.user.id, clientId);
    if (!client) return res.status(403).json({ error: { message: 'Access denied to this child' } });

    const provider = await resolveAssignedProvider(clientId, client.organization_id);
    if (!provider?.id) {
      return res.status(404).json({ error: { message: 'No assigned provider for this child yet' } });
    }

    const threadId = await findOrCreateDirectThread(
      client.agency_id,
      client.organization_id || null,
      req.user.id,
      provider.id
    );
    res.json({
      thread_id: threadId,
      agency_id: client.agency_id,
      organization_id: client.organization_id,
      provider: {
        id: provider.id,
        first_name: provider.first_name,
        last_name: provider.last_name
      },
      client_id: clientId
    });
  } catch (e) {
    next(e);
  }
};
