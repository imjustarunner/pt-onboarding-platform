import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import TwilioNumber from '../models/TwilioNumber.model.js';
import TwilioNumberAssignment from '../models/TwilioNumberAssignment.model.js';
import TwilioNumberRule from '../models/TwilioNumberRule.model.js';
import TwilioOptInState from '../models/TwilioOptInState.model.js';
import TwilioService from '../services/twilio.service.js';
import { resolveOutboundNumber, resolveReminderNumber } from '../services/twilioNumberRouting.service.js';
import { getTwilioUsage, checkUsageThresholds } from '../services/twilioUsageMonitoring.service.js';

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
};

const normalizeUrl = (value) => {
  const v = String(value || '').trim();
  return v || null;
};

async function assertNumberAccess(req, numberId, { requireAdmin = false } = {}) {
  const number = await TwilioNumber.findById(numberId);
  if (!number) {
    const err = new Error('Number not found');
    err.status = 404;
    throw err;
  }
  const role = req.user?.role;
  if (role === 'super_admin' || role === 'admin' || role === 'support') {
    return number;
  }
  if (requireAdmin) {
    const err = new Error('Admin access required');
    err.status = 403;
    throw err;
  }
  const agencies = await User.getAgencies(req.user.id);
  const hasAccess = (agencies || []).some((a) => Number(a?.id) === Number(number.agency_id));
  if (!hasAccess) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
  return number;
}

export const getAgencyTwilioUsage = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const agency = await Agency.findById(agencyId);
    if (!agency) return res.status(404).json({ error: { message: 'Agency not found' } });
    const { periodStart, periodEnd } = req.query || {};
    const usage = await getTwilioUsage(agencyId, { periodStart, periodEnd });
    const thresholds = await checkUsageThresholds(agencyId, usage);
    res.json({ agencyId, usage, thresholds });
  } catch (e) {
    next(e);
  }
};

export const getAgencySmsSettings = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const agency = await Agency.findById(agencyId);
    if (!agency) return res.status(404).json({ error: { message: 'Agency not found' } });
    const flags = parseFeatureFlags(agency.feature_flags);
    res.json({
      agencyId,
      smsNumbersEnabled: flags.smsNumbersEnabled === true,
      smsComplianceMode: flags.smsComplianceMode || 'opt_in_required',
      smsReminderSenderMode: flags.smsReminderSenderMode || 'agency_default',
      smsDefaultUserId: flags.smsDefaultUserId || null,
      companyEventsEnabled: flags.companyEventsEnabled === true,
      companyEventsSenderNumberId: flags.companyEventsSenderNumberId
        ? Number(flags.companyEventsSenderNumberId)
        : null,
      voiceSupportFallbackPhone: flags.voiceSupportFallbackPhone || null,
      voiceSupportFallbackMessage: flags.voiceSupportFallbackMessage || null,
      voiceProviderRingTimeoutSeconds: Number(flags.voiceProviderRingTimeoutSeconds || 20) || 20,
      voiceProviderPreConnectMessage: flags.voiceProviderPreConnectMessage || null,
      voiceSupportPreConnectMessage: flags.voiceSupportPreConnectMessage || null,
      smsSupportFallbackPhone: flags.smsSupportFallbackPhone || null,
      smsSupportEscalationHours: Number(flags.smsSupportEscalationHours || 12) || 12
    });
  } catch (e) {
    next(e);
  }
};

