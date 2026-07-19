import Appointment from '../models/Appointment.model.js';
import TenantService from '../models/TenantService.model.js';
import StaffServiceAssignment from '../models/StaffServiceAssignment.model.js';
import AgencyBusinessType from '../models/AgencyBusinessType.model.js';
import BookingPackage from '../models/BookingPackage.model.js';
import {
  resolvePolicyForAppointmentContext,
  evaluateCancel
} from './bookingCancellationPolicy.service.js';
import BookingCancellationPolicy from '../models/BookingCancellationPolicy.model.js';
import {
  cancelPendingReminders,
  listReminders,
  listCommunications
} from './appointmentReminder.service.js';
import { scheduleSessionNotifications } from './sessionNotification.service.js';

function toMysqlDateTime(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())} ${pad(v.getHours())}:${pad(v.getMinutes())}:${pad(v.getSeconds())}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) return s.slice(0, 19);
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return toMysqlDateTime(d);
}

function participantModeFromList(participants = []) {
  const clients = (participants || []).filter((p) => {
    const role = String(p.role || 'client').toLowerCase();
    return role === 'client' || role === 'student';
  });
  return clients.length > 1 ? 'multi' : 'individual';
}

export async function resolveBookingOptions({
  agencyId,
  serviceId = null,
  providerId = null,
  clientId = null
} = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) throw Object.assign(new Error('agencyId is required'), { status: 400 });

  const businessTypes = await AgencyBusinessType.listForAgency(aid);
  const enabledTypes = new Set(
    businessTypes.filter((t) => t.isEnabled).map((t) => t.businessType)
  );
  let services = await TenantService.listForAgency(aid, { includeInactive: false });
  services = services.filter((s) => s.isStaffBookable && (!enabledTypes.size || enabledTypes.has(s.businessType)));

  if (providerId) {
    const allowed = new Set(await StaffServiceAssignment.listServiceIdsForUser(aid, providerId));
    // If staff has no assignments yet, keep all staff-bookable services (soft onboarding).
    if (allowed.size) services = services.filter((s) => allowed.has(s.id));
  }
  if (serviceId) {
    services = services.filter((s) => Number(s.id) === Number(serviceId));
  }

  let providers = [];
  if (serviceId) {
    providers = await StaffServiceAssignment.listForService(aid, serviceId);
  }

  let packagePreview = null;
  const cid = clientId ? Number(clientId) : null;
  if (cid) {
    try {
      let entitlements = await BookingPackage.listEntitlementsForClient(aid, cid, { status: 'ACTIVE' });
      if (serviceId) {
        const svc = services.find((s) => Number(s.id) === Number(serviceId))
          || await TenantService.findById(serviceId, aid);
        entitlements = entitlements.filter((e) => {
          if (svc?.businessType && e.businessType !== svc.businessType) return false;
          const allowed = e.allowedTenantServiceIds;
          if (Array.isArray(allowed) && allowed.length) {
            return allowed.map(Number).includes(Number(serviceId));
          }
          return true;
        });
      }
      packagePreview = {
        entitlements: entitlements.map((e) => ({
          id: e.id,
          packageId: e.packageId,
          packageName: e.packageName,
          businessType: e.businessType,
          sessionsRemaining: e.sessionsRemaining,
          sessionsReserved: e.sessionsReserved,
          consumeOn: e.consumeOn
        }))
      };
    } catch {
      packagePreview = { entitlements: [] };
    }
  }

  return {
    agencyId: aid,
    businessTypes: businessTypes.filter((t) => t.isEnabled),
    services,
    providers,
    clientId: cid,
    packagePreview
  };
}

export async function getAppointmentBundle(appointmentId, { includeTimeline = true } = {}) {
  const appt = await Appointment.findById(appointmentId);
  if (!appt) return null;
  const [participants, billing] = await Promise.all([
    Appointment.listParticipants(appt.id),
    Appointment.getBilling(appt.id)
  ]);
  let reminders = [];
  let communications = [];
  if (includeTimeline) {
    try {
      [reminders, communications] = await Promise.all([
        listReminders(appt.id),
        listCommunications(appt.id)
      ]);
    } catch {
      reminders = [];
      communications = [];
    }
  }
  return { ...appt, participants, billing, reminders, communications };
}

