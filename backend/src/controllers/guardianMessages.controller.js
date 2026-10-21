import {guardianServiceContext,guardianCareContexts} from '../services/clientServiceEnrollment.service.js';
import { refreshClientSecureAccess, ensureClientSecureConversation } from '../services/clientSecureConversation.service.js';
import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { ensureSharedChildThread } from '../services/guardianSharedMessages.service.js';
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
         AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND LOWER(u.status) IN ('active','active_employee')
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
       WHERE c.id = ? AND c.provider_id IS NOT NULL AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND LOWER(u.status) IN ('active','active_employee')
       LIMIT 1`,
      [cid]
    );
    return rows?.[0] || null;
  } catch {
    return null;
  }
}

async function assertGuardianClientAccess(guardianUserId, clientId) {
  const clients = await ClientGuardian.listClientsForGuardian({ guardianUserId, requiredClinicalScope: 'clinical_messages' });
  return (clients || []).find((c) => Number(c.client_id) === Number(clientId)) || null;
}

async function hasThreadAccess(userId, threadId) {
  const { requireGuardianThreadDisclosure } = await import('../services/guardianClinicalAccess.service.js');
  await requireGuardianThreadDisclosure(userId,threadId);
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
    let clients=[];
    if(req.query.clientId)clients=[await guardianServiceContext({userId:req.user.id,clientId:Number(req.query.clientId),agencyId:req.query.agencyId,serviceId:req.query.serviceId,scope:'clinical_messages'})];
    else {
      const profiles=await ClientGuardian.listClientsForGuardian({guardianUserId:req.user.id});
      for(const profile of profiles){
        for(const context of await guardianCareContexts(profile,req.user.id))for(const service of context.services){
          try{clients.push({...await guardianServiceContext({userId:req.user.id,clientId:profile.client_id,agencyId:context.agency_id,serviceId:service.id,scope:'clinical_messages'}),agency_name:context.agency_name});}catch(e){if(e.status!==403)throw e;}
        }
        // Keep earlier conversations accessible without moving their history
        // into a different service or adding new recipients to that history.
        const [[prior]]=await pool.execute("SELECT id FROM chat_threads WHERE client_id=? AND agency_id=? AND service_enrollment_id=0 AND thread_type='client_secure' AND EXISTS (SELECT 1 FROM chat_messages m WHERE m.thread_id=chat_threads.id) LIMIT 1",[profile.client_id,profile.agency_id]);
        if(prior){try{clients.push({...await guardianServiceContext({userId:req.user.id,clientId:profile.client_id,agencyId:profile.agency_id,scope:'clinical_messages'}),legacy_conversation:true});}catch(e){if(e.status!==403)throw e;}}
      }
    }
    const threads = [];
    for (const c of clients || []) {
      const provider = c.service ? (c.service.provider_user_id ? {id:c.service.provider_user_id,first_name:c.service.provider_name,last_name:''} : null) : await resolveAssignedProvider(c.client_id, c.organization_id);
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
      let participants = [];
      try {
        const shared = await ensureSharedChildThread({ clientId: c.client_id, agencyId: c.agency_id,serviceId:c.service?.id, userId: req.user.id });
        threadId = shared.threadId;
        participants = shared.participants;
      } catch {
        threadId = null;
      }
      const [[activity]] = threadId ? await pool.execute(`SELECT MAX(m.created_at) AS last_message_at FROM chat_messages m WHERE m.thread_id=? AND NOT EXISTS(SELECT 1 FROM chat_message_deletes d WHERE d.message_id=m.id AND d.user_id=?)`,[threadId,req.user.id]) : [[null]];
      threads.push({
        service_id:c.service?.id||null,service_label:c.legacy_conversation?'Previous shared conversation':c.service?.label||null,agency_name:c.agency_name||null,
        last_message_at: activity?.last_message_at || null,
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
        participants,
        shared: true,
        available: !!threadId
      });
    }

    let emails = [];
    try {
      const { listPortalEmails } = await import('../services/portalMailbox.service.js');
      emails = await listPortalEmails({ userId: req.user.id });
    } catch (e) {
      console.warn('[listGuardianMessageThreads] emails:', e?.message || e);
    }
    res.json({ threads, emails });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/guardian-portal/emails
 */
export const listGuardianEmails = async (req, res, next) => {
  try {
    if (req.guardianPreviewMode) return res.json({ emails: [] });
    const { listPortalEmails } = await import('../services/portalMailbox.service.js');
    const emails = await listPortalEmails({ userId: req.user.id });
    res.json({ emails });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/guardian-portal/emails/:conversationId
 */
export const getGuardianEmail = async (req, res, next) => {
  try {
    if (req.guardianPreviewMode) return res.json({ conversation: null, messages: [] });
    const conversationId = parseInt(req.params.conversationId, 10);
    const { getPortalEmail } = await import('../services/portalMailbox.service.js');
    const data = await getPortalEmail({ userId: req.user.id, conversationId });
    if (!data) return res.status(404).json({ error: { message: 'Email not found' } });
    res.json(data);
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/guardian-portal/emails/:conversationId
 */
export const replyGuardianEmail = async (req, res, next) => {
  try {
    if (req.guardianPreviewMode) {
      return res.status(403).json({ error: { message: 'Preview cannot send messages' } });
    }
    const children = await ClientGuardian.listClientsForGuardian({guardianUserId:req.user.id});
    if (children.some(child => child.relationship_type !== 'self')) {
      return res.status(409).json({error:{message:'Please reply in the child’s shared care conversation so all authorized guardians can see the message.'}});
    }
    const conversationId = parseInt(req.params.conversationId, 10);
    const { replyPortalEmail } = await import('../services/portalMailbox.service.js');
    const out = await replyPortalEmail({
      userId: req.user.id,
      conversationId,
      body: req.body?.body || req.body?.text || ''
    });
    res.json(out);
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
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
    await refreshClientSecureAccess(threadId, req.user.id);
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
    await refreshClientSecureAccess(threadId, req.user.id);
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
    const client = req.query.agencyId||req.body?.agencyId||req.query.serviceId||req.body?.serviceId ? await guardianServiceContext({userId:req.user.id,clientId,agencyId:req.query.agencyId||req.body?.agencyId,serviceId:req.query.serviceId||req.body?.serviceId,scope:'clinical_messages'}) : await assertGuardianClientAccess(req.user.id, clientId);
    if (!client) return res.status(403).json({ error: { message: 'Access denied to this child' } });

    const provider = client.service ? (client.service.provider_user_id ? {id:client.service.provider_user_id,first_name:client.service.provider_name,last_name:''} : null) : await resolveAssignedProvider(clientId, client.organization_id);
    if (!provider?.id) {
      return res.status(404).json({ error: { message: 'No assigned provider for this child yet' } });
    }

    const shared = await ensureSharedChildThread({ clientId, agencyId: client.agency_id,serviceId:client.service?.id, userId: req.user.id });
    const threadId = shared.threadId;
    res.json({
      shared: true,
      participants: shared.participants,
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