export const updateAgencySmsSettings = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const agency = await Agency.findById(agencyId);
    if (!agency) return res.status(404).json({ error: { message: 'Agency not found' } });
    const flags = parseFeatureFlags(agency.feature_flags);
    const {
      smsNumbersEnabled,
      smsComplianceMode,
      smsReminderSenderMode,
      smsDefaultUserId,
      companyEventsEnabled,
      companyEventsSenderNumberId,
      voiceSupportFallbackPhone,
      voiceSupportFallbackMessage,
      voiceProviderRingTimeoutSeconds,
      voiceProviderPreConnectMessage,
      voiceSupportPreConnectMessage,
      smsSupportFallbackPhone,
      smsSupportEscalationHours
    } = req.body || {};
    if (smsNumbersEnabled != null) flags.smsNumbersEnabled = !!smsNumbersEnabled;
    if (smsComplianceMode) flags.smsComplianceMode = String(smsComplianceMode);
    if (smsReminderSenderMode) flags.smsReminderSenderMode = String(smsReminderSenderMode);
    if (smsDefaultUserId !== undefined) flags.smsDefaultUserId = smsDefaultUserId ? Number(smsDefaultUserId) : null;
    if (companyEventsEnabled !== undefined) flags.companyEventsEnabled = !!companyEventsEnabled;
    if (companyEventsSenderNumberId !== undefined) {
      const parsedNumberId = companyEventsSenderNumberId ? Number(companyEventsSenderNumberId) : null;
      if (parsedNumberId) {
        const number = await TwilioNumber.findById(parsedNumberId);
        if (!number || Number(number.agency_id) !== Number(agencyId)) {
          return res.status(400).json({ error: { message: 'companyEventsSenderNumberId is invalid for this agency' } });
        }
        flags.companyEventsSenderNumberId = parsedNumberId;
        // Keep legacy key in sync for inbound short-code based matching.
        flags.company_events_short_code = number.phone_number || null;
      } else {
        flags.companyEventsSenderNumberId = null;
        flags.company_events_short_code = null;
      }
    }
    if (voiceSupportFallbackPhone !== undefined) {
      flags.voiceSupportFallbackPhone = voiceSupportFallbackPhone ? String(voiceSupportFallbackPhone).trim() : null;
    }
    if (voiceSupportFallbackMessage !== undefined) {
      flags.voiceSupportFallbackMessage = voiceSupportFallbackMessage ? String(voiceSupportFallbackMessage).trim() : null;
    }
    if (voiceProviderRingTimeoutSeconds !== undefined) {
      const n = parseInt(voiceProviderRingTimeoutSeconds, 10);
      flags.voiceProviderRingTimeoutSeconds = Number.isFinite(n) ? Math.min(Math.max(n, 10), 60) : 20;
    }
    if (voiceProviderPreConnectMessage !== undefined) {
      flags.voiceProviderPreConnectMessage = voiceProviderPreConnectMessage
        ? String(voiceProviderPreConnectMessage).trim()
        : null;
    }
    if (voiceSupportPreConnectMessage !== undefined) {
      flags.voiceSupportPreConnectMessage = voiceSupportPreConnectMessage
        ? String(voiceSupportPreConnectMessage).trim()
        : null;
    }
    if (smsSupportFallbackPhone !== undefined) {
      flags.smsSupportFallbackPhone = smsSupportFallbackPhone ? String(smsSupportFallbackPhone).trim() : null;
    }
    if (smsSupportEscalationHours !== undefined) {
      const n = parseInt(smsSupportEscalationHours, 10);
      flags.smsSupportEscalationHours = Number.isFinite(n) ? Math.min(Math.max(n, 1), 168) : 12;
    }

    await pool.execute('UPDATE agencies SET feature_flags = ? WHERE id = ?', [JSON.stringify(flags), agencyId]);
    res.json({
      agencyId,
      smsNumbersEnabled: flags.smsNumbersEnabled === true,
      smsComplianceMode: flags.smsComplianceMode || 'opt_in_required',
      smsReminderSenderMode: flags.smsReminderSenderMode || 'agency_default',
      smsDefaultUserId: flags.smsDefaultUserId || null,
      companyEventsEnabled: flags.companyEventsEnabled === true,
      companyEventsSenderNumberId: flags.companyEventsSenderNumberId
        ? Number(flags.companyEventsSenderNumberId)
        : null,
      voiceSupportFallbackPhone: flags.voiceSupportFallbackPhone || null,
      voiceSupportFallbackMessage: flags.voiceSupportFallbackMessage || null,
      voiceProviderRingTimeoutSeconds: Number(flags.voiceProviderRingTimeoutSeconds || 20) || 20,
      voiceProviderPreConnectMessage: flags.voiceProviderPreConnectMessage || null,
      voiceSupportPreConnectMessage: flags.voiceSupportPreConnectMessage || null,
      smsSupportFallbackPhone: flags.smsSupportFallbackPhone || null,
      smsSupportEscalationHours: Number(flags.smsSupportEscalationHours || 12) || 12
    });
  } catch (e) {
    next(e);
  }
};