export async function createAppointment({
  agencyId,
  parentAgencyId = null,
  tenantServiceId = null,
  providerUserId = null,
  startAt,
  endAt,
  modality = null,
  officeLocationId = null,
  roomId = null,
  status = 'confirmed',
  officeEventId = null,
  providerScheduleEventId = null,
  clinicalSessionId = null,
  packageEntitlementId = null,
  source = 'staff_grid',
  title = null,
  notes = null,
  createdByUserId = null,
  participants = [],
  billing = null
} = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) throw Object.assign(new Error('agencyId is required'), { status: 400 });

  const start = toMysqlDateTime(startAt);
  const end = toMysqlDateTime(endAt);
  if (!start || !end) throw Object.assign(new Error('startAt and endAt are required'), { status: 400 });
  if (!(new Date(start).getTime() < new Date(end).getTime())) {
    throw Object.assign(new Error('endAt must be after startAt'), { status: 400 });
  }

  let businessType = null;
  let service = null;
  if (tenantServiceId) {
    service = await TenantService.findById(tenantServiceId, aid);
    if (!service || !service.isActive) {
      throw Object.assign(new Error('tenantServiceId not found'), { status: 400 });
    }
    businessType = service.businessType;
    if (providerUserId) {
      const allowed = await StaffServiceAssignment.listServiceIdsForUser(aid, providerUserId);
      if (allowed.length && !allowed.includes(Number(tenantServiceId))) {
        throw Object.assign(new Error('Provider is not assigned to this service'), { status: 400 });
      }
    }
  }

  const mode = participantModeFromList(participants);
  if (service && mode === 'multi' && !service.allowsGroup) {
    throw Object.assign(new Error('Selected service does not allow group/multi participants'), { status: 400 });
  }
  if (service && mode === 'individual' && !service.allowsIndividual) {
    throw Object.assign(new Error('Selected service does not allow individual sessions'), { status: 400 });
  }

  let cancellationPolicyId = service?.cancellationPolicyId || null;
  let cancelDeadlineAt = null;
  try {
    const resolved = await resolvePolicyForAppointmentContext({
      agencyId: aid,
      parentAgencyId,
      businessType,
      tenantServiceId,
      packageEntitlementId,
      cancellationPolicyId
    });
    if (resolved.policy?.id) cancellationPolicyId = resolved.policy.id;
    const noticeHours = Number(resolved.policy?.noticeHours ?? 24);
    const startDate = new Date(String(start).includes('T') ? start : String(start).replace(' ', 'T'));
    if (!Number.isNaN(startDate.getTime())) {
      cancelDeadlineAt = toMysqlDateTime(new Date(startDate.getTime() - noticeHours * 3600 * 1000));
    }
  } catch {
    /* defaults ok */
  }

  const appt = await Appointment.create({
    agencyId: aid,
    parentAgencyId,
    businessType,
    tenantServiceId: tenantServiceId || null,
    providerUserId: providerUserId || null,
    startAt: start,
    endAt: end,
    modality: modality || service?.modality || null,
    officeLocationId,
    roomId,
    status,
    participantMode: mode,
    officeEventId,
    providerScheduleEventId,
    clinicalSessionId,
    packageEntitlementId,
    cancellationPolicyId,
    cancelDeadlineAt,
    source,
    title: title || service?.name || null,
    notes,
    createdByUserId
  });

  if (participants?.length) {
    await Appointment.replaceParticipants(appt.id, participants);
  }
  if (billing || service || packageEntitlementId) {
    await Appointment.upsertBilling(appt.id, billing || {
      settlementMode: packageEntitlementId ? 'package' : (service?.billingMethod || 'self_pay'),
      amountCents: service?.priceCents ?? null,
      packageEntitlementId: packageEntitlementId || null,
      responsibleClientId: participants?.[0]?.clientId || null,
      responsiblePartyType: 'client'
    });
  }

  if (packageEntitlementId) {
    try {
      await BookingPackage.applyAppointmentUsage({
        entitlementId: packageEntitlementId,
        agencyId: aid,
        appointmentId: appt.id,
        mode: 'reserve',
        actorUserId: createdByUserId
      });
    } catch (e) {
      if (e?.status === 400) throw e;
    }
  }

  try {
    await scheduleSessionNotifications(appt.id, { replace: true });
  } catch {
    /* session notifications are best-effort */
  }

  return getAppointmentBundle(appt.id);
}

export async function updateAppointment(appointmentId, patch = {}, { actorUserId = null } = {}) {
  const existing = await Appointment.findById(appointmentId);
  if (!existing) return null;

  if (patch.participants) {
    const mode = participantModeFromList(patch.participants);
    patch.participantMode = mode;
    await Appointment.replaceParticipants(appointmentId, patch.participants);
  }
  if (patch.billing) {
    await Appointment.upsertBilling(appointmentId, patch.billing);
  }

  const startAt = patch.startAt != null ? toMysqlDateTime(patch.startAt) : existing.startAt;
  const endAt = patch.endAt != null ? toMysqlDateTime(patch.endAt) : existing.endAt;
  await Appointment.update(appointmentId, {
    ...patch,
    startAt,
    endAt,
    updatedByUserId: actorUserId
  });
  return getAppointmentBundle(appointmentId);
}

