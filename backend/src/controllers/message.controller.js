import multer from 'multer';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import MessageLog from '../models/MessageLog.model.js';
import StorageService from '../services/storage.service.js';
import Agency from '../models/Agency.model.js';
import UserCallSettings from '../models/UserCallSettings.model.js';
import SmsOptInState from '../models/SmsOptInState.model.js';
import PhoneNumberAssignment from '../models/PhoneNumberAssignment.model.js';
import NotificationGatekeeperService from '../services/notificationGatekeeper.service.js';
import VonageService from '../services/vonage.service.js';
import { resolveOutboundNumber } from '../services/communicationRouting.service.js';
import SmsThreadEscalation from '../models/SmsThreadEscalation.model.js';
import SmsAutoReplyRuleService from '../services/smsAutoReplyRule.service.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import AgencyContact from '../models/AgencyContact.model.js';
import ContactCommunicationLog from '../models/ContactCommunicationLog.model.js';

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
};

const canViewSafetyNetFeed = (role) =>
  role === 'support' || role === 'admin' || role === 'super_admin' || role === 'clinical_practice_assistant' || role === 'provider_plus';

async function getAgencyIdsForUser(userId) {
  const agencies = await User.getAgencies(userId);
  return (agencies || [])
    .map((a) => Number(a?.id))
    .filter((id) => Number.isFinite(id) && id > 0);
}

function parseIntOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

async function assertClientAgencyAccess(reqUserId, client) {
  // If the client is not agency-scoped, allow (legacy / edge cases).
  const clientAgencyId = client?.agency_id ? Number(client.agency_id) : null;
  if (!clientAgencyId) return true;
  const agencyIds = await getAgencyIdsForUser(reqUserId);
  if (!agencyIds.includes(clientAgencyId)) {
    const err = new Error('Access denied to this client');
    err.status = 403;
    throw err;
  }
  return true;
}

/**
 * GET /api/messages/threads
 * Returns one thread per client (most recent message), with unread count.
 * Unread = INBOUND messages received after the last OUTBOUND message in that thread.
 */
