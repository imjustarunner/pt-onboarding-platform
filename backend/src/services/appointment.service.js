import pool from '../config/database.js';
import AgencyServiceLocation from '../models/AgencyServiceLocation.model.js';
import { ensureAppointmentClinicalLink, assertAppointmentClients } from './appointmentClinicalLink.service.js';
import User from '../models/User.model.js';
import { validateSchedulingSelection } from './schedulingTaxonomy.service.js';
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
import { settleAppointmentOutcome } from './appointmentSettlement.service.js';
import {
  dateToMysqlUtcDateTime,
  wallMysqlToUtcMysql,
  normalizeWallMysqlDatetime,
  DEFAULT_SCHEDULE_TZ
} from '../utils/zonedWallTime.util.js';

/** Store appointment instants as UTC MySQL DATETIME. */
function toMysqlDateTime(v, timeZone = DEFAULT_SCHEDULE_TZ) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return dateToMysqlUtcDateTime(v);
  }
  const s = String(v).trim();
  if (/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return dateToMysqlUtcDateTime(new Date(s));
  }
  const wall = normalizeWallMysqlDatetime(s);
  if (!wall) return null;
  // Prefer converting wall → UTC; if already UTC digits post-migration, wallMysql still
  // needs the correct zone — callers should pass ISO-Z after migration when possible.
  return wallMysqlToUtcMysql(wall, timeZone) || wall;
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
  const staffBookable = services.filter((s) => s.isStaffBookable);
  services = staffBookable.filter((s) => !enabledTypes.size || enabledTypes.has(s.businessType));
  // Soft fallback: if business-type filter wipes the catalog, still offer staff-bookable services.
  if (!services.length && staffBookable.length) services = staffBookable;

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
  status = 'scheduled',
  officeEventId = null,
  officeBookingRequestId = null,
  providerScheduleEventId = null,
  clinicalSessionId = null,
  packageEntitlementId = null,
  source = 'staff_grid',
  title = null,
  notes = null,
  othersPresentNames = null,
  videoRoomMode = 'unique_session',
  notificationMode = 'default',
  createdByUserId = null,
  participants = [],
  billing = null,
  serviceCode = null,
  addonServiceCodes = [],
  ensureContext = true,
  timeZone = DEFAULT_SCHEDULE_TZ,
  serviceLocationId = null
} = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) throw Object.assign(new Error('agencyId is required'), { status: 400 });

  const start = toMysqlDateTime(startAt, timeZone);
  const end = toMysqlDateTime(endAt, timeZone);
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

  const bookingClients = await assertAppointmentClients(aid, participants);
  if (serviceLocationId) {
    const location = await AgencyServiceLocation.findById(serviceLocationId);
    if (!location || Number(location.agency_id) !== aid) {
      throw Object.assign(new Error('Service location does not belong to this agency'), { status: 403 });
    }
  }
  serviceCode = serviceCode || service?.serviceCode || null;
  const clinicalBooking = !packageEntitlementId && (['mental_health', 'healthcare'].includes(businessType)
    || (!businessType && bookingClients.some((client) => ['clinical', 'school'].includes(client.client_type))));
  if (clinicalBooking && !serviceCode) throw Object.assign(new Error('A service code is required for a clinical session'), { status: 400 });
  if (providerUserId) {
    const memberships = await User.getAgencies(providerUserId);
    if (!memberships.some((a) => Number(a.id) === aid)) throw Object.assign(new Error('Provider is not assigned to this agency'), { status: 403 });
    if (clinicalBooking) {
      const provider = await User.findById(providerUserId);
      await validateSchedulingSelection({ agencyId: aid, userRole: provider.role, providerCredentialText: provider.credential,
        appointmentTypeCode: 'SESSION', serviceCode, modality, scheduledStartAt: start, scheduledEndAt: end });
    }
  }
  if (packageEntitlementId) {
    const entitlement = await BookingPackage.findEntitlementById(packageEntitlementId, aid);
    const clientIds = participants.map((p) => Number(p.clientId || p.client_id));
    if (!entitlement || !clientIds.includes(Number(entitlement.clientId)) || entitlement.status !== 'ACTIVE') {
      throw Object.assign(new Error('Select an active package belonging to a participant in this agency'), { status: 400 });
    }
    if (Number(entitlement.sessionsRemaining) < 1) throw Object.assign(new Error('No sessions remaining on package'), { status: 409 });
    if (service && (service.packageEligible === false || (entitlement.businessType && entitlement.businessType !== businessType)
      || (entitlement.allowedTenantServiceIds?.length && !entitlement.allowedTenantServiceIds.map(Number).includes(Number(tenantServiceId))))) {
      throw Object.assign(new Error('Package does not cover this service'), { status: 400 });
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
    officeBookingRequestId: officeBookingRequestId || null,
    providerScheduleEventId,
    clinicalSessionId,
    packageEntitlementId,
    cancellationPolicyId,
    cancelDeadlineAt,
    source,
    title: title || service?.name || null,
    notes,
    othersPresentNames,
    videoRoomMode,
    notificationMode,
    createdByUserId,
    serviceCode: serviceCode || service?.serviceCode || null,
    addonServiceCodes
  });

  await pool.execute('UPDATE appointments SET service_location_id = ?, source_timezone = ? WHERE id = ?',
    [serviceLocationId || null, timeZone, appt.id]);
  if (participants?.length) {
    await Appointment.replaceParticipants(appt.id, participants);
  }
  // Persist primary + add-on codes when columns exist (migration 1398).
  try {
    await Appointment.setServiceCodes(appt.id, {
      serviceCode: serviceCode || service?.serviceCode || null,
      addonServiceCodes
    });
  } catch {
    /* columns may not exist yet */
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
      // A failed reservation must not leave a bookable appointment behind.
      await pool.execute('DELETE FROM appointment_billing WHERE appointment_id = ?', [appt.id]);
      await pool.execute('DELETE FROM appointment_participants WHERE appointment_id = ?', [appt.id]);
      await pool.execute('DELETE FROM appointments WHERE id = ?', [appt.id]);
      throw e;
    }
  }

  try {
    await scheduleSessionNotifications(appt.id, { replace: true });
  } catch {
    /* session notifications are best-effort */
  }

  if (ensureContext) {
    try { await ensureAppointmentClinicalLink(appt.id, createdByUserId); }
    catch (error) { error.appointmentId = appt.id; throw error; }
  }
  return getAppointmentBundle(appt.id);
}

