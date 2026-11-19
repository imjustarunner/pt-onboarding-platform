import ClientGuardian from '../models/ClientGuardian.model.js';
import { resolveRelayFamily } from '../services/providerSmsRelayIdentity.service.js';
import {ensureClientAccess,isBackofficeRole,chartCommunicationThreads} from '../services/chartCommunicationExport.service.js';
import {clientEmailThread,listClientCommunicationThreads,clientCommunicationThread} from '../services/clientConversationRecord.service.js';
import {communicationPrintDocument} from '../services/communicationPrint.service.js';
/**
 * Aggregated communications view for a single client.
 *
 * Surfaces every email and SMS that staff/admin should be able to attribute to
 * a client — including emails that were technically addressed to a guardian
 * (because guardians are the operative recipient for most parent-of-child
 * notifications). The Communications tab on a client profile is rendered from
 * `GET /api/clients/:id/communications`; the matching email body is fetched on
 * demand via `GET /api/clients/:id/communications/email/:commId/body` so we
 * don't ship multi-KB HTML in the list payload.
 */
import pool from '../config/database.js';
import { appCommunicationVisibilitySql } from '../utils/externalTestingEmail.js';

import UserCommunication from '../models/UserCommunication.model.js';

/**
 * Shape an email row (raw `user_communications` join) into the format the UI expects.
 * Body intentionally omitted from list payloads — fetched separately via the body endpoint.
 */
function receiptMetadata(row) { try { const m=typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata; return {receiptRequired:!!m?.cancellationReceiptId,receiptConfirmedAt:m?.cancellationReceiptConfirmedAt || null}; } catch {return {receiptRequired:false,receiptConfirmedAt:null};} }
function shapeEmailRow(row) {
  const recipientUserId = row.recipient_user_id || row.user_id || null;
  const recipientName = [row.recipient_first_name, row.recipient_last_name]
    .filter(Boolean)
    .join(' ')
    .trim();
  const isGuardianRecipient = !!row.guardian_relationship
    || String(row.recipient_role || '').toLowerCase() === 'client_guardian';
  return {
    id: row.id,
    channel: 'email',
    ...receiptMetadata(row),
    direction: 'outbound',
    subject: row.subject || null,
    recipientAddress: row.recipient_address || row.recipient_email || null,
    recipientUserId,
    recipientUserName: recipientName || null,
    recipientUserRole: row.recipient_role || null,
    recipientIsGuardian: isGuardianRecipient,
    guardianRelationship: row.guardian_relationship || null,
    deliveryStatus: row.delivery_status || 'pending',
    sentAt: row.sent_at || row.generated_at || null,
    deliveredAt: row.delivered_at || null,
    openedAt: row.opened_at || null,
    firstClickedAt: row.first_clicked_at || null,
    errorMessage: row.error_message || null,
    templateType: row.template_type || null,
    externalMessageId: row.external_message_id || null,
    agencyId: row.agency_id || null,
    agencyName: row.agency_name || null,
    generatedByName: [row.generated_by_first_name, row.generated_by_last_name]
      .filter(Boolean).join(' ').trim() || null,
    clientId: row.client_id || null,
    hasBody: true
  };
}

/**
 * Pull SMS rows tied to this client. We aggregate two distinct sources:
 *   * `message_logs` — per-client conversation threads on agency phone numbers
 *     (these are the human-typed texts; both INBOUND and OUTBOUND).
 *   * `notification_sms_logs` — system-driven notification SMS, which only
 *     attaches to a `client` indirectly via `notifications.related_entity_*`.
 *
 * Both are normalized into the same envelope shape for easy rendering.
 */
