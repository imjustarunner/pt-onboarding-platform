import BookingCancellationPolicy from '../models/BookingCancellationPolicy.model.js';
import User from '../models/User.model.js';
import pool from '../config/database.js';
import TenantService from '../models/TenantService.model.js';
import BookingPackage from '../models/BookingPackage.model.js';
import {resolveSelfPayQuote} from '../services/selfPayRates.service.js';
import {providerAttendanceFeeContext} from '../services/attendanceFeeRuleContext.service.js';
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
import appointmentStaffTools from '../services/appointmentStaffTools.service.js';
import { canceledSessionSummary } from '../services/canceledSessionSummary.service.js';
import { sessionCommunicationTimeline } from '../services/sessionCommunicationTimeline.js';

async function assertAgencyAccess(req, agencyId) {
  if(agencyId===null)return ['super_admin','superadmin'].includes(String(req.user?.role||'').toLowerCase());
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

async function assertPolicyTargets(agencyId, body) {
  for(const [key,alias,model] of [['tenantServiceId','tenant_service_id',TenantService],['bookingPackageId','booking_package_id',BookingPackage]]) {
    const id=body?.[key]??body?.[alias];
    if(id!=null&&id!==''&&(!agencyId||!Number.isSafeInteger(Number(id))||Number(id)<1||!await model.findById(Number(id),agencyId)))throw Object.assign(new Error('Choose a service or package belonging to this organization.'),{status:400});
  }
}

export async function cancellationPriceReference(req,res,next) {
  try {
    const agencyId=Number(req.params.agencyId);
    if(!await assertAgencyAccess(req,agencyId)||!canManage(req.user?.role))return res.status(403).json({error:{message:'Organization pricing administration is required.'}});
    const [providers]=await pool.execute(`SELECT u.id,CONCAT_WS(' ',u.first_name,u.last_name) name FROM users u JOIN user_agencies a ON a.user_id=u.id
      WHERE a.agency_id=? AND COALESCE(a.is_active,1)=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.role IN ('provider','provider_plus') ORDER BY u.first_name,u.last_name`,[agencyId]);
    const providerId=Number(req.query.providerId)||null;
    if(providerId&&!providers.some(provider=>Number(provider.id)===providerId))return res.status(403).json({error:{message:'Choose an active provider in this organization.'}});
    const services=await TenantService.listForAgency(agencyId,{includeInactive:false});
    const selected=services.filter(service=>service.isActive&&(!req.query.serviceId||Number(service.id)===Number(req.query.serviceId))).slice(0,100);
    const references=[];
    for(const service of selected){const quotes={};for(const modality of ['TELEHEALTH','IN_PERSON'])if(service.modality==='EITHER'||service.modality===modality){quotes[modality]=await resolveSelfPayQuote({agencyId,providerId,service,modality,durationMinutes:service.defaultDurationMinutes||60});}references.push({serviceId:service.id,name:service.name,serviceCode:service.serviceCode,businessType:service.businessType,durationMinutes:service.defaultDurationMinutes||60,quotes});}
    res.json({providers,references,placement:providerId?await providerAttendanceFeeContext({agencyId,providerUserId:providerId}):null});
  }catch(error){next(error);}
}

export const listCancellationPolicies = async (req, res, next) => {
  try {
    const agencyId = req.params.agencyId==='platform'?null:parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (agencyId!==null && String(req.query.ensureDefault || '') === 'true') {
      await ensureDefaultTenantPolicy(agencyId, req.user?.id || null);
    }
    const policies = await BookingCancellationPolicy.listForAgency(agencyId, {
      includeInactive: String(req.query.includeInactive || '') === 'true'
    });
    res.json({ ok: true, policies, ...(agencyId!==null?{platformDefaults:await BookingCancellationPolicy.listForAgency(null)}:{}) });
  } catch (e) {
    next(e);
  }
};

export const createCancellationPolicy = async (req, res, next) => {
  try {
    const agencyId = req.params.agencyId==='platform'?null:parseInt(req.params.agencyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can create policies' } });
    }
    if(agencyId!==null&&String(req.body?.scopeLevel||req.body?.scope_level||'').toLowerCase()==='platform')return res.status(403).json({error:{message:'Platform fee defaults require platform administration.'}});
    await assertPolicyTargets(agencyId,req.body);
    const policy = await BookingCancellationPolicy.create(agencyId, agencyId===null?{...req.body,scopeLevel:'platform'}:req.body || {}, req.user?.id || null);
    res.status(201).json({ ok: true, policy });
  } catch (e) {
    if (e?.status) return res.status(e.status).json({ error: { message: e.message } });
    next(e);
  }
};

export const updateCancellationPolicy = async (req, res, next) => {
  try {
    const agencyId = req.params.agencyId==='platform'?null:parseInt(req.params.agencyId, 10);
    const policyId = parseInt(req.params.policyId, 10);
    if (!(await assertAgencyAccess(req, agencyId))) {
      return res.status(403).json({ error: { message: 'Access denied' } });
    }
    if (!canManage(req.user?.role)) {
      return res.status(403).json({ error: { message: 'Only admins can update policies' } });
    }
    if(agencyId!==null&&String(req.body?.scopeLevel||req.body?.scope_level||'').toLowerCase()==='platform')return res.status(403).json({error:{message:'Platform fee defaults require platform administration.'}});
    await assertPolicyTargets(agencyId,req.body);
    const policy = await BookingCancellationPolicy.update(policyId, agencyId, agencyId===null?{...req.body,scopeLevel:'platform'}:req.body || {},req.user.id);
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
    const appointment = await appointmentStaffTools.authorize(req.user, appointmentId);
    const [reminders, communications] = await Promise.all([
      listReminders(appointmentId),
      listCommunications(appointmentId)
    ]);
    res.json({ ok: true, reminders, communications, timeline:sessionCommunicationTimeline(reminders,communications), cancellation:await canceledSessionSummary(appointment) });
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
