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

export const getMedicaidStrikePolicy = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const {
      getAgencyMedicaidStrikePolicy
    } = await import('../services/appointmentChange.service.js');
    const out = await getAgencyMedicaidStrikePolicy(agencyId);
    res.json({ ok: true, ...out });
  } catch (e) {
    next(e);
  }
};

export const putMedicaidStrikePolicy = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can update this policy' } });
    }
    const {
      setAgencyMedicaidStrikePolicy
    } = await import('../services/appointmentChange.service.js');
    const enabled = req.body?.medicaidStrikePolicyEnabled === true
      || req.body?.enabled === true
      || req.body?.medicaid_strike_policy_enabled === true;
    const out = await setAgencyMedicaidStrikePolicy(agencyId, enabled);
    res.json({ ok: true, ...out });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const listAttendanceDischargeReviews = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    const ClientAttendanceDischargeReview = (
      await import('../models/ClientAttendanceDischargeReview.model.js')
    ).default;
    const reviews = await ClientAttendanceDischargeReview.listPendingForAgency(agencyId, {
      includeResolved: String(req.query.includeResolved || '') === 'true'
    });
    res.json({ ok: true, reviews });
  } catch (e) {
    next(e);
  }
};

export const decideAttendanceDischargeReview = async (req, res, next) => {
  try {
    const agencyId = parseInt(req.params.agencyId, 10);
    const reviewId = parseInt(req.params.reviewId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can decide discharge reviews' } });
    }
    const ClientAttendanceDischargeReview = (
      await import('../models/ClientAttendanceDischargeReview.model.js')
    ).default;
    const existing = await ClientAttendanceDischargeReview.findById(reviewId);
    if (!existing || Number(existing.agencyId) !== agencyId) {
      return res.status(404).json({ error: { message: 'Review not found' } });
    }
    const status = String(req.body?.status || '').toLowerCase();
    const review = await ClientAttendanceDischargeReview.decide(reviewId, {
      status,
      reason: req.body?.reason || null,
      comment: req.body?.comment || null,
      reviewedByUserId: req.user?.id || null
    });

    // Continue scheduling with waive: mark strike termination recommendation waived.
    if (status === 'continue_scheduling' && existing.strikeId) {
      try {
        const ClientMedicaidAttendanceStrike = (
          await import('../models/ClientMedicaidAttendanceStrike.model.js')
        ).default;
        await ClientMedicaidAttendanceStrike.waiveTerminationRecommendation(existing.strikeId, {
          reason: req.body?.reason || 'admin_continue_scheduling',
          comment: req.body?.comment || null,
          waivedByUserId: req.user?.id || null
        });
      } catch { /* best-effort */ }
    }

    res.json({
      ok: true,
      review,
      // Caller opens terminate UI; we never auto-terminate here.
      openTerminateClientId:
        status === 'proceed_to_termination' ? existing.clientId : null
    });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};
