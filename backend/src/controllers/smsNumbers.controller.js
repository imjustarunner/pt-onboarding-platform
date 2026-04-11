import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import Client from '../models/Client.model.js';
import TwilioNumber from '../models/TwilioNumber.model.js';
import TwilioNumberAssignment from '../models/TwilioNumberAssignment.model.js';
import TwilioNumberRule from '../models/TwilioNumberRule.model.js';
import TwilioOptInState from '../models/TwilioOptInState.model.js';
import VonageService from '../services/vonage.service.js';
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
    const list = await VonageService.searchAvailableLocalNumbers({ areaCode, country, limit });
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

    const smsUrl = process.env.VONAGE_SMS_WEBHOOK_URL || null;
    const purchased = await VonageService.purchaseNumber({ phoneNumber, friendlyName, smsUrl });
    const record = await TwilioNumber.create({
      agencyId,
      phoneNumber: purchased.phoneNumber || phoneNumber,
      twilioSid: purchased.sid || null, // stores Vonage msisdn for API reference
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
      await VonageService.releaseNumber({ incomingPhoneNumberSid: number.twilio_sid });
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

export const listUserAssignedNumbers = async (req, res, next) => {
  try {
    const targetUserId = parseInt(req.params.userId, 10);
    if (!targetUserId) return res.status(400).json({ error: { message: 'Invalid userId' } });

    const role = String(req.user?.role || '').toLowerCase();
    const isAdmin = ['admin', 'support', 'super_admin', 'clinical_practice_assistant'].includes(role);
    if (!isAdmin && req.user?.id !== targetUserId) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }

    const assignments = await TwilioNumberAssignment.listByUserId(targetUserId);
    const numbers = assignments.map((a) => ({
      id: a.number_id,
      phone_number: a.phone_number,
      is_primary: a.is_primary === 1 || a.is_primary === true
    }));

    res.json({ numbers });
  } catch (e) {
    next(e);
  }
};

export const listUserAvailableNumbers = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const assignments = await TwilioNumberAssignment.listByUserId(userId);

    // Provider-only model: no agency numbers for client texting. Each provider/staff
    // must have their own assigned number. Agency numbers are for company events,
    // after-hours, etc., not for 1:1 client communication.
    res.json({
      assigned: assignments.map((a) => ({
        id: a.number_id,
        phone_number: a.phone_number,
        agency_id: a.agency_id,
        is_primary: a.is_primary === 1 || a.is_primary === true,
        owner_type: 'staff'
      })),
      agency: []
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

    // Provider-only model: return consent only for numbers the user is assigned to.
    const assignments = await TwilioNumberAssignment.listByUserId(req.user?.id);
    const assignedNumberIds = new Set((assignments || []).map((a) => Number(a.number_id)).filter(Boolean));
    const allNumbers = await TwilioNumber.listByAgency(client.agency_id, { includeInactive: false });
    const numbers =
      assignedNumberIds.size > 0 ? (allNumbers || []).filter((n) => assignedNumberIds.has(Number(n.id))) : [];

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

    // Provider-only model: non-admin can only update consent for numbers they're assigned to.
    const role = String(req.user?.role || '').toLowerCase();
    const isAdmin = ['admin', 'support', 'super_admin', 'clinical_practice_assistant'].includes(role);
    if (!isAdmin) {
      const assignments = await TwilioNumberAssignment.listByUserId(req.user?.id);
      const assignedIds = new Set((assignments || []).map((a) => Number(a.number_id)));
      if (!assignedIds.has(Number(numberId))) {
        return res.status(403).json({ error: { message: 'You can only update consent for numbers assigned to you' } });
      }
    }

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

    const expectedSmsUrl = normalizeUrl(process.env.VONAGE_SMS_WEBHOOK_URL);
    const expectedSmsConfigured = Boolean(expectedSmsUrl);

    const numbers = await TwilioNumber.listByAgency(agencyId, { includeInactive: true });
    const statuses = await Promise.all(
      (numbers || []).map(async (n) => {
        if (!n?.twilio_sid) {
          return {
            numberId: n.id,
            phoneNumber: n.phone_number,
            providerRef: null,
            provider: 'manual',
            smsUrl: null,
            smsMatches: false,
            canSync: false
          };
        }
        try {
          const fetched = await VonageService.getIncomingNumber({ incomingPhoneNumberSid: n.twilio_sid });
          const smsUrl = normalizeUrl(fetched?.smsUrl);
          return {
            numberId: n.id,
            phoneNumber: n.phone_number,
            providerRef: n.twilio_sid,
            provider: 'vonage',
            smsUrl,
            smsMatches: expectedSmsUrl ? smsUrl === expectedSmsUrl : false,
            canSync: true
          };
        } catch (e) {
          return {
            numberId: n.id,
            phoneNumber: n.phone_number,
            providerRef: n.twilio_sid,
            provider: 'vonage',
            error: e?.message || 'Failed to read Vonage number',
            smsUrl: null,
            smsMatches: false,
            canSync: true
          };
        }
      })
    );

    res.json({
      agencyId,
      expected: {
        smsUrl: expectedSmsUrl,
        smsConfigured: expectedSmsConfigured
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

    const smsUrl = normalizeUrl(process.env.VONAGE_SMS_WEBHOOK_URL);
    if (!smsUrl) {
      return res.status(400).json({ error: { message: 'No webhook URL configured. Set VONAGE_SMS_WEBHOOK_URL.' } });
    }

    const numbers = await TwilioNumber.listByAgency(agencyId, { includeInactive: true });
    const results = [];
    for (const n of numbers || []) {
      if (!n?.twilio_sid) {
        results.push({
          numberId: n.id,
          phoneNumber: n.phone_number,
          providerRef: null,
          synced: false,
          reason: 'manual_number_no_provider_ref'
        });
        continue;
      }
      try {
        const updated = await VonageService.updateIncomingNumberWebhooks({
          incomingPhoneNumberSid: n.twilio_sid,
          smsUrl: smsUrl || undefined
        });
        results.push({
          numberId: n.id,
          phoneNumber: n.phone_number,
          providerRef: n.twilio_sid,
          synced: true,
          smsUrl: normalizeUrl(updated?.smsUrl)
        });
      } catch (err) {
        results.push({
          numberId: n.id,
          phoneNumber: n.phone_number,
          providerRef: n.twilio_sid,
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
