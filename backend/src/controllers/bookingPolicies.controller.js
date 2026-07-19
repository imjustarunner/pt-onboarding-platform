import BookingCancellationPolicy from '../models/BookingCancellationPolicy.model.js';
import User from '../models/User.model.js';
import {
  ensureDefaultTenantPolicy,
  evaluateCancel,
  resolvePolicyForAppointmentContext
} from '../services/bookingCancellationPolicy.service.js';
import {
  processDueReminders,
  ingestInboundReply,
  listReminders,
  listCommunications,
  scheduleRemindersForAppointment
} from '../services/appointmentReminder.service.js';
import Appointment from '../models/Appointment.model.js';

async function assertAgencyAccess(req, agencyId) {
  const aid = Number(agencyId || 0);
  if (!aid) return false;
  const role = String(req.user?.role || '').toLowerCase();
  if (role === 'super_admin' || role === 'superadmin') return true;
  try {
    const agencies = await User.getAgencies(req.user.id);
    return (agencies || []).some((a) => Number(a.id) === aid);
  } catch {
    return false;
  }
}

function canManage(role) {
  const r = String(role || '').toLowerCase();
  return ['super_admin', 'superadmin', 'admin', 'agency_admin', 'backoffice_admin'].includes(r);
}

export const listCancellationPolicies = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (String(req.query.ensureDefault || '') === 'true') {
      await ensureDefaultTenantPolicy(agencyId, req.user?.id || null);
    }
    const policies = await BookingCancellationPolicy.listForAgency(agencyId, {
      includeInactive: String(req.query.includeInactive || '') === 'true'
    });
    res.json({ ok: true, policies });
  } catch (e) {
    next(e);
  }
};

export const createCancellationPolicy = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can create policies' } });
    }
    const policy = await BookingCancellationPolicy.create(agencyId, req.body || {}, req.user?.id || null);
    res.status(201).json({ ok: true, policy });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const updateCancellationPolicy = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const policyId = parseInt(req.params.policyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can update policies' } });
    }
    const policy = await BookingCancellationPolicy.update(policyId, agencyId, req.body || {});
    if (!policy) return res.status(404).json({ error: { message: 'Policy not found' } });
    res.json({ ok: true, policy });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const evaluateAppointmentCancel = async (req, res, next) => {
  try {
    const appointmentId = parseInt(req.params.id, 10);
    const appt = await Appointment.findById(appointmentId);
    if (!appt) return res.status(404).json({ error: { message: 'Appointment not found' } });
    if (!(await assertAgencyAccess(req, appt.agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const evaluation = await evaluateCancel({
      appointment: appt,
      actorRole: req.body?.actorRole || req.query.actorRole || req.user?.role || 'staff',
      clientId: req.body?.clientId || req.query.clientId || null,
      waive: req.body?.waive === true || req.query.waive === 'true'
    });
    res.json({ ok: true, evaluation });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const resolvePolicyPreview = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const resolved = await resolvePolicyForAppointmentContext({
      agencyId,
      parentAgencyId: req.query.parentAgencyId || null,
      businessType: req.query.businessType || null,
      tenantServiceId: req.query.tenantServiceId || null,
      packageEntitlementId: req.query.packageEntitlementId || null,
      cancellationPolicyId: req.query.cancellationPolicyId || null
    });
    res.json({ ok: true, ...resolved });
  } catch (e) {
    next(e);
  }
};

export const getAppointmentTimeline = async (req, res, next) => {
  try {
    const appointmentId = parseInt(req.params.id, 10);
    const appt = await Appointment.findById(appointmentId);
    if (!appt) return res.status(404).json({ error: { message: 'Appointment not found' } });
    if (!(await assertAgencyAccess(req, appt.agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const [reminders, communications] = await Promise.all([
      listReminders(appointmentId),
      listCommunications(appointmentId)
    ]);
    res.json({ ok: true, reminders, communications });
  } catch (e) {
    next(e);
  }
};

export const rescheduleAppointmentReminders = async (req, res, next) => {
  try {
    const appointmentId = parseInt(req.params.id, 10);
    const appt = await Appointment.findById(appointmentId);
    if (!appt) return res.status(404).json({ error: { message: 'Appointment not found' } });
    if (!(await assertAgencyAccess(req, appt.agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const reminders = await scheduleRemindersForAppointment(appointmentId, { replace: true });
    res.json({ ok: true, reminders });
  } catch (e) {
    next(e);
  }
};

export const runReminderCron = async (req, res, next) => {
  try {
    const secret = String(req.get('x-cron-secret') || req.body?.cronSecret || '').trim();
    const expected = String(process.env.CRON_SECRET || process.env.BOOKING_CRON_SECRET || '').trim();
    if (!expected || secret !== expected) {
      return res.status(401).json({ error: { message: 'Unauthorized cron request' } });
    }
    const result = await processDueReminders({
      limit: Number(req.body?.limit || req.query.limit || 50)
    });
    res.json({ ok: true, ...result });
  } catch (e) {
    next(e);
  }
};

export const ingestAppointmentReply = async (req, res, next) => {
  try {
    const appointmentId = parseInt(req.params.id, 10);
    const appt = await Appointment.findById(appointmentId);
    if (!appt) return res.status(404).json({ error: { message: 'Appointment not found' } });
    if (!(await assertAgencyAccess(req, appt.agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const out = await ingestInboundReply({
      appointmentId,
      agencyId: appt.agencyId,
      channel: req.body?.channel || 'sms',
      rawBody: req.body?.body || req.body?.rawBody || '',
      autoApply: req.body?.autoApply !== false,
      clientId: req.body?.clientId || null
    });
    res.json({
      ok: true,
      ...out,
      replyHelp: 'Y = confirm, N = cancel, R = reschedule'
    });
  } catch (e) {
    next(e);
  }
};