export const listAgencyNumbers = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const numbers = await TwilioNumber.listByAgency(agencyId, { includeInactive: true });
    const withAssignments = await Promise.all(
      numbers.map(async (n) => {
        const assignments = await TwilioNumberAssignment.listByNumberId(n.id);
        return { ...n, assignments };
      })
    );
    res.json(withAssignments);
  } catch (e) {
    next(e);
  }
};

export const searchAvailableNumbers = async (req, res, next) => {
  try {
    const areaCodeRaw = req.body?.areaCode ?? req.query?.areaCode ?? null;
    const countryRaw = req.body?.country ?? req.query?.country ?? null;
    const areaCode = areaCodeRaw ? String(areaCodeRaw) : null;
    const country = countryRaw ? String(countryRaw) : 'US';
    const limitRaw = req.body?.limit ?? req.query?.limit;
    const limit = limitRaw ? Math.min(parseInt(limitRaw, 10), 50) : 20;
    const list = await TwilioService.searchAvailableLocalNumbers({ areaCode, country, limit });
    res.json(list);
  } catch (e) {
    next(e);
  }
};

export const purchaseNumber = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const { phoneNumber, friendlyName } = req.body || {};
    if (!phoneNumber) return res.status(400).json({ error: { message: 'phoneNumber is required' } });

    const smsUrl = process.env.TWILIO_SMS_WEBHOOK_URL || null;
    const voiceUrl = process.env.TWILIO_VOICE_WEBHOOK_URL || null;
    const purchased = await TwilioService.purchaseNumber({ phoneNumber, friendlyName, smsUrl, voiceUrl });
    const record = await TwilioNumber.create({
      agencyId,
      phoneNumber: purchased.phoneNumber || phoneNumber,
      twilioSid: purchased.sid || null,
      friendlyName: purchased.friendlyName || friendlyName || null,
      capabilities: purchased.capabilities || null,
      status: 'active'
    });
    res.status(201).json(record);
  } catch (e) {
    next(e);
  }
};

export const addManualNumber = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });
    const { phoneNumber, friendlyName } = req.body || {};
    if (!phoneNumber) return res.status(400).json({ error: { message: 'phoneNumber is required' } });
    const record = await TwilioNumber.create({ agencyId, phoneNumber, friendlyName, status: 'active' });
    res.status(201).json(record);
  } catch (e) {
    next(e);
  }
};

export const releaseNumber = async (req, res, next) => {
  try {
    const numberId = parseInt(req.params.numberId, 10);
    if (!numberId) return res.status(400).json({ error: { message: 'Invalid numberId' } });
    const number = await assertNumberAccess(req, numberId, { requireAdmin: true });
    if (number.twilio_sid) {
      await TwilioService.releaseNumber({ incomingPhoneNumberSid: number.twilio_sid });
    }
    const updated = await TwilioNumber.markReleased(numberId);
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const assignNumber = async (req, res, next) => {
  try {
    const { numberId, userId, isPrimary, addToPool } = req.body || {};
    const numId = parseInt(numberId, 10);
    const uid = parseInt(userId, 10);
    if (!numId || !uid) return res.status(400).json({ error: { message: 'numberId and userId are required' } });

    await assertNumberAccess(req, numId, { requireAdmin: true });
    const user = await User.findById(uid);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    const assignment = addToPool
      ? await TwilioNumberAssignment.addToPool({
          numberId: numId,
          userId: uid,
          smsAccessEnabled: true,
          isPrimary: isPrimary === true
        })
      : await TwilioNumberAssignment.assign({
          numberId: numId,
          userId: uid,
          isPrimary: isPrimary !== false,
          replaceExisting: true
        });
    res.json({ assignment });
  } catch (e) {
    next(e);
  }
};

export const setSmsAccess = async (req, res, next) => {
  try {
    const { numberId, userId, enabled } = req.body || {};
    const numId = parseInt(numberId, 10);
    const uid = parseInt(userId, 10);
    if (!numId || !uid) return res.status(400).json({ error: { message: 'numberId and userId are required' } });
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: { message: 'enabled must be a boolean' } });

    await assertNumberAccess(req, numId, { requireAdmin: true });
    const assignment = await TwilioNumberAssignment.setSmsAccess({ numberId: numId, userId: uid, enabled });
    res.json({ assignment });
  } catch (e) {
    next(e);
  }
};

