import twilio from 'twilio';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import MessageLog from '../models/MessageLog.model.js';
import CallLog from '../models/CallLog.model.js';
import CallVoicemail from '../models/CallVoicemail.model.js';
import UserCallSettings from '../models/UserCallSettings.model.js';
import { resolveInboundRoute } from '../services/twilioNumberRouting.service.js';
import { verifySignedPayload } from './calls.controller.js';
import TwilioService from '../services/twilio.service.js';

function twimlXml(builder) {
  const vr = new twilio.twiml.VoiceResponse();
  builder(vr);
  return vr.toString();
}

function voiceBaseFromRequest(req) {
  return `${req.protocol}://${req.get('host')}/api/twilio/voice`;
}

function nowSql() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ');
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

async function getAgencyVoiceConfig(agencyId) {
  if (!agencyId) {
    return {
      supportPhone: null,
      supportMessage: 'Please hold while we connect you to support.',
      providerRingTimeoutSeconds: 20
    };
  }
  const agency = await Agency.findById(agencyId);
  const flags = parseFeatureFlags(agency?.feature_flags);
  const supportPhone = MessageLog.normalizePhone(flags.voiceSupportFallbackPhone || agency?.phone_number) ||
    flags.voiceSupportFallbackPhone || agency?.phone_number || null;
  const supportPreConnectMessage = String(flags.voiceSupportPreConnectMessage || 'Please hold while we connect you to support.').trim();
  const providerPreConnectMessage = String(flags.voiceProviderPreConnectMessage || 'Please hold while we connect your call.').trim();
  const supportNoticeMessage = String(flags.voiceSupportFallbackMessage || 'A provider missed a callback attempt. Please follow up with the client.').trim();
  const timeoutRaw = Number(flags.voiceProviderRingTimeoutSeconds || 20);
  const providerRingTimeoutSeconds = Number.isFinite(timeoutRaw) ? Math.min(Math.max(timeoutRaw, 10), 60) : 20;
  return {
    supportPhone,
    supportPreConnectMessage,
    providerPreConnectMessage,
    supportNoticeMessage,
    providerRingTimeoutSeconds
  };
}

export const outboundBridgeWebhook = async (req, res, next) => {
  try {
    const token = String(req.query?.token || '').trim();
    const payload = verifySignedPayload(token);
    if (!payload?.callLogId) {
      return res.status(200).type('text/xml').send(twimlXml((vr) => {
        vr.say('We could not verify this call session.');
        vr.hangup();
      }));
    }

    const callLog = await CallLog.findById(payload.callLogId);
    if (!callLog) {
      return res.status(200).type('text/xml').send(twimlXml((vr) => {
        vr.say('This call is no longer available.');
        vr.hangup();
      }));
    }

    const toNumber = MessageLog.normalizePhone(payload.toNumber) || payload.toNumber || null;
    const fromNumber = MessageLog.normalizePhone(payload.fromNumber) || payload.fromNumber || null;
    if (!toNumber || !fromNumber) {
      return res.status(200).type('text/xml').send(twimlXml((vr) => {
        vr.say('We could not place this call due to missing routing information.');
        vr.hangup();
      }));
    }

    const base = voiceBaseFromRequest(req);
    await CallLog.updateById(callLog.id, {
      status: 'bridging',
      answered_at: nowSql(),
      parent_call_sid: req.body?.CallSid || callLog.parent_call_sid || null
    });

    const settings = callLog.user_id ? await UserCallSettings.getByUserId(callLog.user_id) : null;
    const cfg = await getAgencyVoiceConfig(callLog.agency_id);
    const dialAction = `${base}/dial-complete?callLogId=${callLog.id}`;
    const xml = twimlXml((vr) => {
      if (cfg.providerPreConnectMessage) vr.say(cfg.providerPreConnectMessage);
      const dial = vr.dial({
        callerId: fromNumber,
        action: dialAction,
        method: 'POST',
        timeout: cfg.providerRingTimeoutSeconds,
        record: boolOrDefault(settings?.allow_call_recording, false) ? 'record-from-answer' : undefined
      });
      dial.number({}, toNumber);
    });
    return res.status(200).type('text/xml').send(xml);
  } catch (e) {
    next(e);
  }
};

