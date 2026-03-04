import crypto from 'crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import MessageLog from '../models/MessageLog.model.js';
import UserCallSettings from '../models/UserCallSettings.model.js';
import CallLog from '../models/CallLog.model.js';
import CallVoicemail from '../models/CallVoicemail.model.js';
import TwilioNumberAssignment from '../models/TwilioNumberAssignment.model.js';
import { logAuditEvent } from '../services/auditEvent.service.js';
import TwilioService from '../services/twilio.service.js';
import { resolveOutboundNumber } from '../services/twilioNumberRouting.service.js';
import Agency from '../models/Agency.model.js';

function parseIntOrNull(v) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

async function getAgencyIdsForUser(userId) {
  const agencies = await User.getAgencies(userId);
  return (agencies || []).map((a) => Number(a?.id)).filter((id) => Number.isFinite(id) && id > 0);
}

async function assertClientAgencyAccess(reqUserId, client) {
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

function boolOrDefault(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const s = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(s)) return true;
  if (['false', '0', 'no', 'off'].includes(s)) return false;
  return fallback;
}

function getVoiceBaseUrl() {
  const raw = String(process.env.TWILIO_VOICE_WEBHOOK_URL || '').trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return `${u.origin}/api/twilio/voice`;
  } catch {
    return null;
  }
}

function getProviderTargetPhone(user, settings) {
  const preferred = settings?.forward_to_phone || null;
  const fallback = user?.personal_phone || user?.work_phone || user?.phone_number || null;
  return MessageLog.normalizePhone(preferred || fallback) || preferred || fallback || null;
}