export const unassignNumber = async (req, res, next) => {
  try {
    const { numberId, userId } = req.body || {};
    const numId = parseInt(numberId, 10);
    const uid = parseInt(userId, 10);
    if (!numId || !uid) return res.status(400).json({ error: { message: 'numberId and userId are required' } });
    await assertNumberAccess(req, numId, { requireAdmin: true });
    await TwilioNumberAssignment.unassign({ numberId: numId, userId: uid });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
};

export const listUserAvailableNumbers = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const role = String(req.user?.role || '').toLowerCase();
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const assignments = await TwilioNumberAssignment.listByUserId(userId);
    const assignedNumberIds = new Set(assignments.map((a) => Number(a.number_id)));

    // Providers see only their assigned numbers (no agency/platform numbers they are not assigned to)
    const isProviderOnly = role === 'provider' || role === 'school_staff';
    let agencyNumbers = [];
    if (!isProviderOnly) {
      const agencyIds = await User.getAgencies(userId);
      const agencyId = agencyIds?.[0]?.id || null;
      const numbers = agencyId ? await TwilioNumber.listByAgency(agencyId, { includeInactive: false }) : [];
      agencyNumbers = (numbers || []).filter((n) => !assignedNumberIds.has(Number(n.id)));
    }

    res.json({
      assigned: assignments.map((a) => ({
        id: a.number_id,
        phone_number: a.phone_number,
        agency_id: a.agency_id,
        is_primary: a.is_primary === 1 || a.is_primary === true,
        owner_type: 'staff'
      })),
      agency: agencyNumbers.map((n) => ({
        id: n.id,
        phone_number: n.phone_number,
        agency_id: n.agency_id,
        owner_type: 'agency'
      }))
    });
  } catch (e) {
    next(e);
  }
};

export const getNumberRules = async (req, res, next) => {
  try {
    const numberId = parseInt(req.params.numberId, 10);
    if (!numberId) return res.status(400).json({ error: { message: 'Invalid numberId' } });
    await assertNumberAccess(req, numberId, { requireAdmin: false });
    const rules = await TwilioNumberRule.listByNumberId(numberId);
    res.json(rules);
  } catch (e) {
    next(e);
  }
};