export const inboundVoiceWebhook = async (req, res, next) => {
  try {
    const from = req.body?.From;
    const to = req.body?.To;
    if (!from || !to) {
      return res.status(200).type('text/xml').send(twimlXml((vr) => {
        vr.say('We could not process your call.');
        vr.hangup();
      }));
    }

    const route = await resolveInboundRoute({ toNumber: to, fromNumber: from });
    const ownerUser = route?.ownerUser || null;
    if (!ownerUser?.id) {
      return res.status(200).type('text/xml').send(twimlXml((vr) => {
        vr.say('This number is not configured for voice calls.');
        vr.hangup();
      }));
    }

    const settings = await UserCallSettings.getByUserId(ownerUser.id);
    const inboundEnabled = boolOrDefault(settings?.inbound_enabled, true);
    if (!inboundEnabled) {
      return res.status(200).type('text/xml').send(twimlXml((vr) => {
        vr.say('The person you are trying to reach is not accepting calls right now.');
        vr.hangup();
      }));
    }

    const targetPhone = MessageLog.normalizePhone(settings?.forward_to_phone || ownerUser.personal_phone || ownerUser.work_phone || ownerUser.phone_number) ||
      settings?.forward_to_phone || ownerUser.personal_phone || ownerUser.work_phone || ownerUser.phone_number || null;
    if (!targetPhone) {
      return res.status(200).type('text/xml').send(twimlXml((vr) => {
        vr.say('The person you are trying to reach is unavailable.');
        vr.hangup();
      }));
    }

    const created = await CallLog.create({
      agencyId: route?.agencyId || null,
      numberId: route?.number?.id || null,
      userId: ownerUser.id,
      clientId: route?.clientId || null,
      direction: 'INBOUND',
      fromNumber: from,
      toNumber: to,
      targetPhone,
      twilioCallSid: req.body?.CallSid || null,
      status: 'inbound_received',
      startedAt: nowSql(),
      metadata: {
        provider: 'twilio',
        ownerType: route?.ownerType || null
      }
    });

    const base = voiceBaseFromRequest(req);
    const cfg = await getAgencyVoiceConfig(route?.agencyId || null);
    const dialAction = `${base}/dial-complete?callLogId=${created.id}`;
    const xml = twimlXml((vr) => {
      if (cfg.providerPreConnectMessage) vr.say(cfg.providerPreConnectMessage);
      const dial = vr.dial({
        callerId: MessageLog.normalizePhone(to) || to,
        action: dialAction,
        method: 'POST',
        timeout: cfg.providerRingTimeoutSeconds,
        record: boolOrDefault(settings?.allow_call_recording, false) ? 'record-from-answer' : undefined
      });
      dial.number({}, targetPhone);
    });
    return res.status(200).type('text/xml').send(xml);
  } catch (e) {
    next(e);
  }
};

export const voiceStatusWebhook = async (req, res, next) => {
  try {
    const callLogId = parseInt(req.query?.callLogId, 10);
    const sid = req.body?.CallSid || null;
    const parentSid = req.body?.ParentCallSid || null;
    const status = req.body?.CallStatus || req.body?.DialCallStatus || null;
    const duration = req.body?.CallDuration || req.body?.DialCallDuration || null;

    let target = null;
    if (Number.isFinite(callLogId) && callLogId > 0) {
      target = await CallLog.findById(callLogId);
    }
    if (!target && sid) {
      target = await CallLog.findBySid(sid);
    }
    if (!target && parentSid) {
      target = await CallLog.findBySid(parentSid);
    }
    if (target) {
      const doneStates = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);
      const statusNorm = String(status || '').toLowerCase();
      await CallLog.updateById(target.id, {
        twilio_call_sid: sid || target.twilio_call_sid || null,
        parent_call_sid: parentSid || target.parent_call_sid || null,
        status: status || target.status || null,
        duration_seconds: duration ?? target.duration_seconds ?? null,
        ended_at: doneStates.has(statusNorm) ? nowSql() : target.ended_at
      });

      // Outbound attempt where provider did not answer: notify/support escalation call.
      const metadata = parseJsonObject(target.metadata);
      const shouldEscalateOutboundMiss = target.direction === 'OUTBOUND' && statusNorm === 'no-answer';
      if (shouldEscalateOutboundMiss && !metadata.supportEscalationTriggered) {
        const cfg = await getAgencyVoiceConfig(target.agency_id || metadata?.agencyId || null);
        if (cfg.supportPhone && target.from_number) {
          try {
            const base = voiceBaseFromRequest(req);
            const noticeUrl = `${base}/support-notice?callLogId=${target.id}`;
            await TwilioService.createCall({
              to: cfg.supportPhone,
              from: target.from_number,
              url: noticeUrl,
              statusCallback: `${base}/status?callLogId=${target.id}`,
              record: false
            });
            await CallLog.updateById(target.id, {
              metadata: {
                ...metadata,
                supportEscalationTriggered: true,
                supportEscalationAt: new Date().toISOString()
              }
            });
          } catch {
            // Best-effort escalation; keep webhook 200 to avoid Twilio retries.
          }
        }
      }
    }
    return res.status(200).send('ok');
  } catch (e) {
    next(e);
  }
};