export async function updateAppointment(appointmentId, patch = {}, { actorUserId = null } = {}) {
  const existing = await Appointment.findById(appointmentId);
  if (!existing) return null;

  if (patch.packageEntitlementId !== undefined && Number(patch.packageEntitlementId || 0) !== Number(existing.packageEntitlementId || 0)) {
    throw Object.assign(new Error('Cancel and rebook to change the package so the original reservation is released correctly'), { status: 409 });
  }
  if (patch.participants) {
    await assertAppointmentClients(existing.agencyId, patch.participants);
    if (existing.packageEntitlementId) {
      const entitlement = await BookingPackage.findEntitlementById(existing.packageEntitlementId, existing.agencyId);
      if (!patch.participants.some((p) => Number(p.clientId || p.client_id) === Number(entitlement?.clientId))) {
        throw Object.assign(new Error('The package owner must remain a participant'), { status: 409 });
      }
    }
  }
  if (patch.startAt != null || patch.endAt != null) {
    const { assertAppointmentCanMove } = await import('./appointmentScheduleSync.service.js');
    // Office adapter repeats existing times during linkage refresh; this is not a move.
    const start = patch.startAt != null ? toMysqlDateTime(patch.startAt) : existing.startAt;
    const end = patch.endAt != null ? toMysqlDateTime(patch.endAt) : existing.endAt;
    const sameInstant = (a, b) => new Date(a instanceof Date ? a : String(a).replace(' ', 'T').replace(/Z?$/, 'Z')).getTime()
      === new Date(b instanceof Date ? b : String(b).replace(' ', 'T').replace(/Z?$/, 'Z')).getTime();
    if (!start || !end || new Date(start).getTime() >= new Date(end).getTime()) throw Object.assign(new Error('endAt must be after startAt'), { status: 400 });
    if (!sameInstant(start, existing.startAt) || !sameInstant(end, existing.endAt)) await assertAppointmentCanMove(existing);
  }
  if (patch.serviceCode !== undefined || patch.addonServiceCodes !== undefined || patch.providerUserId !== undefined) {
    const provider = await User.findById(patch.providerUserId || existing.providerUserId);
    const codes = [patch.serviceCode ?? existing.serviceCode, ...(patch.addonServiceCodes ?? existing.addonServiceCodes ?? [])].filter(Boolean);
    for (const code of codes) await validateSchedulingSelection({ agencyId: existing.agencyId, userRole: provider.role,
      providerCredentialText: provider.credential, appointmentTypeCode: 'SESSION', serviceCode: code,
      modality: patch.modality || existing.modality });
  }
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
  const prevStatus = String(existing.status || '').toLowerCase();
  const updatePatch = {
    ...patch,
    startAt,
    endAt,
    updatedByUserId: actorUserId
  };
  if (patch.status != null) {
    updatePatch.status = Appointment.normalizeStatus(patch.status, existing.status);
  } else {
    delete updatePatch.status;
  }
  if (!startAt || !endAt || new Date(startAt).getTime() >= new Date(endAt).getTime()) {
    throw Object.assign(new Error('endAt must be after startAt'), { status: 400 });
  }
  await Appointment.update(appointmentId, updatePatch);
  if (patch.serviceCode !== undefined || patch.addonServiceCodes !== undefined) {
    await Appointment.setServiceCodes(appointmentId, {
      serviceCode: patch.serviceCode ?? existing.serviceCode,
      addonServiceCodes: patch.addonServiceCodes ?? existing.addonServiceCodes
    });
  }

  let settlement = null;
  const nextStatus = updatePatch.status != null
    ? String(updatePatch.status).toLowerCase()
    : prevStatus;
  if (nextStatus !== prevStatus && (nextStatus === 'completed' || nextStatus === 'no_show')) {
    try {
      settlement = await settleAppointmentOutcome(appointmentId, {
        outcome: nextStatus,
        actorUserId
      });
    } catch (e) {
      settlement = { settled: false, reason: 'SETTLE_ERROR', error: e.message };
    }
  }

  const bundle = await getAppointmentBundle(appointmentId);
  return settlement ? { ...bundle, settlement } : bundle;
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

  if (!String(reason || notes || '').trim()) throw Object.assign(new Error('Cancellation reason is required'), { status: 400 });
  if (status && !['canceled_by_provider', 'canceled_by_client', 'canceled_by_guardian', 'canceled_by_organization', 'late_canceled', 'rescheduled'].includes(status)) {
    throw Object.assign(new Error('Invalid cancellation status'), { status: 400 });
  }
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
    } catch (error) { throw error; }
  } else if (existing.packageEntitlementId && (packageAction === 'forfeit' || packageAction === 'late_forfeit')) {
    try {
      await BookingPackage.applyAppointmentUsage({
        entitlementId: existing.packageEntitlementId,
        agencyId: existing.agencyId,
        appointmentId: existing.id,
        mode: 'forfeit',
        actorUserId
      });
    } catch (error) { throw error; }
  }
  // review: leave reservation as-is for staff resolution

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
  appointmentTypeCode = null,
  serviceCode = null,
  clinicalSessionId = null,
  packageEntitlementId = null,
  strict = false
} = {}) {
  try {
    const aid = Number(agencyId || 0);
    const oid = Number(officeEventId || 0);
    if (!aid || !oid) return null;

    const asUtc = (value) => value instanceof Date ? value.toISOString()
      : value ? String(value).replace(' ', 'T').replace(/Z?$/, 'Z') : null;
    startAt = asUtc(startAt);
    endAt = asUtc(endAt);
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
        status: ['scheduled', 'confirmed'].includes(existing.status) ? 'confirmed' : existing.status,
        clinicalSessionId: clinicalSessionId || existing.clinicalSessionId,
        serviceCode: serviceCode || existing.serviceCode,
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
      clinicalSessionId,
      serviceCode,
      packageEntitlementId,
      ensureContext: false,
      source: 'office_book',
      title: title || (appointmentTypeCode ? String(appointmentTypeCode) : 'Office session'),
      createdByUserId: actorUserId,
      participants
    });
  } catch (e) {
    if (strict) throw e;
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

export async function settleAppointment(appointmentId, {
  outcome,
  actorUserId = null,
  force = false
} = {}) {
  const existing = await Appointment.findById(appointmentId);
  if (!existing) return null;
  const status = String(outcome || existing.status || '').toLowerCase();
  if (status === 'completed' || status === 'no_show') {
    if (String(existing.status || '').toLowerCase() !== status) {
      await Appointment.update(appointmentId, {
        status: Appointment.normalizeStatus(status),
        updatedByUserId: actorUserId
      });
    }
  }
  const settlement = await settleAppointmentOutcome(appointmentId, {
    outcome: status,
    actorUserId,
    force
  });
  const bundle = await getAppointmentBundle(appointmentId);
  return { ...bundle, settlement };
}

export default {
  resolveBookingOptions,
  getAppointmentBundle,
  createAppointment,
  updateAppointment,
  cancelAppointment,
  upsertAppointmentForOfficeBook,
  linkProviderScheduleEvent,
  settleAppointment
};