export const upsertNumberRules = async (req, res, next) => {
  try {
    const numberId = parseInt(req.params.numberId, 10);
    if (!numberId) return res.status(400).json({ error: { message: 'Invalid numberId' } });
    await assertNumberAccess(req, numberId, { requireAdmin: true });
    const { rules } = req.body || {};
    if (!Array.isArray(rules)) return res.status(400).json({ error: { message: 'rules must be an array' } });
    const updated = [];
    for (const r of rules) {
      if (!r?.rule_type) continue;
      const rule = await TwilioNumberRule.upsert({
        numberId,
        ruleType: r.rule_type,
        scheduleJson: r.schedule_json || null,
        autoReplyText: r.auto_reply_text || null,
        forwardToUserId: r.forward_to_user_id || null,
        forwardToPhone: r.forward_to_phone || null,
        enabled: r.enabled !== false
      });
      if (rule) updated.push(rule);
    }
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const resolveOutboundPreview = async (req, res, next) => {
  try {
    const { clientId, numberId } = req.query || {};
    const resolved = await resolveOutboundNumber({
      userId: req.user?.id,
      clientId: clientId ? parseInt(clientId, 10) : null,
      requestedNumberId: numberId ? parseInt(numberId, 10) : null
    });
    if (!resolved?.number) return res.status(404).json({ error: { message: 'No available number' } });
    res.json({
      number: resolved.number,
      ownerType: resolved.ownerType
    });
  } catch (e) {
    next(e);
  }
};

export const resolveReminderPreview = async (req, res, next) => {
  try {
    const { clientId, providerUserId } = req.query || {};
    const providerId = providerUserId ? parseInt(providerUserId, 10) : req.user?.id;
    const resolved = await resolveReminderNumber({
      providerUserId: providerId,
      clientId: clientId ? parseInt(clientId, 10) : null
    });
    if (!resolved?.number) return res.status(404).json({ error: { message: 'No available reminder number' } });
    res.json({
      number: resolved.number,
      ownerType: resolved.ownerType
    });
  } catch (e) {
    next(e);
  }
};

export const getClientConsentStates = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    if (!clientId) return res.status(400).json({ error: { message: 'Invalid clientId' } });
    const client = await Client.findById(clientId, { includeSensitive: false });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    const requesterAgencies = await User.getAgencies(req.user?.id);
    const ok = (requesterAgencies || []).some((a) => Number(a?.id) === Number(client.agency_id));
    if (!ok && req.user?.role !== 'super_admin') return res.status(403).json({ error: { message: 'Access denied' } });

    const numbers = await TwilioNumber.listByAgency(client.agency_id, { includeInactive: false });
    const states = [];
    for (const n of numbers || []) {
      const state = await TwilioOptInState.findByClientNumber({ clientId, numberId: n.id });
      states.push({
        numberId: n.id,
        phoneNumber: n.phone_number,
        status: state?.status || 'pending',
        source: state?.source || null,
        updatedAt: state?.updated_at || null
      });
    }
    res.json({
      clientId,
      agencyId: client.agency_id,
      states
    });
  } catch (e) {
    next(e);
  }
};

export const updateClientConsentState = async (req, res, next) => {
  try {
    const clientId = parseInt(req.params.clientId, 10);
    const numberId = parseInt(req.body?.numberId, 10);
    const status = String(req.body?.status || '').trim().toLowerCase();
    if (!clientId || !numberId) {
      return res.status(400).json({ error: { message: 'clientId and numberId are required' } });
    }
    if (!['opted_in', 'opted_out', 'pending'].includes(status)) {
      return res.status(400).json({ error: { message: 'status must be opted_in, opted_out, or pending' } });
    }
    const client = await Client.findById(clientId, { includeSensitive: false });
    if (!client) return res.status(404).json({ error: { message: 'Client not found' } });
    const number = await TwilioNumber.findById(numberId);
    if (!number || Number(number.agency_id) !== Number(client.agency_id)) {
      return res.status(400).json({ error: { message: 'Selected number is invalid for this client agency' } });
    }
    const requesterAgencies = await User.getAgencies(req.user?.id);
    const ok = (requesterAgencies || []).some((a) => Number(a?.id) === Number(client.agency_id));
    if (!ok && req.user?.role !== 'super_admin') return res.status(403).json({ error: { message: 'Access denied' } });

    const updated = await TwilioOptInState.upsert({
      agencyId: client.agency_id,
      clientId,
      numberId,
      status,
      source: req.body?.source || 'manual_update'
    });
    res.json(updated);
  } catch (e) {
    next(e);
  }
};