async function fetchSmsForClient(clientId) {
  const out = [];

  try {
    const [threadRows] = await pool.execute(
      `SELECT ml.id, ml.direction, ml.body, ml.from_number, ml.to_number,
              ml.delivery_status, ml.created_at, ml.twilio_message_sid,
              ml.user_id, ml.assigned_user_id,
              ml.agency_id, a.name AS agency_name,
              u.first_name AS sender_first_name, u.last_name AS sender_last_name
         FROM message_logs ml
         LEFT JOIN agencies a ON ml.agency_id = a.id
         LEFT JOIN users u ON ml.user_id = u.id
        WHERE ml.client_id = ?
        ORDER BY ml.created_at DESC, ml.id DESC
        LIMIT 200`,
      [clientId]
    );
    for (const r of threadRows || []) {
      const direction = String(r.direction || 'OUTBOUND').toUpperCase() === 'INBOUND' ? 'inbound' : 'outbound';
      out.push({
        id: `ml-${r.id}`,
        channel: 'sms',
        source: 'thread',
        direction,
        body: r.body || '',
        fromNumber: r.from_number || null,
        toNumber: r.to_number || null,
        deliveryStatus: r.delivery_status || (direction === 'inbound' ? 'received' : 'pending'),
        sentAt: r.created_at || null,
        externalMessageId: r.twilio_message_sid || null,
        agencyId: r.agency_id || null,
        agencyName: r.agency_name || null,
        actorName: [r.sender_first_name, r.sender_last_name].filter(Boolean).join(' ').trim() || null,
        clientId
      });
    }
  } catch (e) {
    console.warn('[clientCommunications] message_logs fetch failed', e?.message || e);
  }

  try {
    const [notifRows] = await pool.execute(
      `SELECT nsl.id, nsl.user_id, nsl.agency_id, nsl.body, nsl.to_number, nsl.from_number,
              nsl.status, nsl.error_message, nsl.created_at, nsl.twilio_sid,
              n.title AS notification_title, n.message AS notification_message, n.type AS notification_type,
              u.first_name AS recipient_first_name, u.last_name AS recipient_last_name, u.role AS recipient_role,
              cg.relationship_title AS guardian_relationship,
              a.name AS agency_name
         FROM notification_sms_logs nsl
         JOIN notifications n ON nsl.notification_id = n.id
         LEFT JOIN users u ON nsl.user_id = u.id
         LEFT JOIN client_guardians cg
           ON cg.guardian_user_id = nsl.user_id AND cg.client_id = ?
         LEFT JOIN agencies a ON nsl.agency_id = a.id
        WHERE n.related_entity_type = 'client' AND n.related_entity_id = ?
        ORDER BY nsl.created_at DESC, nsl.id DESC
        LIMIT 200`,
      [clientId, clientId]
    );
    for (const r of notifRows || []) {
      const recipientName = [r.recipient_first_name, r.recipient_last_name].filter(Boolean).join(' ').trim();
      out.push({
        id: `nsl-${r.id}`,
        channel: 'sms',
        source: 'notification',
        direction: 'outbound',
        subject: r.notification_title || null,
        body: r.body || r.notification_message || '',
        fromNumber: r.from_number || null,
        toNumber: r.to_number || null,
        deliveryStatus: r.status || 'pending',
        sentAt: r.created_at || null,
        externalMessageId: r.twilio_sid || null,
        errorMessage: r.error_message || null,
        templateType: r.notification_type ? `notification:${r.notification_type}` : null,
        agencyId: r.agency_id || null,
        agencyName: r.agency_name || null,
        recipientUserId: r.user_id || null,
        recipientUserName: recipientName || null,
        recipientUserRole: r.recipient_role || null,
        recipientIsGuardian: !!r.guardian_relationship
          || String(r.recipient_role || '').toLowerCase() === 'client_guardian',
        guardianRelationship: r.guardian_relationship || null,
        clientId
      });
    }
  } catch (e) {
    console.warn('[clientCommunications] notification_sms_logs fetch failed', e?.message || e);
  }

  return out;
}

/** Resolve linked guardians (lightweight summary used as response metadata). */
async function fetchClientGuardiansSummary(clientId) {
  try {
    const links = await ClientGuardian.listForClient(clientId);
    return Promise.all(links.map(async r => ({
      id: r.guardian_user_id,
      canText: (await resolveRelayFamily({id:clientId}, r.phone, links))?.guardianUserId === Number(r.guardian_user_id),
      name: [r.first_name, r.last_name].filter(Boolean).join(' ').trim() || null,
      email: r.email || null,
      phone: r.phone || null,
      relationshipTitle: r.relationship_title || 'Guardian'
    })));
  } catch {
    return [];
  }
}

