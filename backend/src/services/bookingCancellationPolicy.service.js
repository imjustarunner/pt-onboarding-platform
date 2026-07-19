/**
 * Resolve and evaluate cancellation policies.
 * Hierarchy (most specific wins):
 * appointment override → package → service → business_type → tenant → affiliation (parent)
 */

import BookingCancellationPolicy from '../models/BookingCancellationPolicy.model.js';
import Appointment from '../models/Appointment.model.js';
import TenantService from '../models/TenantService.model.js';
import BookingPackage from '../models/BookingPackage.model.js';
import Agency from '../models/Agency.model.js';

const SCOPE_RANK = {
  appointment: 100,
  package: 80,
  service: 60,
  business_type: 40,
  tenant: 20,
  affiliation: 10
};

function parseStartAt(startAt) {
  if (!startAt) return null;
  if (startAt instanceof Date) return startAt;
  const s = String(startAt).trim();
  const d = new Date(s.includes('T') ? s : s.replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? null : d;
}

function deadlineFromStart(startAt, noticeHours) {
  const start = parseStartAt(startAt);
  if (!start) return null;
  const ms = Math.max(0, Number(noticeHours) || 0) * 60 * 60 * 1000;
  return new Date(start.getTime() - ms);
}

export async function listCandidatePolicies(agencyId, {
  parentAgencyId = null,
  businessType = null,
  tenantServiceId = null,
  bookingPackageId = null,
  appointmentPolicyId = null
} = {}) {
  const aid = Number(agencyId || 0);
  if (!aid) return [];
  const agencyPolicies = await BookingCancellationPolicy.listForAgency(aid, { includeInactive: false });
  let affiliationPolicies = [];
  const parentId = Number(parentAgencyId || 0);
  if (parentId && parentId !== aid) {
    affiliationPolicies = (await BookingCancellationPolicy.listForAgency(parentId, { includeInactive: false }))
      .filter((p) => p.scopeLevel === 'affiliation' || p.scopeLevel === 'tenant')
      .map((p) => ({ ...p, scopeLevel: 'affiliation' }));
  }

  const all = [...agencyPolicies, ...affiliationPolicies];
  return all.filter((p) => {
    if (appointmentPolicyId && Number(p.id) === Number(appointmentPolicyId)) return true;
    if (p.scopeLevel === 'appointment') {
      return appointmentPolicyId && Number(p.id) === Number(appointmentPolicyId);
    }
    if (p.scopeLevel === 'package') {
      return bookingPackageId && Number(p.bookingPackageId) === Number(bookingPackageId);
    }
    if (p.scopeLevel === 'service') {
      return tenantServiceId && Number(p.tenantServiceId) === Number(tenantServiceId);
    }
    if (p.scopeLevel === 'business_type') {
      return businessType && String(p.businessType) === String(businessType);
    }
    if (p.scopeLevel === 'tenant' || p.scopeLevel === 'affiliation') return true;
    return false;
  });
}

export function pickWinningPolicy(candidates = [], { appointmentPolicyId = null } = {}) {
  if (appointmentPolicyId) {
    const override = candidates.find((p) => Number(p.id) === Number(appointmentPolicyId));
    if (override) return override;
  }
  let best = null;
  let bestRank = -1;
  for (const p of candidates) {
    const rank = SCOPE_RANK[p.scopeLevel] ?? 0;
    if (rank > bestRank) {
      best = p;
      bestRank = rank;
    }
  }
  return best;
}

export async function resolvePolicyForAppointmentContext({
  agencyId,
  parentAgencyId = null,
  businessType = null,
  tenantServiceId = null,
  packageEntitlementId = null,
  cancellationPolicyId = null
} = {}) {
  let bookingPackageId = null;
  if (packageEntitlementId) {
    try {
      const ent = await BookingPackage.findEntitlementById(packageEntitlementId, agencyId);
      bookingPackageId = ent?.packageId || null;
      if (!businessType && ent?.businessType) businessType = ent.businessType;
    } catch { /* ignore */ }
  }
  if (!businessType && tenantServiceId) {
    const svc = await TenantService.findById(tenantServiceId, agencyId);
    businessType = svc?.businessType || null;
    if (!cancellationPolicyId && svc?.cancellationPolicyId) {
      cancellationPolicyId = svc.cancellationPolicyId;
    }
  }

  const candidates = await listCandidatePolicies(agencyId, {
    parentAgencyId,
    businessType,
    tenantServiceId,
    bookingPackageId,
    appointmentPolicyId: cancellationPolicyId
  });
  const policy = pickWinningPolicy(candidates, { appointmentPolicyId: cancellationPolicyId });
  return { policy, candidates, bookingPackageId, businessType };
}

export async function evaluateCancel({
  appointmentId = null,
  appointment = null,
  actorRole = 'staff',
  clientId = null,
  waive = false
} = {}) {
  const appt = appointment || (appointmentId ? await Appointment.findById(appointmentId) : null);
  if (!appt) throw Object.assign(new Error('Appointment not found'), { status: 404 });

  const { policy } = await resolvePolicyForAppointmentContext({
    agencyId: appt.agencyId,
    parentAgencyId: appt.parentAgencyId,
    businessType: appt.businessType,
    tenantServiceId: appt.tenantServiceId,
    packageEntitlementId: appt.packageEntitlementId,
    cancellationPolicyId: appt.cancellationPolicyId
  });

  const effective = policy || {
    id: null,
    name: 'Default (no policy configured)',
    noticeHours: 24,
    lateFeeCents: 0,
    latePackageAction: 'release',
    complimentaryCancelsPerPeriod: 0,
    periodDays: 90,
    allowClientCancel: true,
    requireReason: false,
    scopeLevel: 'tenant'
  };

  const start = parseStartAt(appt.startAt);
  const deadline = deadlineFromStart(appt.startAt, effective.noticeHours);
  const now = new Date();
  const withinNotice = !deadline || now.getTime() <= deadline.getTime();
  const isClient = String(actorRole || '').toLowerCase().includes('client')
    || String(actorRole || '').toLowerCase() === 'guardian';

  if (isClient && !effective.allowClientCancel) {
    return {
      appointmentId: appt.id,
      policy: effective,
      cancelDeadlineAt: deadline ? deadline.toISOString() : null,
      withinNotice,
      isLate: !withinNotice,
      allowed: false,
      blockReason: 'Client self-cancel is not allowed by policy.',
      recommendedFeeCents: 0,
      recommendedPackageAction: 'release',
      usedComplimentary: false,
      requireReason: !!effective.requireReason
    };
  }

  let recommendedFeeCents = withinNotice ? 0 : Number(effective.lateFeeCents || 0);
  let recommendedPackageAction = withinNotice
    ? 'release'
    : String(effective.latePackageAction || 'forfeit');
  let usedComplimentary = false;

  if (!withinNotice && effective.complimentaryCancelsPerPeriod > 0 && clientId) {
    const used = await BookingCancellationPolicy.countComplimentaryUsed({
      agencyId: appt.agencyId,
      clientId,
      periodDays: effective.periodDays
    });
    if (used < effective.complimentaryCancelsPerPeriod) {
      recommendedFeeCents = 0;
      recommendedPackageAction = 'release';
      usedComplimentary = true;
    }
  }

  if (waive) {
    recommendedFeeCents = 0;
    if (recommendedPackageAction === 'forfeit') recommendedPackageAction = 'release';
  }

  return {
    appointmentId: appt.id,
    policy: effective,
    cancelDeadlineAt: deadline ? deadline.toISOString() : null,
    startAt: start ? start.toISOString() : null,
    withinNotice,
    isLate: !withinNotice,
    allowed: true,
    blockReason: null,
    recommendedFeeCents,
    recommendedPackageAction,
    usedComplimentary,
    requireReason: !!effective.requireReason,
    statusSuggestion: withinNotice
      ? (isClient ? 'canceled_by_client' : 'canceled_by_provider')
      : 'late_canceled'
  };
}

export async function ensureDefaultTenantPolicy(agencyId, createdByUserId = null) {
  const aid = Number(agencyId || 0);
  if (!aid) return null;
  const existing = await BookingCancellationPolicy.listForAgency(aid, { includeInactive: false });
  if (existing.some((p) => p.scopeLevel === 'tenant')) return existing.find((p) => p.scopeLevel === 'tenant');
  const agency = await Agency.findById(aid).catch(() => null);
  return BookingCancellationPolicy.create(aid, {
    name: `${agency?.name || 'Tenant'} default cancellation`,
    scopeLevel: 'tenant',
    noticeHours: 24,
    lateFeeCents: 0,
    latePackageAction: 'forfeit',
    complimentaryCancelsPerPeriod: 0,
    allowClientCancel: true,
    requireReason: true
  }, createdByUserId);
}