export const getAgencyWebhookStatus = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });

    const expectedSmsUrl = normalizeUrl(process.env.TWILIO_SMS_WEBHOOK_URL);
    const expectedVoiceUrl = normalizeUrl(process.env.TWILIO_VOICE_WEBHOOK_URL);
    const expectedSmsConfigured = Boolean(expectedSmsUrl);
    const expectedVoiceConfigured = Boolean(expectedVoiceUrl);

    const numbers = await TwilioNumber.listByAgency(agencyId, { includeInactive: true });
    const statuses = await Promise.all(
      (numbers || []).map(async (n) => {
        if (!n?.twilio_sid) {
          return {
            numberId: n.id,
            phoneNumber: n.phone_number,
            twilioSid: null,
            provider: 'manual',
            smsUrl: null,
            voiceUrl: null,
            smsMatches: false,
            voiceMatches: false,
            canSync: false
          };
        }
        try {
          const fetched = await TwilioService.getIncomingNumber({ incomingPhoneNumberSid: n.twilio_sid });
          const smsUrl = normalizeUrl(fetched?.smsUrl || fetched?.sms_url);
          const voiceUrl = normalizeUrl(fetched?.voiceUrl || fetched?.voice_url);
          return {
            numberId: n.id,
            phoneNumber: n.phone_number,
            twilioSid: n.twilio_sid,
            provider: 'twilio',
            smsUrl,
            voiceUrl,
            smsMatches: expectedSmsUrl ? smsUrl === expectedSmsUrl : false,
            voiceMatches: expectedVoiceUrl ? voiceUrl === expectedVoiceUrl : false,
            canSync: true
          };
        } catch (e) {
          return {
            numberId: n.id,
            phoneNumber: n.phone_number,
            twilioSid: n.twilio_sid,
            provider: 'twilio',
            error: e?.message || 'Failed to read Twilio number',
            smsUrl: null,
            voiceUrl: null,
            smsMatches: false,
            voiceMatches: false,
            canSync: true
          };
        }
      })
    );

    res.json({
      agencyId,
      expected: {
        smsUrl: expectedSmsUrl,
        voiceUrl: expectedVoiceUrl,
        smsConfigured: expectedSmsConfigured,
        voiceConfigured: expectedVoiceConfigured
      },
      statuses
    });
  } catch (e) {
    next(e);
  }
};

export const syncAgencyWebhooks = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!agencyId) return res.status(400).json({ error: { message: 'Invalid agencyId' } });

    const smsUrl = normalizeUrl(process.env.TWILIO_SMS_WEBHOOK_URL);
    const voiceUrl = normalizeUrl(process.env.TWILIO_VOICE_WEBHOOK_URL);
    if (!smsUrl && !voiceUrl) {
      return res.status(400).json({ error: { message: 'No webhook URLs configured. Set TWILIO_SMS_WEBHOOK_URL and/or TWILIO_VOICE_WEBHOOK_URL.' } });
    }

    const numbers = await TwilioNumber.listByAgency(agencyId, { includeInactive: true });
    const results = [];
    for (const n of numbers || []) {
      if (!n?.twilio_sid) {
        results.push({
          numberId: n.id,
          phoneNumber: n.phone_number,
          twilioSid: null,
          synced: false,
          reason: 'manual_number_no_twilio_sid'
        });
        continue;
      }
      try {
        const updated = await TwilioService.updateIncomingNumberWebhooks({
          incomingPhoneNumberSid: n.twilio_sid,
          smsUrl: smsUrl || undefined,
          voiceUrl: voiceUrl || undefined
        });
        results.push({
          numberId: n.id,
          phoneNumber: n.phone_number,
          twilioSid: n.twilio_sid,
          synced: true,
          smsUrl: normalizeUrl(updated?.smsUrl || updated?.sms_url),
          voiceUrl: normalizeUrl(updated?.voiceUrl || updated?.voice_url)
        });
      } catch (err) {
        results.push({
          numberId: n.id,
          phoneNumber: n.phone_number,
          twilioSid: n.twilio_sid,
          synced: false,
          error: err?.message || 'Failed to sync webhooks'
        });
      }
    }

    res.json({
      agencyId,
      requested: { smsUrl, voiceUrl },
      results
    });
  } catch (e) {
    next(e);
  }
};