function parseJsonObject(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function parseFeatureFlags(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function getSigningSecret() {
  return process.env.JWT_SECRET || process.env.SESSION_SECRET || process.env.TWILIO_AUTH_TOKEN || 'twilio-voice-secret';
}

function signPayload(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifySignedPayload(token) {
  if (!token || !String(token).includes('.')) return null;
  const [payload, sig] = String(token).split('.');
  const expected = crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('base64url');
  if (sig !== expected) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return parsed || null;
  } catch {
    return null;
  }
}

export const getCallSettings = async (req, res, next) => {
  try {
    const userId = parseIntOrNull(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    const settings = await UserCallSettings.getByUserId(userId);
    const fallbackForwardPhone = MessageLog.normalizePhone(user.personal_phone || user.work_phone || user.phone_number) ||
      user.personal_phone || user.work_phone || user.phone_number || null;
    const agencies = await User.getAgencies(userId);
    const agencyId = agencies?.[0]?.id || null;
    const agency = agencyId ? await Agency.findById(agencyId) : null;
    const flags = parseFeatureFlags(agency?.feature_flags);
    const ringTimeout = Number(flags.voiceProviderRingTimeoutSeconds || 20);
    const safeTimeout = Number.isFinite(ringTimeout) ? Math.min(Math.max(ringTimeout, 10), 60) : 20;

    res.json({
      inbound_enabled: boolOrDefault(settings?.inbound_enabled, true),
      outbound_enabled: boolOrDefault(settings?.outbound_enabled, true),
      sms_inbound_enabled: boolOrDefault(settings?.sms_inbound_enabled, true),
      sms_outbound_enabled: boolOrDefault(settings?.sms_outbound_enabled, true),
      forward_to_phone: settings?.forward_to_phone || fallbackForwardPhone,
      allow_call_recording: boolOrDefault(settings?.allow_call_recording, false),
      voicemail_enabled: boolOrDefault(settings?.voicemail_enabled, false),
      voicemail_message: settings?.voicemail_message || '',
      provider_ring_timeout_seconds: safeTimeout
    });
  } catch (e) {
    next(e);
  }
};

export const updateCallSettings = async (req, res, next) => {
  try {
    const userId = parseIntOrNull(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const existing = await UserCallSettings.getByUserId(userId);
    const patch = {
      inbound_enabled: boolOrDefault(req.body?.inbound_enabled, boolOrDefault(existing?.inbound_enabled, true)),
      outbound_enabled: boolOrDefault(req.body?.outbound_enabled, boolOrDefault(existing?.outbound_enabled, true)),
      sms_inbound_enabled: boolOrDefault(req.body?.sms_inbound_enabled, boolOrDefault(existing?.sms_inbound_enabled, true)),
      sms_outbound_enabled: boolOrDefault(req.body?.sms_outbound_enabled, boolOrDefault(existing?.sms_outbound_enabled, true)),
      allow_call_recording: boolOrDefault(req.body?.allow_call_recording, boolOrDefault(existing?.allow_call_recording, false)),
      forward_to_phone: req.body?.forward_to_phone ?? existing?.forward_to_phone ?? null,
      voicemail_enabled: boolOrDefault(req.body?.voicemail_enabled, boolOrDefault(existing?.voicemail_enabled, false)),
      voicemail_message: req.body?.voicemail_message ?? existing?.voicemail_message ?? null
    };
    const saved = await UserCallSettings.upsertForUser(userId, patch);
    res.json(saved);
  } catch (e) {
    next(e);
  }
};

export const startOutboundCall = async (req, res, next) => {
  try {
    const userId = parseIntOrNull(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const clientId = parseIntOrNull(req.body?.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    if (!client.contact_phone) {
      return res.status(400).json({ error: { message: 'Client does not have a contact phone assigned' } });
    }
    await assertClientAgencyAccess(userId, client);

    const settings = await UserCallSettings.getByUserId(userId);
    const outboundEnabled = boolOrDefault(settings?.outbound_enabled, true);
    if (!outboundEnabled) {
      return res.status(403).json({ error: { message: 'Outbound calls are disabled in your call settings' } });
    }

    const resolved = await resolveOutboundNumber({
      userId,
      clientId,
      requestedNumberId: req.body?.numberId ? parseIntOrNull(req.body.numberId) : null
    });
    if (!resolved?.number?.phone_number) {
      return res.status(400).json({
        error: {
          message:
            'You need a phone number assigned to you to make calls. Contact your administrator to get a number assigned.'
        }
      });
    }

    const providerPhone = getProviderTargetPhone(user, settings);
    if (!providerPhone) {
      return res.status(400).json({ error: { message: 'No provider forwarding phone set. Update your call settings first.' } });
    }
    const clientPhone = MessageLog.normalizePhone(client.contact_phone) || client.contact_phone;
    if (!clientPhone) {
      return res.status(400).json({ error: { message: 'Client phone number is invalid' } });
    }

    const voiceBase = getVoiceBaseUrl();
    if (!voiceBase) {
      return res.status(500).json({ error: { message: 'Voice webhook URL is not configured (TWILIO_VOICE_WEBHOOK_URL)' } });
    }

    const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const callLog = await CallLog.create({
      agencyId: client.agency_id || null,
      numberId: resolved.number.id || null,
      userId,
      clientId,
      direction: 'OUTBOUND',
      fromNumber: resolved.number.phone_number,
      toNumber: clientPhone,
      targetPhone: providerPhone,
      status: 'initiated',
      startedAt: nowIso,
      metadata: {
        provider: 'twilio',
        ownerType: resolved.ownerType || null,
        assignmentUserId: resolved.assignment?.user_id || null,
        agencyId: client.agency_id || null
      }
    });

    const token = signPayload({
      callLogId: callLog.id,
      userId,
      clientId,
      fromNumber: resolved.number.phone_number,
      toNumber: clientPhone
    });
    const bridgeUrl = `${voiceBase}/outbound-bridge?token=${encodeURIComponent(token)}`;
    const statusCallback = `${voiceBase}/status?callLogId=${callLog.id}`;

    const created = await TwilioService.createCall({
      to: providerPhone,
      from: resolved.number.phone_number,
      url: bridgeUrl,
      statusCallback,
      record: boolOrDefault(settings?.allow_call_recording, false)
    });

    const updated = await CallLog.updateById(callLog.id, {
      twilio_call_sid: created?.sid || null,
      status: created?.status || 'queued',
      metadata: {
        ...parseJsonObject(callLog.metadata),
        twilioStatus: created?.status || null
      }
    });
    await logAuditEvent(req, {
      actionType: 'outbound_call_started',
      agencyId: client.agency_id || null,
      metadata: {
        clientId,
        callLogId: updated?.id || callLog?.id || null,
        numberId: resolved?.number?.id || null,
        twilioCallSid: created?.sid || null
      }
    });

    res.status(201).json(updated);
  } catch (e) {
    await logAuditEvent(req, {
      actionType: 'outbound_call_failed',
      metadata: { error: String(e?.message || '').slice(0, 400) }
    });
    next(e);
  }
};

export const startConferenceCall = async (req, res, next) => {
  try {
    const userId = parseIntOrNull(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const clientId = parseIntOrNull(req.body?.clientId);
    if (!clientId) return res.status(400).json({ error: { message: 'clientId is required' } });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    const client = await Client.findById(clientId, { includeSensitive: true });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    if (!client.contact_phone) {
      return res.status(400).json({ error: { message: 'Client does not have a contact phone assigned' } });
    }
    await assertClientAgencyAccess(userId, client);

    const settings = await UserCallSettings.getByUserId(userId);
    const outboundEnabled = boolOrDefault(settings?.outbound_enabled, true);
    if (!outboundEnabled) {
      return res.status(403).json({ error: { message: 'Outbound calls are disabled in your call settings' } });
    }

    const resolved = await resolveOutboundNumber({
      userId,
      clientId,
      requestedNumberId: req.body?.numberId ? parseIntOrNull(req.body.numberId) : null
    });
    if (!resolved?.number?.phone_number) {
      return res.status(400).json({
        error: { message: 'You need a phone number assigned to you to make conference calls.' }
      });
    }

    const providerPhone = getProviderTargetPhone(user, settings);
    if (!providerPhone) {
      return res.status(400).json({ error: { message: 'No provider forwarding phone set.' } });
    }
    const clientPhone = MessageLog.normalizePhone(client.contact_phone) || client.contact_phone;
    if (!clientPhone) return res.status(400).json({ error: { message: 'Client phone number is invalid' } });

    const voiceBase = getVoiceBaseUrl();
    if (!voiceBase) {
      return res.status(500).json({ error: { message: 'Voice webhook URL is not configured' } });
    }

    const roomId = `conf-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const conferenceUrl = `${voiceBase}/conference-join?room=${encodeURIComponent(roomId)}`;

    const nowIso = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const callLog = await CallLog.create({
      agencyId: client.agency_id || null,
      numberId: resolved.number.id || null,
      userId,
      clientId,
      direction: 'OUTBOUND',
      fromNumber: resolved.number.phone_number,
      toNumber: clientPhone,
      targetPhone: providerPhone,
      status: 'initiated',
      startedAt: nowIso,
      metadata: {
        provider: 'twilio',
        conference: true,
        conferenceRoom: roomId,
        ownerType: resolved.ownerType || null,
        agencyId: client.agency_id || null
      }
    });

    const statusCallback = `${voiceBase}/status?callLogId=${callLog.id}`;

    const [providerCall, clientCall] = await Promise.all([
      TwilioService.createCall({
        to: providerPhone,
        from: resolved.number.phone_number,
        url: conferenceUrl,
        statusCallback,
        record: boolOrDefault(settings?.allow_call_recording, false)
      }),
      TwilioService.createCall({
        to: clientPhone,
        from: resolved.number.phone_number,
        url: conferenceUrl,
        statusCallback,
        record: false
      })
    ]);

    await CallLog.updateById(callLog.id, {
      twilio_call_sid: providerCall?.sid || null,
      status: 'in-progress',
      metadata: {
        ...parseJsonObject(callLog.metadata),
        clientCallSid: clientCall?.sid || null,
        twilioStatus: providerCall?.status || null
      }
    });

    await logAuditEvent(req, {
      actionType: 'conference_call_started',
      agencyId: client.agency_id || null,
      metadata: { clientId, callLogId: callLog.id, conferenceRoom: roomId }
    });

    res.status(201).json({
      ...callLog,
      id: callLog.id,
      twilio_call_sid: providerCall?.sid,
      status: 'in-progress',
      conference_room: roomId
    });
  } catch (e) {
    next(e);
  }
};

export const getTransferTargets = async (req, res, next) => {
  try {
    const userId = parseIntOrNull(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const agencyId = parseIntOrNull(req.query?.agencyId);
    const userAgencyIds = await getAgencyIdsForUser(userId);
    const agencyIds = agencyId
      ? (userAgencyIds.includes(agencyId) ? [agencyId] : userAgencyIds)
      : userAgencyIds;
    if (!agencyIds.length) return res.json({ users: [] });

    const placeholders = agencyIds.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.role
       FROM users u
       JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id IN (${placeholders})
       LEFT JOIN user_call_settings ucs ON ucs.user_id = u.id
       WHERE (u.is_archived = FALSE OR u.is_archived IS NULL)
         AND TRIM(COALESCE(ucs.forward_to_phone, u.personal_phone, u.work_phone, u.phone_number, '')) != ''
       ORDER BY u.first_name ASC, u.last_name ASC`,
      agencyIds
    );

    const users = (rows || []).map((r) => ({
      id: Number(r.id),
      first_name: r.first_name,
      last_name: r.last_name,
      role: r.role,
      label: [r.first_name, r.last_name].filter(Boolean).join(' ') || `User #${r.id}`
    }));
    return res.json({ users });
  } catch (e) {
    next(e);
  }
};

export const transferCall = async (req, res, next) => {
  try {
    const userId = parseIntOrNull(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const callSid = String(req.params?.callSid || '').trim();
    if (!callSid) return res.status(400).json({ error: { message: 'callSid is required' } });

    const toPhone = req.body?.toPhone;
    const toUserId = parseIntOrNull(req.body?.toUserId);
    if (!toPhone && !toUserId) {
      return res.status(400).json({ error: { message: 'toPhone or toUserId is required' } });
    }

    let targetPhone = toPhone ? MessageLog.normalizePhone(toPhone) || toPhone : null;
    if (!targetPhone && toUserId) {
      const targetUser = await User.findById(toUserId);
      const targetSettings = await UserCallSettings.getByUserId(toUserId);
      targetPhone = getProviderTargetPhone(targetUser, targetSettings);
    }
    if (!targetPhone) {
      return res.status(400).json({ error: { message: 'Could not resolve target phone number' } });
    }

    const voiceBase = getVoiceBaseUrl();
    if (!voiceBase) return res.status(500).json({ error: { message: 'Voice webhook URL is not configured' } });

    const callLog = await CallLog.findBySid(callSid);
    const fromNumber = callLog?.from_number || callLog?.to_number;
    const transferUrl = `${voiceBase}/transfer-dial?to=${encodeURIComponent(targetPhone)}${fromNumber ? `&callerId=${encodeURIComponent(fromNumber)}` : ''}`;
    await TwilioService.updateCall(callSid, { url: transferUrl });

    await logAuditEvent(req, {
      actionType: 'call_transferred',
      metadata: { callSid, toPhone: targetPhone }
    });

    res.json({ ok: true, callSid });
  } catch (e) {
    next(e);
  }
};

export const holdCall = async (req, res, next) => {
  try {
    const userId = parseIntOrNull(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const callSid = String(req.params?.callSid || '').trim();
    if (!callSid) return res.status(400).json({ error: { message: 'callSid is required' } });

    const voiceBase = getVoiceBaseUrl();
    if (!voiceBase) return res.status(500).json({ error: { message: 'Voice webhook URL is not configured' } });

    const callLog = await CallLog.findBySid(callSid);
    if (!callLog?.id) return res.status(404).json({ error: { message: 'Call not found' } });

    const resumeUrl = `${voiceBase}/resume?callLogId=${callLog.id}`;
    const md = parseJsonObject(callLog.metadata);
    await CallLog.updateById(callLog.id, {
      metadata: { ...md, hold_resume_url: resumeUrl, is_on_hold: true }
    });

    const holdMusicUrl = 'https://api.twilio.com/cowbell.mp3';
    const twiml = `<Response><Play loop="0">${holdMusicUrl}</Play></Response>`;
    await TwilioService.updateCall(callSid, { twiml });

    await logAuditEvent(req, {
      actionType: 'call_held',
      metadata: { callSid }
    });

    res.json({ ok: true, callSid, resumeUrl });
  } catch (e) {
    next(e);
  }
};

export const holdCallResume = async (req, res, next) => {
  try {
    const userId = parseIntOrNull(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const callSid = String(req.params?.callSid || '').trim();
    if (!callSid) return res.status(400).json({ error: { message: 'callSid is required' } });

    let resumeUrl = req.body?.resumeUrl || req.body?.url;
    if (!resumeUrl) {
      const callLog = await CallLog.findBySid(callSid);
      const md = parseJsonObject(callLog?.metadata);
      resumeUrl = md?.hold_resume_url || null;
    }
    if (!resumeUrl) {
      return res.status(400).json({ error: { message: 'Call is not on hold or resume URL is missing' } });
    }

    const callLog = await CallLog.findBySid(callSid);
    if (callLog?.id) {
      const md = parseJsonObject(callLog.metadata);
      await CallLog.updateById(callLog.id, {
        metadata: { ...md, hold_resume_url: undefined, is_on_hold: false }
      });
    }

    await TwilioService.updateCall(callSid, { url: resumeUrl });
    await logAuditEvent(req, { actionType: 'call_resumed', metadata: { callSid } });
    res.json({ ok: true, callSid });
  } catch (e) {
    next(e);
  }
};

export const listVoicemails = async (req, res, next) => {
  try {
    const userId = parseIntOrNull(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const role = String(req.user?.role || '').toLowerCase();
    const limitRaw = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 100;
    const daysRaw = req.query.days ? parseInt(req.query.days, 10) : 30;
    const days = Number.isFinite(daysRaw) ? Math.min(Math.max(daysRaw, 1), 365) : 30;
    const agencyIdParam = parseIntOrNull(req.query.agencyId);

    const agencyIds = await getAgencyIdsForUser(userId);
    const canAgencyScope = role === 'admin' || role === 'support' || role === 'super_admin' || role === 'clinical_practice_assistant' || role === 'provider_plus';

    let where = `cv.created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`;
    const params = [];

    if (canAgencyScope) {
      if (agencyIdParam) {
        where += ' AND cv.agency_id = ?';
        params.push(agencyIdParam);
      } else if (role !== 'super_admin') {
        if (!agencyIds.length) return res.json([]);
        where += ` AND cv.agency_id IN (${agencyIds.map(() => '?').join(',')})`;
        params.push(...agencyIds);
      }
    } else {
      const isProviderOrSchoolStaff = role === 'provider' || role === 'school_staff';
      let assignedNumberIds = [];
      if (isProviderOrSchoolStaff) {
        const assignments = await TwilioNumberAssignment.listByUserId(userId);
        assignedNumberIds = (assignments || []).map((a) => Number(a.number_id)).filter(Boolean);
      }
      if (assignedNumberIds.length > 0) {
        where += ` AND (cv.user_id = ? OR EXISTS (
          SELECT 1 FROM call_logs cl
          WHERE cl.id = cv.call_log_id AND cl.number_id IN (${assignedNumberIds.map(() => '?').join(',')})
        ))`;
        params.push(userId, ...assignedNumberIds);
      } else {
        where += ' AND cv.user_id = ?';
        params.push(userId);
      }
      if (agencyIds.length) {
        where += ` AND (cv.agency_id IN (${agencyIds.map(() => '?').join(',')}) OR cv.agency_id IS NULL)`;
        params.push(...agencyIds);
      }
    }

    const [rows] = await pool.execute(
      `SELECT cv.*
       FROM call_voicemails cv
       WHERE ${where}
       ORDER BY cv.created_at DESC
       LIMIT ?`,
      [...params, limit]
    );
    res.json(rows || []);
  } catch (e) {
    next(e);
  }
};

export const streamVoicemailAudio = async (req, res, next) => {
  try {
    const userId = parseIntOrNull(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const voicemailId = parseIntOrNull(req.params.voicemailId);
    if (!voicemailId) return res.status(400).json({ error: { message: 'Invalid voicemailId' } });

    const role = String(req.user?.role || '').toLowerCase();
    const row = await CallVoicemail.findById(voicemailId);
    if (!row) return res.status(404).json({ error: { message: 'Voicemail not found' } });

    const agencyIds = await getAgencyIdsForUser(userId);
    const canAgencyScope = role === 'admin' || role === 'support' || role === 'super_admin' || role === 'clinical_practice_assistant' || role === 'provider_plus';
    if (canAgencyScope) {
      if (role !== 'super_admin' && row.agency_id && !agencyIds.includes(Number(row.agency_id))) {
        return res.status(403).json({ error: { message: 'Access denied' } });
      }
    } else {
      const isProviderOrSchoolStaff = role === 'provider' || role === 'school_staff';
      let canAccess = Number(row.user_id) === Number(userId);
      if (!canAccess && isProviderOrSchoolStaff && row.call_log_id) {
        const [clRows] = await pool.execute('SELECT number_id FROM call_logs WHERE id = ?', [row.call_log_id]);
        const callLog = clRows?.[0];
        if (callLog?.number_id) {
          const assignments = await TwilioNumberAssignment.listByUserId(userId);
          const assignedIds = new Set((assignments || []).map((a) => Number(a.number_id)));
          canAccess = assignedIds.has(Number(callLog.number_id));
        }
      }
      if (!canAccess) return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const buffer = await TwilioService.downloadRecordingMedia({
      recordingSid: row.twilio_recording_sid,
      format: 'mp3'
    });
    await CallVoicemail.markListened(voicemailId);
    await logAuditEvent(req, {
      actionType: 'voicemail_listened',
      agencyId: row.agency_id || null,
      metadata: { voicemailId, callLogId: row.call_log_id || null }
    });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buffer.length));
    return res.status(200).send(buffer);
  } catch (e) {
    next(e);
  }
};

export const streamCallRecording = async (req, res, next) => {
  try {
    const userId = parseIntOrNull(req.user?.id);
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });

    const callLogId = parseIntOrNull(req.params?.callLogId);
    if (!callLogId) return res.status(400).json({ error: { message: 'Invalid callLogId' } });

    const callLog = await CallLog.findById(callLogId);
    if (!callLog) return res.status(404).json({ error: { message: 'Call not found' } });

    const md = parseJsonObject(callLog.metadata);
    const recordingSid = md?.recording_sid || null;
    if (!recordingSid) return res.status(404).json({ error: { message: 'No recording for this call' } });

    const role = String(req.user?.role || '').toLowerCase();
    const agencyIds = await getAgencyIdsForUser(userId);
    const canAgencyView = ['admin', 'support', 'super_admin', 'clinical_practice_assistant', 'provider_plus'].includes(role);
    const isProviderOrSchoolStaff = role === 'provider' || role === 'school_staff';

    let hasAccess = false;
    if (canAgencyView) {
      hasAccess = role === 'super_admin' || !callLog.agency_id || agencyIds.includes(Number(callLog.agency_id));
    } else if (isProviderOrSchoolStaff) {
      hasAccess = Number(callLog.user_id) === Number(userId);
      if (!hasAccess && callLog.number_id) {
        const assignments = await TwilioNumberAssignment.listByUserId(userId);
        hasAccess = (assignments || []).some((a) => Number(a.number_id) === Number(callLog.number_id));
      }
    }
    if (!hasAccess) return res.status(403).json({ error: { message: 'Access denied' } });

    const buffer = await TwilioService.downloadRecordingMedia({ recordingSid, format: 'mp3' });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(buffer.length));
    return res.status(200).send(buffer);
  } catch (e) {
    next(e);
  }
};