export const getThreads = async (req, res, next) => {
  try {
    const uid = parseIntOrNull(req.user?.id);
    if (!uid) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const rawLimit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100;
    const agencyId = req.query.agencyId ? parseIntOrNull(req.query.agencyId) : null;
    const search = req.query.search ? String(req.query.search).trim() : '';

    const role = String(req.user?.role || '').toLowerCase();
    const isProviderOrSchoolStaff = role === 'provider' || role === 'school_staff';

    let userWhereClause = 'ml.user_id = ?';
    let userParams = [uid, uid]; // second uid for agency EXISTS subquery

    if (isProviderOrSchoolStaff) {
      const assignments = await PhoneNumberAssignment.listByUserId(uid);
      const assignedNumberIds = (assignments || []).map((a) => Number(a.number_id)).filter(Boolean);
      if (assignedNumberIds.length > 0) {
        const placeholders = assignedNumberIds.map(() => '?').join(',');
        userWhereClause = `(ml.user_id = ? OR ml.number_id IN (${placeholders}))`;
        userParams = [uid, ...assignedNumberIds, uid];
      }
    }

    const agencyFilter = agencyId ? 'AND ml.agency_id = ?' : '';
    const agencyParam = agencyId ? [agencyId] : [];

    const searchFilter = search
      ? 'AND (COALESCE(c.full_name, c.initials) LIKE ? OR c.contact_phone LIKE ?)'
      : '';
    const searchWild = `%${search}%`;
    const searchParams = search ? [searchWild, searchWild] : [];

    // One thread per client: last message id + last outbound timestamp
    const innerSql = `
      SELECT
        ml.client_id,
        ml.agency_contact_id,
        MAX(ml.created_at)                                          AS last_message_at,
        MAX(ml.id)                                                  AS last_message_id,
        MAX(CASE WHEN ml.direction = 'OUTBOUND' THEN ml.created_at END) AS last_outbound_at
      FROM message_logs ml
      LEFT JOIN clients c ON ml.client_id = c.id
      LEFT JOIN agency_contacts ac ON ml.agency_contact_id = ac.id
      WHERE ${userWhereClause}
        AND (ml.client_id IS NOT NULL OR ml.agency_contact_id IS NOT NULL)
        AND (ml.agency_id IS NULL OR EXISTS (
          SELECT 1 FROM user_agencies ua WHERE ua.user_id = ? AND ua.agency_id = ml.agency_id
        ))
        ${agencyFilter}
        ${searchFilter}
      GROUP BY ml.client_id, ml.agency_contact_id
    `;

    const innerParams = [...userParams, ...agencyParam, ...searchParams];

    const sql = `
      SELECT
        t.client_id,
        t.agency_contact_id,
        t.last_message_at,
        t.last_message_id,
        t.last_outbound_at,
        (
          SELECT COUNT(*) FROM message_logs m2
          WHERE (m2.client_id = t.client_id OR (t.client_id IS NULL AND m2.agency_contact_id = t.agency_contact_id))
            AND m2.direction = 'INBOUND'
            AND (t.last_outbound_at IS NULL OR m2.created_at > t.last_outbound_at)
        ) AS unread_count,
        ml.body        AS last_body,
        ml.direction   AS last_direction,
        ml.user_id     AS user_id,
        ml.number_id   AS number_id,
        ml.agency_id   AS agency_id,
        c.initials     AS client_initials,
        COALESCE(c.full_name, c.initials) AS client_name,
        c.contact_phone AS client_phone,
        ac.full_name   AS contact_name,
        ac.phone       AS contact_phone,
        u.first_name   AS user_first_name,
        u.last_name    AS user_last_name
      FROM (${innerSql}) t
      LEFT JOIN message_logs ml ON ml.id = t.last_message_id
      LEFT JOIN clients c       ON t.client_id = c.id
      LEFT JOIN agency_contacts ac ON t.agency_contact_id = ac.id
      LEFT JOIN users u         ON ml.user_id = u.id
      ORDER BY t.last_message_at DESC
      LIMIT ?
    `;

    // pool.query (not execute) is required here because mysql2 prepared statements
    // don't support correlated subqueries in the SELECT list reliably.
    const [rows] = await pool.query(sql, [...innerParams, limit]);
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

/**
 * GET /api/messages/my-numbers
 * Returns the phone numbers assigned to the authenticated user (for compose/send flows).
 */
export const getMyNumbers = async (req, res, next) => {
  try {
    const uid = parseIntOrNull(req.user?.id);
    if (!uid) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const assignments = await PhoneNumberAssignment.listByUserId(uid);
    const numbers = (assignments || []).map((a) => ({
      id: a.number_id,
      phone_number: a.phone_number,
      label: a.label || null,
      is_primary: !!a.is_primary,
      sms_enabled: a.sms_enabled !== false && a.sms_enabled !== 0,
      agency_id: a.agency_id
    }));
    res.json(numbers);
  } catch (e) {
    next(e);
  }
};

export const getRecentMessages = async (req, res, next) => {
  try {
    const uid = parseIntOrNull(req.user?.id);
    if (!uid) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const rawLimit = req.query.limit ? parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
    const safeUid = Number(uid);
    const safeLimit = Number(limit);
    const role = String(req.user?.role || '').toLowerCase();
    const isProviderOrSchoolStaff = role === 'provider' || role === 'school_staff';

    let userClause = `ml.user_id = ${safeUid}`;
    const params = [];
    if (isProviderOrSchoolStaff) {
      const assignments = await PhoneNumberAssignment.listByUserId(uid);
      const assignedNumberIds = (assignments || []).map((a) => Number(a.number_id)).filter(Boolean);
      if (assignedNumberIds.length > 0) {
        const placeholders = assignedNumberIds.map(() => '?').join(',');
        userClause = `(ml.user_id = ? OR ml.number_id IN (${placeholders}))`;
        params.push(safeUid, ...assignedNumberIds);
      }
    }

    const [rows] = await pool.execute(
      `SELECT ml.*,
             c.initials AS client_initials,
             u.first_name AS user_first_name,
             u.last_name AS user_last_name
      FROM message_logs ml
      LEFT JOIN clients c ON ml.client_id = c.id
      LEFT JOIN users u ON ml.user_id = u.id
      WHERE ${userClause}
        AND (
          ml.agency_id IS NULL
          OR EXISTS (
            SELECT 1
            FROM user_agencies ua
            WHERE ua.user_id = ?
              AND ua.agency_id = ml.agency_id
          )
        )
      ORDER BY ml.created_at DESC
      LIMIT ?`,
      params.length > 0 ? [...params, safeUid, safeLimit] : [safeUid, safeLimit]
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const getThread = async (req, res, next) => {
  try {
    const { userId, clientId } = req.params;
    const { contactId } = req.query; // Optional contactId override
    const uidParam = parseIntOrNull(userId);
    const cid = parseIntOrNull(clientId);
    const aid = parseIntOrNull(contactId);

    if (!cid && !aid) return res.status(400).json({ error: { message: 'clientId or contactId is required' } });

    // Privacy rule: the authenticated user can only load their own thread.
    if (uidParam && uidParam !== req.user.id) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    let client = null;
    let contact = null;

    if (cid) {
      client = await Client.findById(cid, { includeSensitive: false });
      if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
      await assertClientAgencyAccess(req.user.id, client);
    } else if (aid) {
      contact = await AgencyContact.findById(aid);
      if (!contact) return res.status(404).json({ error: { message: 'Contact not found' } });
      // TODO: Assert contact agency access
    }

    const rawLimit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 100;
    const role = String(req.user?.role || '').toLowerCase();
    const isProviderOrSchoolStaff = role === 'provider' || role === 'school_staff';
    let assignedNumberIds = [];
    if (isProviderOrSchoolStaff) {
      const assignments = await PhoneNumberAssignment.listByUserId(req.user.id);
      assignedNumberIds = (assignments || []).map((a) => Number(a.number_id)).filter(Boolean);
    }
    const rows = await MessageLog.listThread({
      userId: req.user.id,
      clientId: cid,
      agencyContactId: aid,
      limit,
      assignedNumberIds: assignedNumberIds.length > 0 ? assignedNumberIds : undefined
    });
    res.json({ client, contact, messages: rows });
  } catch (e) {
    next(e);
  }
};

export const sendMessage = async (req, res, next) => {
  try {
    const { userId, clientId, contactId, body, mediaUrls } = req.body;
    if (userId && parseIntOrNull(userId) && parseIntOrNull(userId) !== req.user.id) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const hasMedia = Array.isArray(mediaUrls) && mediaUrls.length > 0;
    if ((!clientId && !contactId) || (!body && !hasMedia)) {
      return res.status(400).json({ error: { message: '(clientId or contactId) and (body or mediaUrls) are required' } });
    }

    const uid = req.user.id;
    const cid = parseIntOrNull(clientId);
    const aid = parseIntOrNull(contactId);

    const user = await User.findById(uid);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    let targetPhone = null;
    let targetAgencyId = null;
    let client = null;
    let contact = null;

    if (cid) {
      client = await Client.findById(cid, { includeSensitive: true });
      if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
      await assertClientAgencyAccess(req.user.id, client);
      targetPhone = client.contact_phone;
      targetAgencyId = client.agency_id;
    } else if (aid) {
      contact = await AgencyContact.findById(aid);
      if (!contact) return res.status(404).json({ error: { message: 'Contact not found' } });
      targetPhone = contact.phone;
      targetAgencyId = contact.agency_id;
    }

    if (!targetPhone) {
      return res.status(400).json({ error: { message: 'Recipient does not have a contact phone assigned' } });
    }

    const resolved = await resolveOutboundNumber({
      userId: uid,
      clientId: cid,
      requestedNumberId: req.body?.numberId ? parseIntOrNull(req.body.numberId) : null
    });
    if (resolved?.error === 'number_unavailable') {
      return res.status(404).json({ error: { message: 'Selected number is unavailable' } });
    }
    if (resolved?.error === 'number_not_assigned') {
      return res.status(403).json({ error: { message: 'Selected number is not assigned to you' } });
    }
    if (resolved?.error === 'number_not_accessible') {
      return res.status(403).json({ error: { message: 'Selected number is not accessible for this agency' } });
    }
    if (!resolved?.number) {
      return res.status(400).json({
        error: {
          message:
            'You need a texting number assigned to you to send messages. Contact your administrator to get a number assigned.'
        }
      });
    }

    const callSettings = await UserCallSettings.getByUserId(uid);
    const smsOutboundEnabled = callSettings?.sms_outbound_enabled !== false && callSettings?.sms_outbound_enabled !== 0;
    if (!smsOutboundEnabled) {
      return res.status(403).json({
        error: { message: 'Outbound texting is disabled in your communication settings.' }
      });
    }

    let activeEscalation = null;
    if (cid) {
      try {
        activeEscalation = await SmsThreadEscalation.findActive({ userId: uid, clientId: cid });
      } catch {
        activeEscalation = null;
      }
    }
    if (activeEscalation && activeEscalation.thread_mode === 'read_only') {
      return res.status(403).json({
        error: {
          message: 'This thread is currently escalated to support in read-only mode for the provider.'
        }
      });
    }
    const fromNumber = resolved.number.phone_number;
    const numberId = resolved?.number?.id || null;
    const ownerType = resolved?.ownerType || (resolved?.number ? 'agency' : 'staff');
    const assignedUserId = resolved?.assignment?.user_id || uid;

    // Compliance: opt-in/opt-out handling per agency feature flags.
    const agency = targetAgencyId ? await Agency.findById(targetAgencyId) : null;
    const flags = parseFeatureFlags(agency?.feature_flags);
    const complianceMode = String(flags.smsComplianceMode || 'opt_in_required');
    if (numberId && cid) {
      const optState = await SmsOptInState.findByClientNumber({ clientId: cid, numberId });
      const optStatus = optState?.status || 'pending';
      if (optStatus === 'opted_out') {
        return res.status(403).json({ error: { message: 'Client has opted out of SMS' } });
      }
      if (complianceMode === 'opt_in_required' && optStatus !== 'opted_in') {
        return res.status(403).json({ error: { message: 'Client has not opted in to SMS yet' } });
      }
    }

    // Gatekeeper integration: this is about after-hours *notifications* to user.
    // For outbound SMS to clients, we still allow sending. But we tag metadata with quiet-hours state for analytics.
    const decision = await NotificationGatekeeperService.decideChannels({
      userId: uid,
      context: { severity: 'info' }
    });

    const outboundMetadata = { provider: 'vonage', gatekeeper: decision, numberId };
    if (hasMedia) outboundMetadata.media_urls = mediaUrls;

    const outboundLog = await MessageLog.createOutbound({
      agencyId: targetAgencyId || null,
      userId: uid,
      assignedUserId,
      numberId,
      ownerType,
      clientId: cid,
      agencyContactId: aid,
      body: body || (hasMedia ? '[MMS]' : ''),
      fromNumber,
      toNumber: targetPhone,
      deliveryStatus: 'pending',
      providerMessageSid: null,
      metadata: outboundMetadata
    });

    try {
      const msg = await VonageService.sendSms({
        to: MessageLog.normalizePhone(targetPhone) || targetPhone,
        from: MessageLog.normalizePhone(fromNumber) || fromNumber,
        body: body || '',
        mediaUrl: hasMedia ? mediaUrls : null
      });
      const sentMetadata = { provider: 'vonage', status: msg.status, gatekeeper: decision };
      if (hasMedia) sentMetadata.media_urls = mediaUrls;
      const updated = await MessageLog.markSent(outboundLog.id, msg.sid, sentMetadata);
      
      // Sync with ContactCommunicationLog if it's a contact or client matched to contact
      try {
        const matchedContact = contact || await AgencyContact.findByPhone(targetPhone, targetAgencyId);
        if (matchedContact) {
          const existing = await ContactCommunicationLog.findByExternalRefId(String(outboundLog.id));
          if (!existing) {
            await ContactCommunicationLog.create({
              contactId: matchedContact.id,
              channel: 'sms',
              direction: 'outbound',
              body,
              externalRefId: String(outboundLog.id),
              metadata: { fromNumber, toNumber: targetPhone, messageLogId: outboundLog.id }
            });
          }
        }
      } catch {
        // Best-effort; do not fail send
      }
      
      await logAuditEvent(req, {
        actionType: 'sms_sent',
        agencyId: targetAgencyId || null,
        metadata: {
          clientId: cid,
          contactId: aid,
          messageLogId: updated?.id || outboundLog?.id || null,
          numberId,
          ownerType
        }
      });
      if (cid) {
        await SmsThreadEscalation.resolveActive({ userId: uid, clientId: cid }).catch(() => {});
      }
      res.status(201).json(updated);
    } catch (sendErr) {
      await MessageLog.markFailed(outboundLog.id, sendErr.message);
      await logAuditEvent(req, {
        actionType: 'sms_send_failed',
        agencyId: targetAgencyId || null,
        metadata: {
          clientId: cid,
          contactId: aid,
          messageLogId: outboundLog?.id || null,
          numberId,
          ownerType,
          error: String(sendErr?.message || '').slice(0, 400)
        }
      });
      return res.status(502).json({ error: { message: 'Failed to send SMS via Vonage', details: sendErr.message } });
    }
  } catch (e) {
    next(e);
  }
};

const smsMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif',
      'application/pdf', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Invalid file type. Only JPG, PNG, GIF, PDF, and DOC/DOCX files are allowed.'), false);
  }
});

export const uploadSmsMedia = [
  smsMediaUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: { message: 'No file uploaded' } });
      const result = await StorageService.saveSmsMedia({
        userId: req.user?.id,
        fileBuffer: req.file.buffer,
        filename: req.file.originalname,
        contentType: req.file.mimetype
      });
      const url = await StorageService.getSignedUrl(result.key, 60 * 24);
      res.json({ url, key: result.key });
    } catch (e) {
      next(e);
    }
  }
];