export async function cancelAppointment(appointmentId, {
  status = null,
  actorUserId = null,
  actorRole = 'staff',
  notes = null,
  reason = null,
  clientId = null,
  waive = false,
  waiverReason = null
} = {}) {
  const existing = await Appointment.findById(appointmentId);
  if (!existing) return null;

  const participants = await Appointment.listParticipants(appointmentId);
  const billingClientId = clientId
    || participants.find((p) => p.isBillingResponsible)?.clientId
    || participants.find((p) => p.clientId)?.clientId
    || null;

  const evaluation = await evaluateCancel({
    appointment: existing,
    actorRole,
    clientId: billingClientId,
    waive: !!waive
  });
  if (!evaluation.allowed) {
    throw Object.assign(new Error(evaluation.blockReason || 'Cancel not allowed'), {
      status: 403,
      code: 'CANCEL_NOT_ALLOWED',
      evaluation
    });
  }
  if (evaluation.requireReason && !String(reason || notes || '').trim() && !waive) {
    throw Object.assign(new Error('Cancellation reason is required by policy'), {
      status: 400,
      code: 'CANCEL_REASON_REQUIRED',
      evaluation
    });
  }

  const nextStatus = Appointment.normalizeStatus(
    status || evaluation.statusSuggestion || 'canceled_by_provider',
    'canceled_by_provider'
  );

  if (waive) {
    if (!String(waiverReason || reason || '').trim()) {
      throw Object.assign(new Error('Waiver reason is required'), { status: 400 });
    }
    await BookingCancellationPolicy.recordWaiver({
      agencyId: existing.agencyId,
      appointmentId: existing.id,
      policyId: evaluation.policy?.id || null,
      waivedFeeCents: evaluation.recommendedFeeCents || 0,
      packageActionOverridden: 'release',
      reason: waiverReason || reason,
      waivedByUserId: actorUserId
    });
  }

  const bundle = await updateAppointment(appointmentId, {
    status: nextStatus,
    notes: notes != null ? notes : undefined,
    cancellationPolicyId: evaluation.policy?.id || existing.cancellationPolicyId,
    cancelDeadlineAt: evaluation.cancelDeadlineAt
      ? toMysqlDateTime(evaluation.cancelDeadlineAt)
      : existing.cancelDeadlineAt,
    cancellationReason: reason || notes || null,
    cancellationFeeCents: waive ? 0 : evaluation.recommendedFeeCents,
    cancellationRecommendationJson: evaluation,
    canceledAt: toMysqlDateTime(new Date()),
    canceledByUserId: actorUserId,
    updatedByUserId: actorUserId
  }, { actorUserId });

  try {
    await cancelPendingReminders(appointmentId);
  } catch { /* ignore */ }

  const packageAction = waive ? 'release' : evaluation.recommendedPackageAction;
  if (existing.packageEntitlementId && packageAction === 'release') {
    try {
      await BookingPackage.applyAppointmentUsage({
        entitlementId: existing.packageEntitlementId,
        agencyId: existing.agencyId,
        appointmentId: existing.id,
        mode: 'release',
        actorUserId
      });
    } catch { /* best-effort */ }
  }
  // forfeit / review: leave reservation consumed (no release)

  return { ...bundle, cancellationEvaluation: evaluation };
}

/**
 * Best-effort upsert when an office slot is booked. Never throws to callers —
 * office booking must succeed even if appointments table is missing/flag off.
 */
export async function upsertAppointmentForOfficeBook({
  agencyId,
  officeEventId,
  providerUserId,
  clientId = null,
  startAt,
  endAt,
  modality = null,
  officeLocationId = null,
  roomId = null,
  tenantServiceId = null,
  title = null,
  actorUserId = null,
  appointmentTypeCode = null
} = {}) {
  try {
    const aid = Number(agencyId || 0);
    const oid = Number(officeEventId || 0);
    if (!aid || !oid) return null;

    const existing = await Appointment.findByOfficeEventId(oid);
    const participants = clientId
      ? [{ role: 'client', clientId: Number(clientId), isBillingResponsible: true }]
      : [];

    if (existing) {
      return updateAppointment(existing.id, {
        providerUserId: providerUserId || existing.providerUserId,
        startAt: startAt || existing.startAt,
        endAt: endAt || existing.endAt,
        modality: modality || existing.modality,
        officeLocationId: officeLocationId || existing.officeLocationId,
        roomId: roomId || existing.roomId,
        tenantServiceId: tenantServiceId || existing.tenantServiceId,
        title: title || existing.title,
        status: 'confirmed',
        participants: participants.length ? participants : undefined,
        source: 'office_book'
      }, { actorUserId });
    }

    return createAppointment({
      agencyId: aid,
      tenantServiceId,
      providerUserId,
      startAt,
      endAt,
      modality,
      officeLocationId,
      roomId,
      officeEventId: oid,
      source: 'office_book',
      title: title || (appointmentTypeCode ? String(appointmentTypeCode) : 'Office session'),
      createdByUserId: actorUserId,
      participants
    });
  } catch (e) {
    console.warn('[upsertAppointmentForOfficeBook]', e?.message || e);
    return null;
  }
}

export async function linkProviderScheduleEvent(appointmentId, providerScheduleEventId) {
  if (!appointmentId || !providerScheduleEventId) return null;
  return Appointment.update(appointmentId, {
    providerScheduleEventId: Number(providerScheduleEventId)
  });
}

export default {
  resolveBookingOptions,
  getAppointmentBundle,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  upsertAppointmentForOfficeBook,
  linkProviderScheduleEvent
};
