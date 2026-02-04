import pool from '../config/database.js';
import Agency from '../models/Agency.model.js';
import User from '../models/User.model.js';
import TwilioNumber from '../models/TwilioNumber.model.js';
import TwilioNumberAssignment from '../models/TwilioNumberAssignment.model.js';
import TwilioNumberRule from '../models/TwilioNumberRule.model.js';
import TwilioService from '../services/twilio.service.js';
import { resolveOutboundNumber } from '../services/twilioNumberRouting.service.js';

const parseFeatureFlags = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object') return raw || {};
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
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
      smsDefaultUserId: flags.smsDefaultUserId || null
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
    const { smsNumbersEnabled, smsComplianceMode, smsDefaultUserId } = req.body || {};
    if (smsNumbersEnabled != null) flags.smsNumbersEnabled = !!smsNumbersEnabled;
    if (smsComplianceMode) flags.smsComplianceMode = String(smsComplianceMode);
    if (smsDefaultUserId !== undefined) flags.smsDefaultUserId = smsDefaultUserId ? Number(smsDefaultUserId) : null;

    await pool.execute('UPDATE agencies SET feature_flags = ? WHERE id = ?', [JSON.stringify(flags), agencyId]);
    res.json({
      agencyId,
      smsNumbersEnabled: flags.smsNumbersEnabled === true,
      smsComplianceMode: flags.smsComplianceMode || 'opt_in_required',
      smsDefaultUserId: flags.smsDefaultUserId || null
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
    const purchased = await TwilioService.purchaseNumber({ phoneNumber, friendlyName, smsUrl });
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
    const { numberId, userId, isPrimary } = req.body || {};
    const numId = parseInt(numberId, 10);
    const uid = parseInt(userId, 10);
    if (!numId || !uid) return res.status(400).json({ error: { message: 'numberId and userId are required' } });

    await assertNumberAccess(req, numId, { requireAdmin: true });
    const user = await User.findById(uid);
    if (!user) return res.status(404).json({ error: { message: 'User not found' } });

    const assignment = await TwilioNumberAssignment.assign({ numberId: numId, userId: uid, isPrimary: isPrimary !== false });
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
    if (!userId) return res.status(401).json({ error: { message: 'Not authenticated' } });
    const assignments = await TwilioNumberAssignment.listByUserId(userId);
    const assignedNumberIds = new Set(assignments.map((a) => Number(a.number_id)));

    const agencyIds = await User.getAgencies(userId);
    const agencyId = agencyIds?.[0]?.id || null;
    const agencyNumbers = agencyId ? await TwilioNumber.listByAgency(agencyId, { includeInactive: false }) : [];

    const availableAgencyNumbers = (agencyNumbers || []).filter((n) => !assignedNumberIds.has(Number(n.id)));

    res.json({
      assigned: assignments.map((a) => ({
        id: a.number_id,
        phone_number: a.phone_number,
        agency_id: a.agency_id,
        is_primary: a.is_primary === 1 || a.is_primary === true,
        owner_type: 'staff'
      })),
      agency: availableAgencyNumbers.map((n) => ({
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