export const voiceDialCompleteWebhook = async (req, res, next) => {
  try {
    const callLogId = parseInt(req.query?.callLogId, 10);
    let callLog = null;
    let statusNorm = '';
    if (Number.isFinite(callLogId) && callLogId > 0) {
      callLog = await CallLog.findById(callLogId);
      const status = req.body?.DialCallStatus || req.body?.CallStatus || null;
      const duration = req.body?.DialCallDuration || req.body?.CallDuration || null;
      const sid = req.body?.DialCallSid || req.body?.CallSid || null;
      const doneStates = new Set(['completed', 'busy', 'failed', 'no-answer', 'canceled']);
      statusNorm = String(status || '').toLowerCase();
      await CallLog.updateById(callLogId, {
        twilio_call_sid: sid || null,
        status,
        duration_seconds: duration ?? null,
        ended_at: doneStates.has(statusNorm) ? nowSql() : null
      });
    }

    // Inbound caller path: if provider didn't answer, announce then connect caller to support.
    if (callLog && callLog.direction === 'INBOUND' && ['no-answer', 'busy', 'failed'].includes(statusNorm)) {
      const cfg = await getAgencyVoiceConfig(callLog.agency_id || null);
      if (cfg.supportPhone) {
        return res.status(200).type('text/xml').send(twimlXml((vr) => {
          vr.say(cfg.supportPreConnectMessage || 'Please hold while we connect you to support.');
          const dial = vr.dial({ callerId: callLog.to_number || undefined });
          dial.number({}, cfg.supportPhone);
        }));
      }
      const settings = callLog.user_id ? await UserCallSettings.getByUserId(callLog.user_id) : null;
      const voicemailEnabled = boolOrDefault(settings?.voicemail_enabled, false);
      if (voicemailEnabled) {
        const msg = String(settings?.voicemail_message || 'Sorry we missed your call. Please leave a message after the tone.').trim();
        const base = voiceBaseFromRequest(req);
        const action = `${base}/voicemail-complete?callLogId=${callLog.id}`;
        return res.status(200).type('text/xml').send(twimlXml((vr) => {
          vr.say(msg);
          vr.record({
            action,
            method: 'POST',
            maxLength: 180,
            playBeep: true,
            timeout: 5
          });
          vr.hangup();
        }));
      }
    }

    return res.status(200).type('text/xml').send(twimlXml((vr) => vr.hangup()));
  } catch (e) {
    next(e);
  }
};

export const voiceSupportNoticeWebhook = async (req, res, next) => {
  try {
    const callLogId = parseInt(req.query?.callLogId, 10);
    let msg = 'A provider missed a callback attempt. Please follow up with the client.';
    if (Number.isFinite(callLogId) && callLogId > 0) {
      const row = await CallLog.findById(callLogId);
      const cfg = await getAgencyVoiceConfig(row?.agency_id || null);
      msg = cfg.supportNoticeMessage || msg;
    }
    return res.status(200).type('text/xml').send(twimlXml((vr) => {
      vr.say(msg);
      vr.hangup();
    }));
  } catch (e) {
    next(e);
  }
};

export const voiceVoicemailCompleteWebhook = async (req, res, next) => {
  try {
    const callLogId = parseInt(req.query?.callLogId, 10);
    const recordingSid = req.body?.RecordingSid || null;
    const recordingUrl = req.body?.RecordingUrl || null;
    const duration = req.body?.RecordingDuration || null;
    const recordingStatus = req.body?.RecordingStatus || null;
    if (Number.isFinite(callLogId) && callLogId > 0 && recordingSid) {
      const callLog = await CallLog.findById(callLogId);
      if (callLog) {
        const vm = await CallVoicemail.create({
          callLogId: callLog.id,
          agencyId: callLog.agency_id || null,
          userId: callLog.user_id || null,
          clientId: callLog.client_id || null,
          fromNumber: callLog.from_number || null,
          toNumber: callLog.to_number || null,
          recordingSid,
          recordingUrl,
          durationSeconds: duration,
          status: recordingStatus || 'completed'
        });
        const md = parseJsonObject(callLog.metadata);
        await CallLog.updateById(callLog.id, {
          status: 'voicemail_recorded',
          metadata: {
            ...md,
            voicemailId: vm?.id || null,
            voicemailRecordingSid: recordingSid
          },
          ended_at: nowSql()
        });
      }
    }
    return res.status(200).type('text/xml').send(twimlXml((vr) => vr.hangup()));
  } catch (e) {
    next(e);
  }
};