/**
 * GET /api/clients/:id/communications
 *
 * Returns: { client, guardians, items: [...email + SMS, newest first], counts }
 */
export const listClientCommunications = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!Number.isFinite(clientId) || clientId <= 0) {
      return res.status(400).json({ error: { message: 'Invalid client id' } });
    }
    const access = await ensureClientAccess({
      userId: req.user.id,
      role: req.user.role,
      clientId
    });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const limitRaw = parseInt(String(req.query?.limit || ''), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200;

    const [emailRows, smsItems, guardians, conversations] = await Promise.all([
      UserCommunication.listForClient(clientId, { limit }),
      fetchSmsForClient(clientId),
      fetchClientGuardiansSummary(clientId),
      listClientCommunicationThreads(clientId,req.user.id)
    ]);

    const emailItems = (emailRows || []).map(shapeEmailRow);
    const items = [...emailItems, ...smsItems].sort((a, b) => {
      const ta = new Date(a.sentAt || 0).getTime() || 0;
      const tb = new Date(b.sentAt || 0).getTime() || 0;
      return tb - ta;
    });

    const counts = {
      total: items.length,
      email: emailItems.length,
      sms: smsItems.length,
      opened: emailItems.filter((i) => i.openedAt).length,
      failed: items.filter((i) => /failed|bounced|undelivered/i.test(String(i.deliveryStatus || ''))).length
    };

    // PII gating: backoffice roles see full_name; school staff & others see initials only.
    const callerRole = String(req.user?.role || '').toLowerCase();
    const callerCanSeeFullName = ['super_admin', 'admin', 'support', 'staff'].includes(callerRole);
    res.json({
      client: {
        id: access.client.id,
        hasContactPhone: !!access.client.contact_phone,
        initials: access.client.initials || null,
        full_name: callerCanSeeFullName ? (access.client.full_name || null) : null
      },
      guardians,
      conversations,
      counts,
      items
    });
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/clients/:id/communications/email/:commId/body
 *
 * Returns the raw rendered HTML/text for a single email row, with the same
 * client-access gate as the list endpoint. We require the comm to either be
 * tagged with this client_id OR addressed to one of this client's linked
 * guardians, so a caller can't probe arbitrary `user_communications` rows.
 */
/**
 * GET /api/clients/:id/sms-audit
 * Encrypted SMS profile audit (decrypt-on-authorize). Newest first.
 */
export const listClientSmsAudit = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    if (!Number.isFinite(clientId)) {
      return res.status(400).json({ error: { message: 'Invalid client id' } });
    }
    if (!isBackofficeRole(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Admin access required' } });
    }

    const access = await ensureClientAccess({
      userId: req.user.id,
      role: req.user.role,
      clientId
    });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const limitRaw = parseInt(String(req.query?.limit || ''), 10);
    const offsetRaw = parseInt(String(req.query?.offset || ''), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
    const offset = Number.isFinite(offsetRaw) ? Math.max(offsetRaw, 0) : 0;

    const SmsProfileAudit = (await import('../models/SmsProfileAudit.model.js')).default;
    const items = await SmsProfileAudit.listForClient(clientId, { limit, offset });
    res.json({ clientId, items });
  } catch (e) {
    next(e);
  }
};

export const getClientCommunicationBody = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.id, 10);
    const commId = parseInt(req.params.commId, 10);
    if (!Number.isFinite(clientId) || !Number.isFinite(commId)) {
      return res.status(400).json({ error: { message: 'Invalid id(s)' } });
    }

    const access = await ensureClientAccess({
      userId: req.user.id,
      role: req.user.role,
      clientId
    });
    if (!access.ok) return res.status(access.status).json({ error: { message: access.message } });

    const [rows] = await pool.execute(
      `SELECT uc.id, uc.user_id, uc.client_id, uc.subject, uc.body, uc.channel,
              uc.recipient_address, uc.sent_at, uc.delivered_at, uc.opened_at,
              uc.delivery_status, uc.template_type, uc.external_message_id,
              EXISTS (
                SELECT 1 FROM client_guardians cg
                WHERE cg.client_id = ? AND cg.guardian_user_id = uc.user_id
              ) AS is_client_guardian_recipient
         FROM user_communications uc
        WHERE uc.id = ? AND ${appCommunicationVisibilitySql('uc')}
        LIMIT 1`,
      [clientId, commId]
    );
    const row = rows?.[0];
    if (!row) return res.status(404).json({ error: { message: 'Communication not found' } });

    const belongsToClient =
      Number(row.client_id) === clientId
      || (!row.client_id && row.is_client_guardian_recipient && (await UserCommunication.listForClient(clientId,{limit:500})).some(r=>Number(r.id)===commId));
    if (!belongsToClient) {
      return res.status(404).json({ error: { message: 'Communication not found' } });
    }

    res.json({
      id: row.id,
      subject: row.subject || null,
      body: row.body || '',
      channel: row.channel || 'email',
      recipientAddress: row.recipient_address || null,
      sentAt: row.sent_at || null,
      deliveredAt: row.delivered_at || null,
      openedAt: row.opened_at || null,
      ...receiptMetadata(row),
      deliveryStatus: row.delivery_status || null,
      templateType: row.template_type || null,
      externalMessageId: row.external_message_id || null
    });
  } catch (e) {
    next(e);
  }
};