export const deleteThread = async (req, res, next) => {
  try {
    const clientId = parseIntOrNull(req.params.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(clientId, { includeSensitive: false });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    await assertClientAgencyAccess(req.user.id, client);

    const [r] = await pool.execute('DELETE FROM message_logs WHERE user_id = ? AND client_id = ?', [req.user.id, clientId]);
    await logAuditEvent(req, {
      actionType: 'sms_thread_deleted',
      agencyId: client.agency_id || null,
      metadata: { clientId, deletedCount: Number(r?.affectedRows || 0) }
    });
    res.json({ ok: true, deletedCount: r.affectedRows || 0 });
  } catch (e) {
    next(e);
  }
};

export const deleteMessageLog = async (req, res, next) => {
  try {
    const id = parseIntOrNull(req.params.id);
    if (!id) return res.status(400).json({ error: { message: 'id is required' } });

    const [r] = await pool.execute('DELETE FROM message_logs WHERE id = ? AND user_id = ?', [id, req.user.id]);
    if (!r.affectedRows) return res.status(404).json({ error: { message: 'Message not found' } });
    await logAuditEvent(req, {
      actionType: 'sms_message_deleted',
      metadata: { messageLogId: id }
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

/**
 * POST /api/messages/forward-to-support
 * Body: { clientId, message }
 * Forwards a thread to support.
 */
export const forwardToSupport = async (req, res, next) => {
  try {
    const { clientId, message } = req.body;
    const uid = req.user.id;
    const cid = parseIntOrNull(clientId);
    if (!cid) return res.status(400).json({ error: { message: 'clientId is required' } });

    const client = await Client.findById(cid);
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    await assertClientAgencyAccess(uid, client);

    const agency = client.agency_id ? await Agency.findById(client.agency_id) : null;
    const flags = parseFeatureFlags(agency?.feature_flags);
    
    // Find the latest inbound message to link the escalation
    const [latestInbound] = await pool.execute(
      `SELECT * FROM message_logs 
       WHERE client_id = ? AND user_id = ? AND direction = 'INBOUND'
       ORDER BY created_at DESC LIMIT 1`,
      [cid, uid]
    );
    const inboundLog = latestInbound?.[0] || null;

    const supportPhone = MessageLog.normalizePhone(flags.smsSupportFallbackPhone || agency?.phone_number) || 
      flags.smsSupportFallbackPhone || agency?.phone_number || null;

    if (!supportPhone) {
      return res.status(400).json({ error: { message: 'Support phone not configured for this agency' } });
    }

    const body = `Forwarded to Support by ${req.user.first_name || 'Provider'}: ${message || '(No note)'}. Client ${client.initials || '#'+cid} thread escalated.`;
    const from = inboundLog ? (MessageLog.normalizePhone(inboundLog.to_number) || inboundLog.to_number) : supportPhone;

    await VonageService.sendSms({ to: supportPhone, from, body });

    await SmsThreadEscalation.createOrKeep({
      agencyId: client.agency_id,
      userId: uid,
      clientId: cid,
      inboundLogId: inboundLog?.id || null,
      escalatedToPhone: supportPhone,
      escalationType: 'manual_forward',
      threadMode: 'respondable',
      metadata: { forwarderUserId: uid, forwarderNote: message }
    });

    await logAuditEvent(req, {
      actionType: 'sms_thread_forwarded_to_support',
      agencyId: client.agency_id || null,
      metadata: { clientId: cid, supportPhone, message }
    });

    res.json({ ok: true, message: 'Thread forwarded to support' });
  } catch (e) {
    next(e);
  }
};

export const getSmartReplies = async (req, res, next) => {
  try {
    const { clientId, contactId } = req.query;
    const uid = req.user.id;
    const cid = clientId ? parseInt(clientId, 10) : null;
    const aid = contactId ? parseInt(contactId, 10) : null;

    const suggestions = await SmsAutoReplyRuleService.generateSmartReplies({
      userId: uid,
      clientId: cid,
      agencyContactId: aid
    });

    res.json({ suggestions });
  } catch (e) {
    next(e);
  }
};

export const getRtcToken = async (req, res, next) => {
  try {
    const user = req.user;
    const userName = `user_${user.id}`;
    
    // Ensure Vonage user exists (best effort)
    try {
      await VonageService.createRtcUser({ 
        name: userName, 
        displayName: `${user.first_name} ${user.last_name}`.trim() || user.username 
      });
    } catch (e) {
      // If user already exists, this might fail, which is fine
    }

    const token = VonageService.generateRtcJwt(userName);
    res.json({ token, userName });
  } catch (e) {
    next(e);
  }
};

