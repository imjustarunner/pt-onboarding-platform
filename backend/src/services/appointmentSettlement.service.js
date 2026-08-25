/**
 * Phase 5 settlement: package autodeduct / no-show forfeit / invoice-pending fee.
 * Separate from clinical Note Aid / medical claims — reuses booking + practitioner package ledgers.
 */
import Appointment from '../models/Appointment.model.js';
import BookingPackage from '../models/BookingPackage.model.js';
import {
  debitSessionOnComplete,
  applyMissedSessionPolicy
} from './practitionerPackage.service.js';

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function resolveBillingClientId(appointmentId, appointment) {
  const participants = await Appointment.listParticipants(appointmentId);
  const fromBilling = participants.find((p) => p.isBillingResponsible)?.clientId
    || participants.find((p) => p.clientId)?.clientId
    || null;
  if (fromBilling) return safeInt(fromBilling);
  const billing = await Appointment.getBilling(appointmentId);
  return safeInt(billing?.responsibleClientId) || safeInt(appointment?.clientId) || null;
}

/**
 * Consume a reserved booking package unit as a no-show / late forfeit (no release).
 */
async function forfeitBookingPackage({ entitlementId, agencyId, appointmentId, actorUserId }) {
  return BookingPackage.applyAppointmentUsage({
    entitlementId,
    agencyId,
    appointmentId,
    mode: 'forfeit',
    actorUserId
  });
}

/**
 * Settle package / fee outcomes when an appointment becomes completed or no_show.
 * Idempotent best-effort — ledger rows / payment_status guard repeats.
 */
export async function settleAppointmentOutcome(appointmentId, {
  outcome,
  actorUserId = null,
  force = false
} = {}) {
  const id = safeInt(appointmentId);
  const status = String(outcome || '').toLowerCase();
  if (!id || !['completed', 'no_show'].includes(status)) {
    return { settled: false, reason: 'UNSUPPORTED_OUTCOME' };
  }

  const appointment = await Appointment.findById(id);
  if (!appointment) return { settled: false, reason: 'NOT_FOUND' };

  const billing = await Appointment.getBilling(id);
  if (!force && billing?.paymentStatus && ['package_consumed', 'forfeited', 'fee_pending', 'paid', 'invoiced'].includes(
    String(billing.paymentStatus)
  )) {
    return {
      settled: false,
      reason: 'ALREADY_SETTLED',
      paymentStatus: billing.paymentStatus
    };
  }

  const agencyId = safeInt(appointment.agencyId);
  const clientId = await resolveBillingClientId(id, appointment);
  const packageEntitlementId = safeInt(
    appointment.packageEntitlementId || billing?.packageEntitlementId
  );
  const providerScheduleEventId = safeInt(appointment.providerScheduleEventId);
  const results = {
    settled: true,
    outcome: status,
    bookingPackage: null,
    practitionerPackage: null,
    paymentStatus: billing?.paymentStatus || 'none',
    feeCents: 0
  };

  if (status === 'completed') {
    if (packageEntitlementId) {
      try {
        results.bookingPackage = await BookingPackage.applyAppointmentUsage({
          entitlementId: packageEntitlementId,
          agencyId,
          appointmentId: id,
          mode: 'complete',
          actorUserId
        });
        results.paymentStatus = 'package_consumed';
      } catch (e) {
        results.bookingPackage = { error: e.message, status: e.status || 500 };
      }
    }

    if (clientId && agencyId) {
      try {
        results.practitionerPackage = await debitSessionOnComplete({
          agencyId,
          clientId,
          providerScheduleEventId,
          createdByUserId: actorUserId
        });
        if (results.practitionerPackage?.debited) {
          results.paymentStatus = 'package_consumed';
        }
      } catch (e) {
        results.practitionerPackage = { error: e.message };
      }
    }

    // Self-pay / hourly without package: mark invoice pending for staff follow-up.
    if (!packageEntitlementId && (!results.practitionerPackage?.debited)) {
      const amountCents = billing?.amountCents != null ? Number(billing.amountCents) : null;
      results.paymentStatus = amountCents > 0 ? 'fee_pending' : 'self_pay_open';
      results.feeCents = amountCents || 0;
    }
  }

  if (status === 'no_show') {
    if (packageEntitlementId) {
      try {
        results.bookingPackage = await forfeitBookingPackage({
          entitlementId: packageEntitlementId,
          agencyId,
          appointmentId: id,
          actorUserId
        });
        results.paymentStatus = 'forfeited';
      } catch (e) {
        results.bookingPackage = { error: e.message, status: e.status || 500 };
      }
    }

    if (clientId && agencyId) {
      try {
        results.practitionerPackage = await applyMissedSessionPolicy({
          agencyId,
          clientId,
          createdByUserId: actorUserId,
          providerScheduleEventId
        });
        if (results.practitionerPackage?.action === 'FREE_REBOOK') {
          results.paymentStatus = 'free_rebook';
        } else if (results.practitionerPackage?.action === 'FORFEIT') {
          results.paymentStatus = 'forfeited';
        } else if (results.practitionerPackage?.action === 'FEE') {
          results.paymentStatus = 'fee_pending';
          results.feeCents = Number(results.practitionerPackage.feeCents || 0);
        }
      } catch (e) {
        results.practitionerPackage = { error: e.message };
      }
    }

    if (!packageEntitlementId && !results.practitionerPackage?.applied) {
      const amountCents = billing?.amountCents != null ? Number(billing.amountCents) : null;
      if (amountCents > 0) {
        results.paymentStatus = 'fee_pending';
        results.feeCents = amountCents;
      }
    }
  }

  try {
    await Appointment.upsertBilling(id, {
      settlementMode: packageEntitlementId
        ? 'package'
        : (billing?.settlementMode || 'self_pay'),
      responsiblePartyType: billing?.responsiblePartyType || 'client',
      responsibleClientId: clientId || billing?.responsibleClientId || null,
      amountCents: results.feeCents > 0
        ? results.feeCents
        : (billing?.amountCents ?? null),
      packageEntitlementId: packageEntitlementId || billing?.packageEntitlementId || null,
      paymentStatus: results.paymentStatus,
      notes: [
        billing?.notes || '',
        `settled:${status}@${new Date().toISOString()}`
      ].filter(Boolean).join(' | ').slice(0, 500)
    });
  } catch (e) {
    results.billingError = e.message;
  }

  return results;
}

export default { settleAppointmentOutcome };