export const getClientEmailConversation = async (req,res,next) => {
  try{
    const clientId=Number(req.params.id),conversationId=String(req.params.conversationId);
    const access=await ensureClientAccess({userId:req.user.id,role:req.user.role,clientId});
    if(!access.ok)return res.status(access.status).json({error:{message:access.message}});
    res.set('Cache-Control','private, no-store');
    res.json(await clientCommunicationThread(clientId,conversationId,req.user.id));
  }catch(e){if(e.status)return res.status(e.status).json({error:{message:e.message}});next(e);}
};

export const exportClientCommunications = async (req,res,next) => {
  try{
    const clientId=Number(req.params.id);
    const access=await ensureClientAccess({userId:req.user.id,role:req.user.role,clientId});
    if(!access.ok)return res.status(access.status).json({error:{message:access.message}});
    let threads=[];
    if(req.query.conversationId)threads=[await clientCommunicationThread(clientId,String(req.query.conversationId),req.user.id)];
    else{
      threads=await chartCommunicationThreads(clientId,req.user.id);
    }
    res.set('Cache-Control','private, no-store');
    res.set('Content-Type','text/html; charset=utf-8');
    res.set('Content-Disposition',`attachment; filename="client-${clientId}-communications.html"`);
    res.send(communicationPrintDocument(`Communication record — ${access.client.full_name || access.client.initials || clientId}`,threads));
  }catch(e){if(e.status)return res.status(e.status).json({error:{message:e.message}});next(e);}
};

export const downloadClientConversationAttachment = async (req,res,next) => {
  try {
    const clientId = Number(req.params.id), conversationId = Number(req.params.conversationId);
    const access = await ensureClientAccess({userId:req.user.id,role:req.user.role,clientId});
    if (!access.ok) return res.status(access.status).json({error:{message:access.message}});
    const thread = await clientEmailThread(clientId,conversationId,req.user.id);
    if (!thread.messages.some(m => m.attachments?.some(a => Number(a.id) === Number(req.params.attachmentId)))) return res.status(404).json({error:{message:'Attachment not found'}});
    const { downloadCommunicationAttachment } = await import('../services/communicationAttachments.service.js');
    return downloadCommunicationAttachment({ params: { id: conversationId, attachmentId: req.params.attachmentId } },res,next);
  } catch(e) { if(e.status)return res.status(e.status).json({error:{message:e.message}});next(e); }
};
