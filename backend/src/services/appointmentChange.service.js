/**
 * Appointment Change Workflow — preview consequence + assemble narrative + complete.
 * Provider reports facts; system classifies late/miss, consequence, and writes the note.
 */
import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import ClientMedicaidAttendanceStrike from '../models/ClientMedicaidAttendanceStrike.model.js';
import User from '../models/User.model.js';
import BookingPackage from '../models/BookingPackage.model.js';
import { runSignedAppointmentChange } from './appointmentChangeWorkflow.service.js';
import { releaseAppointmentCalendar } from './appointmentCalendarMaintenance.service.js';
import { cancelPendingReminders } from './appointmentReminder.service.js';
import { evaluateCancel } from './bookingCancellationPolicy.service.js';
import {
  getAppointmentBundle,
  updateAppointment
} from './appointment.service.js';
import { applyMissedSessionPolicy } from './practitionerPackage.service.js';

/**
 * Hard rule: not-occurring appointments never create a primary session insurance claim.
 * Signing this documentation never creates a claim, including missed-fee drafts.
 */
const DEFAULT_INSURANCE_CLAIM_POLICY = Object.freeze({
  willCreatePrimarySessionClaim: false,
  willCreateSecondaryClaim: false,
  willAutoSubmit: false,
  reason: 'This appointment change creates a nonbillable session note and does not create an insurance claim.'
});

const INITIATOR_LABELS = {
  client: 'the client',
  parent_guardian: 'a parent/guardian',
  caregiver: 'a caregiver',
  provider: 'the provider',
  clinician: 'the clinician/provider',
  coach: 'the coach/consultant/tutor',
  agency: 'the agency',
  facility_school: 'the facility/school',
  payer: 'the payer/insurance',
  other: 'another party'
};

const REASON_LABELS = {
  illness: 'illness',
  family_emergency: 'a family emergency',
  transportation: 'a transportation issue',
  work_school_conflict: 'a work/school conflict',
  scheduling_conflict: 'a scheduling conflict',
  client_declined: 'the client declining the appointment',
  provider_unavailable: 'provider unavailability',
  weather: 'weather',
  facility_school_issue: 'a facility/school issue',
  work_conflict: 'a work conflict',
  school_conflict: 'a school conflict',
  no_longer_wants: 'the client no longer wanting the appointment',
  authorization: 'an authorization/insurance issue',
  scheduling_error: 'a scheduling error',
  technology_failure: 'a technology failure',
  other: null
};

const OUTREACH_PHRASES = {
  called: 'called the client',
  left_voicemail: 'left a voicemail',
  sent_message: 'sent a message',
  unable_to_reach: 'was unable to reach the client',
  not_required: null
};

function safeInt(v) {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function formatApptWhen(isoOrMysql, timeZone = 'America/Denver') {
  if (!isoOrMysql) return null;
  const raw = String(isoOrMysql);
  const d = isoOrMysql instanceof Date ? isoOrMysql : new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z');
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
    timeZone,
    timeZoneName: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function isMedicaidPayer(raw) {
  const s = String(raw || '').toLowerCase();
  return /medicaid|medi-?cal|hmo.?medicaid|chip|cms/.test(s);
}

function isAdminRole(role) {
  const r = String(role || '').toLowerCase();
  return ['super_admin', 'superadmin', 'admin', 'agency_admin', 'backoffice_admin'].includes(r);
}

function isProviderCausedInitiator(initiator) {
  const i = String(initiator || '').toLowerCase();
  return ['provider', 'clinician', 'coach', 'agency'].includes(i);
}

async function resolveBillingClientId(appointmentId) {
  const participants = await Appointment.listParticipants(appointmentId);
  return (
    participants.find((p) => p.isBillingResponsible)?.clientId
    || participants.find((p) => p.clientId)?.clientId
    || null
  );
}

async function loadClientPayerHint(clientId) {
  const cid = safeInt(clientId);
  if (!cid) return { insuranceType: null, isMedicaid: false };
  try {
    const [rows] = await pool.execute(
      `SELECT insurance_type, insurance_type_other, primary_insurance_name
       FROM clients WHERE id = ? LIMIT 1`,
      [cid]
    );
    const r = rows?.[0] || {};
    const insuranceType = r.insurance_type || r.insurance_type_other || r.primary_insurance_name || null;
    return { insuranceType, isMedicaid: isMedicaidPayer(insuranceType) };
  } catch {
    return { insuranceType: null, isMedicaid: false };
  }
}

async function loadAgencyStrikePolicyEnabled(agencyId) {
  const aid = safeInt(agencyId);
  if (!aid) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT medicaid_strike_policy_enabled FROM agencies WHERE id = ? LIMIT 1`,
      [aid]
    );
    return !!rows?.[0]?.medicaid_strike_policy_enabled;
  } catch {
    return false;
  }
}

/**
 * Provider decides third-strike waive themselves. Notify agency admins + assigned supervisors.
 * Do not open an admin discharge-review decision queue.
 */
async function notifyThirdStrikeWaived({
  agencyId,
  clientId,
  strike,
  appointmentId,
  providerWaiveReason,
  actorUserId
}) {
  if (!strike?.id) return null;

  let clientLabel = `client #${clientId}`;
  try {
    const Client = (await import('../models/Client.model.js')).default;
    const c = await Client.findById(clientId);
    const name = `${c?.first_name || ''} ${c?.last_name || ''}`.trim();
    if (name) clientLabel = name;
  } catch {
    // best-effort
  }

  let actorLabel = 'The provider';
  try {
    if (actorUserId) {
      const u = await User.findById(actorUserId);
      const name = `${u?.first_name || ''} ${u?.last_name || ''}`.trim();
      if (name) actorLabel = name;
    }
  } catch {
    // best-effort
  }

  const reasonBit = providerWaiveReason
    ? ` Reason: ${String(providerWaiveReason).replace(/_/g, ' ')}.`
    : '';
  const title = 'Third attendance strike waived — remaining at 2 strikes';
  const message =
    `${actorLabel} recorded a third missed-appointment strike for ${clientLabel} and waived the `
    + `termination/discharge recommendation. Active strike count remains at 2 for policy purposes.`
    + reasonBit;

  const recipientIds = new Set();
  try {
    const [adminRows] = await pool.execute(
      `SELECT DISTINCT u.id
       FROM users u
       INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
       WHERE LOWER(COALESCE(u.role, '')) IN ('admin', 'super_admin', 'agency_admin', 'backoffice_admin')
         AND COALESCE(u.is_active, 1) = 1`,
      [Number(agencyId)]
    );
    for (const r of adminRows || []) {
      if (r?.id) recipientIds.add(Number(r.id));
    }
  } catch (e) {
    console.warn('[appointmentChange] admin notify lookup failed', e?.message || e);
  }

  try {
    if (actorUserId) {
      const SupervisorAssignment = (await import('../models/SupervisorAssignment.model.js')).default;
      const supervisorIds = await SupervisorAssignment.getSupervisorIds(actorUserId, agencyId);
      for (const sid of supervisorIds || []) {
        if (sid) recipientIds.add(Number(sid));
      }
    }
  } catch (e) {
    console.warn('[appointmentChange] supervisor notify lookup failed', e?.message || e);
  }

  // Never notify the acting provider about their own waive decision.
  if (actorUserId) recipientIds.delete(Number(actorUserId));

  try {
    const { createNotificationAndDispatch } = await import('./notificationDispatcher.service.js');
    for (const userId of recipientIds) {
      await createNotificationAndDispatch({
        type: 'attendance_third_strike_waived',
        severity: 'warning',
        title,
        message,
        userId,
        agencyId: Number(agencyId),
        relatedEntityType: 'appointment',
        relatedEntityId: appointmentId || strike.id,
        actorSource: 'Appointment Change'
      });
    }
  } catch (e) {
    console.warn('[appointmentChange] third-strike waive notify failed', e?.message || e);
  }

  return { notifiedUserIds: [...recipientIds] };
}

async function loadPackageBalanceHint({ agencyId, clientId, packageEntitlementId, providerUserId, appointmentId }) {
  if (!packageEntitlementId && !(agencyId && clientId)) {
    return null;
  }
  try {
    if (packageEntitlementId) {
      const [rows] = await pool.execute(
        `SELECT e.id, e.sessions_remaining + e.sessions_reserved AS sessions_remaining, e.free_misses_remaining AS free_rebooks_remaining, e.bonus_sessions_remaining, e.bonus_sessions_reserved, e.status,
                p.name AS package_name
         FROM booking_package_entitlements e
         LEFT JOIN booking_packages p ON p.id = e.package_id
         WHERE e.id = ? AND e.agency_id = ? AND e.client_id = ? LIMIT 1`,
        [Number(packageEntitlementId), Number(agencyId), Number(clientId)]
      );
      const r = rows?.[0];
      if (r) {
        const [history] = await pool.execute(`SELECT direction, metadata_json FROM booking_package_ledger WHERE entitlement_id = ? AND appointment_id = ? ORDER BY id DESC LIMIT 1`, [r.id, appointmentId]);
        const last = history[0];
        const meta = typeof last?.metadata_json === 'string' ? JSON.parse(last.metadata_json) : last?.metadata_json;
        const ownsBonusReservation = last?.direction === 'RESERVE' && meta?.creditBucket === 'bonus';
        return {
          bonusSessionsRemaining: Number(r.bonus_sessions_remaining || 0) + Number(r.bonus_sessions_reserved || 0),
          bonusAvailableForMiss: Number(r.bonus_sessions_remaining || 0) + (ownsBonusReservation ? 1 : 0),
          entitlementId: Number(r.id),
          sessionsRemaining: Number(r.sessions_remaining || 0),
          freeMissesRemaining: Number(r.free_rebooks_remaining || 0),
          packageName: r.package_name || 'Package',
          source: 'booking_package'
        };
      }
    }
    if (packageEntitlementId) throw Object.assign(new Error('Selected package entitlement was not found'), { status: 409 });
  } catch (error) { if (packageEntitlementId) throw error; }

  try {
    const [rows] = await pool.execute(
      `SELECT e.id, e.sessions_remaining, e.free_rebooks_remaining, e.status,
              p.name AS package_name, p.missed_session_policy_json
       FROM practitioner_client_package_entitlements e
       LEFT JOIN practitioner_session_packages p ON p.id = e.package_id
       WHERE e.agency_id = ? AND e.client_id = ? AND e.status = 'ACTIVE'
       ORDER BY e.id DESC LIMIT 1`,
      [Number(agencyId), Number(clientId)]
    );
    const r = rows?.[0];
    if (r) {
      return {
        entitlementId: Number(r.id),
        sessionsRemaining: Number(r.sessions_remaining || 0),
        freeMissesRemaining: Number(r.free_rebooks_remaining || 0),
        packageName: r.package_name || 'Package',
        policy: typeof r.missed_session_policy_json === 'string' ? JSON.parse(r.missed_session_policy_json) : r.missed_session_policy_json,
        source: 'practitioner_package'
      };
    }
  } catch { /* optional */ }

  return null;
}

function classifyEvent({ eventType, evaluation, initiator }) {
  const et = String(eventType || '').toLowerCase();
  if (et === 'void') return { classification: 'void', isLate: false, isMissed: false };
  if (et === 'no_show') return { classification: 'no_show', isLate: true, isMissed: true };
  if (et === 'rescheduled') {
    const isLate = !!evaluation?.isLate;
    return {
      classification: isLate ? 'late_cancel_reschedule' : 'advance_reschedule',
      isLate,
      isMissed: isLate
    };
  }
  // canceled
  const providerCaused = isProviderCausedInitiator(initiator);
  const isLate = !!evaluation?.isLate && !providerCaused;
  return {
    classification: isLate ? 'late_cancel' : 'advance_cancel',
    isLate,
    isMissed: isLate,
    providerCaused
  };
}

function determineConsequenceModel({
  classification,
  isMedicaid,
  strikePolicyEnabled,
  packageBalance,
  evaluation,
  initiator
}) {
  if (['void', 'advance_cancel', 'advance_reschedule'].includes(classification)) {
    return {
      model: 'none',
      label: 'No financial or attendance consequence',
      feeCents: 0,
      packageAction: null,
      strike: null
    };
  }
  if (isProviderCausedInitiator(initiator)) {
    return {
      model: 'none',
      label: 'Provider/agency-caused — no client consequence',
      feeCents: 0,
      packageAction: null,
      strike: null
    };
  }

  const qualifying = ['late_cancel', 'late_cancel_reschedule', 'no_show'].includes(classification);

  if (isMedicaid && strikePolicyEnabled && qualifying) {
    return {
      model: 'medicaid_strike',
      label: 'Medicaid attendance strike policy',
      feeCents: 0,
      packageAction: null,
      strike: { pending: true }
    };
  }

  if (isMedicaid && qualifying) return { model: 'none', label: 'No missed-appointment fee', feeCents: 0, packageAction: 'release' };

  if (packageBalance?.source === 'booking_package' && qualifying
      && !['forfeit', 'late_forfeit'].includes(evaluation.recommendedPackageAction)) {
    if (Number(evaluation.recommendedFeeCents) > 0) return { model: 'fee', label: 'Package missed-appointment fee', feeCents: Number(evaluation.recommendedFeeCents), packageAction: 'release', summary: 'A missed-appointment fee applies; the session credit is retained.' };
    return { model: 'none', label: 'Package session retained', feeCents: 0, packageAction: 'release',
      summary: 'The appointment reservation will be released; no session credit is consumed.' };
  }
  if (packageBalance && qualifying) {
    const policy = packageBalance.policy || { type: 'forfeit' };
    if (packageBalance.source === 'practitioner_package' && policy.type === 'fee') {
      return { model: 'fee', label: 'Package missed-session fee', feeCents: Number(policy.feeCents || 0),
        summary: 'A missed-session fee applies under the package policy.' };
    }
    const free = packageBalance.source === 'practitioner_package' && policy.type !== 'free_rebook' ? 0 : Number(packageBalance.freeMissesRemaining || 0);
    const sessions = Number(packageBalance.sessionsRemaining || 0);
    const bonus = Number(packageBalance.bonusSessionsRemaining || 0);
    const useBonus = Number(packageBalance.bonusAvailableForMiss || 0) > 0;
    if (free > 0) {
      return {
        model: 'package',
        label: 'Plan / Package-Based',
        feeCents: 0,
        packageAction: 'free_miss',
        before: { sessionsRemaining: sessions, freeMissesRemaining: free, bonusSessionsRemaining: bonus },
        after: { sessionsRemaining: sessions, freeMissesRemaining: free - 1, bonusSessionsRemaining: bonus },
        summary: 'Free miss used. No session credit deducted.'
      };
    }
    return {
      model: 'package',
      label: 'Plan / Package-Based',
      feeCents: 0,
      packageAction: useBonus ? 'bonus_credit' : 'session_credit',
      before: { sessionsRemaining: sessions, freeMissesRemaining: free, bonusSessionsRemaining: bonus },
      after: {
        sessionsRemaining: Math.max(0, sessions - 1),
        freeMissesRemaining: free, bonusSessionsRemaining: Math.max(0, bonus - (useBonus ? 1 : 0))
      },
      summary: useBonus ? 'One bonus session credit applies to the missed appointment.' : 'One paid session credit applies to the missed appointment.'
    };
  }

  const feeCents = Number(evaluation?.recommendedFeeCents || 0);
  if (feeCents > 0 && qualifying) {
    return {
      model: 'fee',
      label: 'Eligible non-Medicaid — missed-appointment fee',
      feeCents,
      packageAction: evaluation?.recommendedPackageAction || 'forfeit',
      summary: 'A missed-appointment fee applies per agency policy.'
    };
  }

  return {
    model: 'none',
    label: 'No fee configured',
    feeCents: 0,
    packageAction: evaluation?.recommendedPackageAction || null,
    summary: 'No missed-appointment fee is configured for this appointment.'
  };
}

export function assembleAppointmentChangeNarrative({
  eventType,
  initiator,
  reasons = [],
  reasonOther = '',
  outreach = [],
  classification,
  nextAppointment = null,
  consequence = null,
  strikeResult = null,
  waiver = null,
  actorTitle = 'The provider',
  additionalComments = ''
} = {}) {
  const sentences = [];
  const initiatorLabel = INITIATOR_LABELS[String(initiator || '').toLowerCase()] || 'the client';
  const reasonParts = (Array.isArray(reasons) ? reasons : [])
    .map((r) => {
      const key = String(r || '').toLowerCase();
      if (key === 'other') {
        const o = String(reasonOther || '').trim();
        return o || null;
      }
      return REASON_LABELS[key] || key.replace(/_/g, ' ');
    })
    .filter(Boolean);
  const dueTo = reasonParts.length
    ? ` due to ${reasonParts.join('; ')}`
    : '';

  const et = String(eventType || '').toLowerCase();
  if (et === 'no_show') {
    sentences.push(`${actorTitle} indicated that the client did not attend the scheduled session${dueTo}.`);
  } else if (et === 'rescheduled') {
    sentences.push(
      `${actorTitle} indicated that ${initiatorLabel} requested to reschedule the scheduled session${dueTo}.`
    );
  } else if (et === 'void') {
    sentences.push(
      `${actorTitle} indicated that this appointment was voided (completed in error, duplicate, or similar).`
    );
  } else {
    sentences.push(
      `${actorTitle} indicated that ${initiatorLabel} canceled the scheduled session${dueTo}.`
    );
  }

  if (classification === 'late_cancel' || classification === 'late_cancel_reschedule') {
    sentences.push(
      'The cancellation occurred within the agency\'s late-cancellation period and was classified as a late cancellation.'
    );
  } else if (classification === 'no_show') {
    // classification already covered by sentence 1; optional timing note omitted
  }

  const outreachKeys = Array.isArray(outreach) ? outreach : [];
  if (outreachKeys.length && !outreachKeys.includes('not_required')) {
    const bits = outreachKeys
      .map((k) => OUTREACH_PHRASES[String(k).toLowerCase()])
      .filter(Boolean);
    if (bits.length) {
      sentences.push(`${actorTitle} attempted outreach and ${bits.join(', ')}.`);
    }
  }

  if (nextAppointment?.displayWhen) {
    sentences.push(`The client's next session is scheduled for ${nextAppointment.displayWhen}.`);
  } else if (et !== 'void') {
    sentences.push('The client does not currently have another session scheduled.');
  }

  if (consequence?.model === 'fee') {
    if (waiver?.action === 'waive' || waiver?.action === 'waived') {
      sentences.push(
        `The missed-appointment fee was waived${waiver.reason ? ` due to ${String(waiver.reason).replace(/_/g, ' ')}` : ''}.`
      );
    } else if (waiver?.action === 'recommend') {
      sentences.push(
        consequence.summary
          || 'A missed-appointment fee will be assessed in accordance with agency policy.'
      );
      sentences.push(
        `${actorTitle} recommends that the fee consequence be waived${waiver.reason ? ` due to ${String(waiver.reason).replace(/_/g, ' ')}` : ''}. The recommendation is pending administrative review.`
      );
    } else if (consequence.summary) {
      sentences.push(consequence.summary);
    }
  } else if (consequence?.model === 'package') {
    if (consequence.packageAction === 'free_miss') {
      sentences.push(
        'In accordance with the client\'s package, the available free miss was applied. No session credit was deducted'
          + (consequence.after?.sessionsRemaining != null
            ? `, and ${consequence.after.sessionsRemaining} session credit${consequence.after.sessionsRemaining === 1 ? '' : 's'} remain.`
            : '.')
      );
    } else if (['session_credit', 'bonus_credit'].includes(consequence.packageAction)) {
      sentences.push(
        `No free miss was available; one ${consequence.packageAction === 'bonus_credit' ? 'bonus' : 'paid'} session credit was applied to the missed appointment in accordance with the client's package terms`
          + (consequence.after?.sessionsRemaining != null
            ? `. ${consequence.after.sessionsRemaining} session credit${consequence.after.sessionsRemaining === 1 ? '' : 's'} remain.`
            : '.')
      );
    }
    if (waiver?.action === 'recommend') {
      sentences.push(
        `${actorTitle} recommends that the ${consequence.packageAction === 'free_miss' ? 'free-miss usage' : 'session-credit consequence'} be waived${waiver.reason ? ` due to ${String(waiver.reason).replace(/_/g, ' ')}` : ''}. The recommendation is pending administrative review.`
      );
    } else if (waiver?.action === 'waive' || waiver?.action === 'waived') {
      sentences.push(
        `The package consequence was waived${waiver.reason ? ` due to ${String(waiver.reason).replace(/_/g, ' ')}` : ''}.`
      );
    }
  } else if (consequence?.model === 'medicaid_strike' || strikeResult) {
    const n = Number(strikeResult?.strikeNumber || consequence?.strike?.strikeNumber || 0);
    if (n === 1) {
      sentences.push(
        'In accordance with the agency\'s Medicaid attendance policy, this occurrence represents the client\'s first active missed-appointment strike within the rolling 365-day period.'
      );
    } else if (n === 2) {
      sentences.push(
        'This occurrence represents the client\'s second active missed-appointment strike under the agency\'s Medicaid attendance policy within the rolling 365-day period.'
      );
    } else if (n >= 3) {
      sentences.push(
        'This occurrence represents the client\'s third active missed-appointment strike within the agency\'s rolling 365-day Medicaid attendance policy.'
      );
      if (
        waiver?.action === 'waive_termination'
        || waiver?.action === 'recommend_waive_termination'
        || strikeResult?.terminationRecommendationWaived
      ) {
        sentences.push(
          `${actorTitle} reviewed the attendance concern and waived the termination/discharge recommendation associated with the third strike${waiver?.reason ? ` due to ${String(waiver.reason).replace(/_/g, ' ')}` : ''}. The client remains at two active strikes for policy purposes. Continued scheduling is recommended with ongoing attention to attendance and timely communication regarding needed schedule changes. Agency administration and the provider's supervisor have been notified.`
        );
      } else {
        sentences.push(
          'The provider elected to keep the third-strike termination/discharge recommendation on record for their own clinical decision-making. This is not an automatic termination.'
        );
      }
    }
  }

  const extra = String(additionalComments || '').trim();
  if (extra) {
    sentences.push(`Additional comments: ${extra}`);
  }

  return sentences.filter(Boolean).join(' ');
}

export async function previewAppointmentChange(appointmentId, facts = {}, { actorUserId = null, actorRole = 'staff' } = {}) {
  const bundle = await getAppointmentBundle(appointmentId, { includeTimeline: false });
  if (!bundle) throw Object.assign(new Error('Appointment not found'), { status: 404 });

  const participants = await Appointment.listParticipants(appointmentId);
  const clientId = safeInt(facts.clientId) || (await resolveBillingClientId(appointmentId));
  if (!clientId || !participants.some((p) => Number(p.clientId) === clientId)) {
    throw Object.assign(new Error('Select a client attached to this appointment'), { status: 400 });
  }
  const eventType = String(facts.eventType || '').toLowerCase();
  if (!['canceled', 'no_show', 'rescheduled', 'void'].includes(eventType)) {
    throw Object.assign(new Error('eventType is required'), { status: 400 });
  }

  const evaluation = ['canceled', 'rescheduled'].includes(eventType)
    ? await evaluateCancel({
        appointment: bundle,
        actorRole,
        clientId,
        waive: false
      })
    : {
        isLate: eventType === 'no_show',
        withinNotice: eventType !== 'no_show',
        recommendedFeeCents: 0,
        recommendedPackageAction: 'forfeit',
        policy: null,
        allowed: true
      };

  if (eventType === 'no_show') {
    const fullEval = await evaluateCancel({
      appointment: bundle,
      actorRole,
      clientId,
      waive: false
    }).catch(() => null);
    if (fullEval) {
      evaluation.recommendedFeeCents = fullEval.policy?.noShowFeeCents ?? fullEval.recommendedFeeCents;
      evaluation.recommendedPackageAction = fullEval.policy?.noShowPackageAction || 'forfeit';
      evaluation.policy = fullEval.policy;
      evaluation.cancelDeadlineAt = fullEval.cancelDeadlineAt;
      evaluation.noticeHours = fullEval.policy?.noticeHours;
    }
    evaluation.isLate = true;
    evaluation.withinNotice = false;
  }

  if (!evaluation.allowed) throw Object.assign(new Error(evaluation.blockReason || 'This cancellation is not allowed'), { status: 403 });

  const { classification, isLate, isMissed, providerCaused } = classifyEvent({
    eventType,
    evaluation,
    initiator: facts.initiator
  });

  const payer = await loadClientPayerHint(clientId);
  const strikePolicyEnabled = await loadAgencyStrikePolicyEnabled(bundle.agencyId);
  const packageBalance = bundle.clinicalSessionId && !bundle.packageEntitlementId ? null : await loadPackageBalanceHint({
    agencyId: bundle.agencyId,
    clientId,
    packageEntitlementId: bundle.packageEntitlementId,
    providerUserId: bundle.providerUserId, appointmentId: bundle.id
  });

  let consequence = determineConsequenceModel({
    classification,
    isMedicaid: payer.isMedicaid,
    strikePolicyEnabled,
    packageBalance,
    evaluation,
    initiator: facts.initiator
  });

  let strikePreview = null;
  if (consequence.model === 'medicaid_strike' && clientId) {
    const active = await ClientMedicaidAttendanceStrike.countActive({
      agencyId: bundle.agencyId,
      clientId
    });
    const nextNumber = active + 1;
    strikePreview = {
      activeBefore: active,
      strikeNumber: nextNumber,
      terminationRecommendation: nextNumber >= 3,
      canRecommendWaiveTermination: nextNumber >= 3
    };
    consequence = {
      ...consequence,
      strike: strikePreview,
      summary:
        nextNumber >= 3
          ? 'Third Strike — Administrative/Clinical Review Recommended'
          : `System result: Strike ${nextNumber}`
    };
  }

  let nextAppointment = null;
  if (safeInt(facts.replacementAppointmentId)) {
    const replacement = await Appointment.findById(facts.replacementAppointmentId);
    const replacementParticipants = replacement ? await Appointment.listParticipants(replacement.id) : [];
    if (!replacement || replacement.id === bundle.id || Number(replacement.agencyId) !== Number(bundle.agencyId)
      || !replacementParticipants.some((p) => Number(p.clientId) === clientId)
      || !['scheduled', 'confirmed', 'client_confirmed', 'draft'].includes(replacement.status)) {
      throw Object.assign(new Error('Replacement must be another active appointment for this client in this agency'), { status: 400 });
    }
    nextAppointment = { id: replacement.id, startAt: replacement.startAt, displayWhen: formatApptWhen(replacement.startAt) };
  }

  const canWaive = isAdminRole(actorRole);
  if (canWaive && ['waive', 'waived'].includes(facts.waiver?.action) && ['fee', 'package'].includes(consequence.model)) {
    consequence = { ...consequence, feeCents: 0, packageAction: consequence.model === 'package' ? 'waived' : 'release',
      after: consequence.before ? { ...consequence.before } : undefined,
      summary: 'The consequence is waived. No fee or package allowance will be used.' };
  }
  const waiverOptions = {
    canWaiveDirectly: canWaive && ['fee', 'package'].includes(consequence.model),
    canRecommendWaiver: !canWaive && ['fee', 'package'].includes(consequence.model),
    // Provider (any role) decides terminate recommendation waive for themselves — not an admin queue.
    canWaiveTermination: !!strikePreview?.terminationRecommendation,
    canRecommendWaiveTermination: !!strikePreview?.terminationRecommendation,
    showFeeActions: consequence.model === 'fee',
    showPackageActions: consequence.model === 'package',
    showStrikeActions: consequence.model === 'medicaid_strike'
  };

  const insuranceClaim = DEFAULT_INSURANCE_CLAIM_POLICY;

  const narrative = assembleAppointmentChangeNarrative({
    eventType,
    initiator: facts.initiator,
    reasons: facts.reasons,
    reasonOther: facts.reasonOther,
    outreach: facts.outreach,
    classification,
    nextAppointment,
    consequence,
    strikeResult: strikePreview,
    waiver: facts.waiver || null,
    actorTitle: 'The provider',
    additionalComments: facts.additionalComments
  });

  let providerName = null;
  if (bundle.providerUserId) {
    try {
      const u = await User.findById(bundle.providerUserId);
      providerName = u ? `${u.first_name || ''} ${u.last_name || ''}`.trim() : null;
    } catch { /* ignore */ }
  }

  return {
    appointment: {
      id: bundle.id,
      agencyId: bundle.agencyId,
      startAt: bundle.startAt,
      endAt: bundle.endAt,
      status: bundle.status,
      title: bundle.title,
      providerUserId: bundle.providerUserId,
      providerName,
      clientId,
      packageEntitlementId: bundle.packageEntitlementId,
      clinicalSessionId: bundle.clinicalSessionId || null,
      displayWhen: formatApptWhen(bundle.startAt, bundle.sourceTimezone)
    },
    eventType,
    classification,
    isLate: !!isLate,
    isMissed: !!isMissed,
    providerCaused: !!providerCaused,
    evaluation: {
      withinNotice: !!evaluation.withinNotice,
      isLate: !!evaluation.isLate,
      cancelDeadlineAt: evaluation.cancelDeadlineAt || null,
      noticeHours: evaluation.policy?.noticeHours ?? evaluation.noticeHours ?? null,
      recommendedFeeCents: Number(evaluation.recommendedFeeCents || 0),
      recommendedPackageAction: evaluation.recommendedPackageAction || null,
      policyName: evaluation.policy?.name || null
    },
    payer,
    packageBalance,
    consequence,
    strike: strikePreview,
    nextAppointment,
    waiverRequested: facts.waiver?.action === 'recommend',
    waiverOptions,
    insuranceClaim,
    narrative: `Scheduled ${bundle.title || 'session'}: ${formatApptWhen(bundle.startAt, bundle.sourceTimezone)}${providerName ? ` with ${providerName}` : ''}. ${narrative} No service was rendered. This note is nonbillable.`,
    actorRole,
    canWaive
  };
}

async function applyAppointmentChange(
  appointmentId,
  facts = {},
  { actorUserId = null, actorRole = 'staff' } = {},
  preview
) {
  const eventType = preview.eventType;
  const clientId = preview.appointment.clientId;
  const waiveDirect =
    preview.canWaive
    && (facts.waiver?.action === 'waive' || facts.waiver?.action === 'waived');

  let resultBundle = null;
  let settlement = null;
  let strikeRecord = null;
  let dischargeReview = null; // legacy field retained as null — provider decides; admins are notified on waive
  let strikeNotify = null;
  let billingArtifacts = null;

  const appointment = await Appointment.findById(appointmentId);
  const noConsequence = waiveDirect || preview.providerCaused || ['none', 'medicaid_strike'].includes(preview.consequence.model);
  const status = eventType === 'void' ? 'voided' : eventType === 'no_show' ? 'no_show'
    : preview.isLate ? 'late_canceled' : eventType === 'rescheduled' ? 'rescheduled'
      : facts.initiator === 'parent_guardian' ? 'canceled_by_guardian'
        : ['client', 'caregiver'].includes(facts.initiator) ? 'canceled_by_client'
          : ['agency', 'facility_school'].includes(facts.initiator) ? 'canceled_by_organization' : 'canceled_by_provider';
  resultBundle = await updateAppointment(appointmentId, {
    status, cancellationReason: facts.reasonOther || (facts.reasons || []).join(', ') || eventType,
    cancellationFeeCents: noConsequence ? 0 : Number(preview.consequence.feeCents || 0),
    canceledAt: new Date().toISOString().slice(0, 19).replace('T', ' '), canceledByUserId: actorUserId,
    cancellationRecommendationJson: { workflow: 'appointment_change', preview, facts }
  }, { actorUserId, settleOutcome: false });
  if (appointment.packageEntitlementId) {
    settlement = await BookingPackage.applyAppointmentUsage({ entitlementId: appointment.packageEntitlementId,
      agencyId: appointment.agencyId, appointmentId, mode: noConsequence || preview.consequence.packageAction === 'release' ? 'release' : 'forfeit', actorUserId });
    const applied = settlement?.appliedUsage;
    if (!noConsequence && applied) preview.consequence = { ...preview.consequence,
      packageAction: applied.creditBucket === 'free_miss' ? 'free_miss' : applied.creditBucket === 'bonus' ? 'bonus_credit' : 'session_credit',
      before: applied.before || preview.consequence.before, after: applied.after || preview.consequence.after };

  } else if (!noConsequence && preview.packageBalance?.source === 'practitioner_package') {
    if (!appointment.providerScheduleEventId) throw Object.assign(new Error('Link this package session to the provider calendar before applying its missed-session policy'), { status: 409 });
    settlement = await applyMissedSessionPolicy({ agencyId: appointment.agencyId, clientId,
      entitlementId: preview.packageBalance.entitlementId, createdByUserId: actorUserId, providerScheduleEventId: appointment.providerScheduleEventId });
  }
  if (preview.consequence.model === 'fee' || waiveDirect) {
    await Appointment.upsertBilling(appointmentId, {
      ...(await Appointment.getBilling(appointmentId) || {}),
      amountCents: noConsequence ? 0 : Number(preview.consequence.feeCents || 0),
      paymentStatus: noConsequence ? 'waived' : 'fee_pending',
      notes: 'Appointment-change consequence; not an insurance claim'
    });
  }
  await cancelPendingReminders(appointmentId);
  await releaseAppointmentCalendar(appointment, actorUserId);

  if (preview.consequence.model === 'medicaid_strike' && clientId && preview.isMissed) {
    const existing = await ClientMedicaidAttendanceStrike.findByAppointmentId(appointmentId);
    if (!existing) {
      const activeBefore = await ClientMedicaidAttendanceStrike.countActive({
        agencyId: preview.appointment.agencyId,
        clientId
      });
      const strikeNumber = activeBefore + 1;
      strikeRecord = await ClientMedicaidAttendanceStrike.create({
        agencyId: preview.appointment.agencyId,
        clientId,
        appointmentId,
        eventKind: eventType === 'no_show' ? 'no_show' : 'late_cancel',
        terminationRecommendation: strikeNumber >= 3,
        createdByUserId: actorUserId
      });
      if (
        strikeNumber >= 3
        && (facts.waiver?.action === 'recommend_waive_termination'
          || facts.waiver?.action === 'waive_termination')
      ) {
        strikeRecord = await ClientMedicaidAttendanceStrike.waiveTerminationRecommendation(
          strikeRecord.id,
          {
            reason: facts.waiver?.reason || null,
            comment: facts.waiver?.comment || null,
            waivedByUserId: actorUserId,
            keepAsTwoStrikes: true
          }
        );
        strikeNotify = await notifyThirdStrikeWaived({
          agencyId: preview.appointment.agencyId,
          clientId,
          strike: strikeRecord,
          appointmentId,
          providerWaiveReason: facts.waiver?.reason || null,
          actorUserId
        });
      }
      const activeAfterWaive = await ClientMedicaidAttendanceStrike.countActive({
        agencyId: preview.appointment.agencyId,
        clientId
      });
      preview.strike = {
        activeBefore,
        strikeNumber,
        activeAfter: activeAfterWaive,
        terminationRecommendation: strikeNumber >= 3 && !strikeRecord.terminationRecommendationWaived,
        terminationRecommendationWaived: !!strikeRecord.terminationRecommendationWaived,
        keptAsTwoStrikes: !!strikeRecord.terminationRecommendationWaived
      };
    } else {
      strikeRecord = existing;
    }
  }

  billingArtifacts = { primarySessionClaimBlocked: true, secondaryClaimDraft: null };

  const narrative = assembleAppointmentChangeNarrative({
    eventType,
    initiator: facts.initiator,
    reasons: facts.reasons,
    reasonOther: facts.reasonOther,
    outreach: facts.outreach,
    classification: preview.classification,
    nextAppointment: preview.nextAppointment,
    consequence: waiveDirect && preview.consequence.model === 'package'
      ? { ...preview.consequence, packageAction: 'waived' }
      : preview.consequence,
    strikeResult: preview.strike,
    waiver: facts.waiver || null,
    actorTitle: 'The provider',
    additionalComments: facts.additionalComments
  });


  return {
    ok: true,
    appointment: resultBundle,
    settlement,
    strike: strikeRecord,
    dischargeReview,
    strikeNotify,
    billingArtifacts,
    insuranceClaim: preview.insuranceClaim || DEFAULT_INSURANCE_CLAIM_POLICY,
    preview,
    narrative: `Scheduled ${preview.appointment.title || 'session'}: ${preview.appointment.displayWhen}${preview.appointment.providerName ? ` with ${preview.appointment.providerName}` : ''}. ${narrative} No service was rendered. This note is nonbillable.`,
    noteId: null
  };
}

export async function completeAppointmentChange(appointmentId, facts = {}, actor = {}) {
  if (!['canceled', 'rescheduled', 'no_show', 'void'].includes(facts.eventType)) {
    throw Object.assign(new Error('Choose an appointment change event'), { status: 400 });
  }
  if (facts.eventType !== 'void' && facts.eventType !== 'no_show' && (!facts.initiator || !facts.reasons?.length)) {
    throw Object.assign(new Error('Initiator and cancellation reason are required'), { status: 400 });
  }
  if (facts.reasons?.includes('other') && !String(facts.reasonOther || '').trim()) {
    throw Object.assign(new Error('Specify the other reason'), { status: 400 });
  }
  if (facts.eventType === 'no_show' && (!facts.outreach?.length || typeof facts.reasonKnown !== 'boolean')) {
    throw Object.assign(new Error('Document outreach and whether the no-show reason is known'), { status: 400 });
  }
  if (facts.eventType === 'no_show' && facts.reasonKnown === true && !facts.reasons?.length) {
    throw Object.assign(new Error('Document the known reason for the no-show'), { status: 400 });
  }
  if (facts.eventType === 'void' && !String(facts.reasonOther || facts.additionalComments || '').trim()) {
    throw Object.assign(new Error('A reason is required to void an appointment'), { status: 400 });
  }
  if (facts.eventType === 'rescheduled' && !safeInt(facts.replacementAppointmentId)) {
    throw Object.assign(new Error('Book the replacement appointment and link it before signing'), { status: 400 });
  }
  if (['waive', 'waived'].includes(facts.waiver?.action) && !isAdminRole(actor.actorRole)) {
    throw Object.assign(new Error('Administrator access is required to approve a waiver'), { status: 403 });
  }
  if (facts.waiver?.action && !String(facts.waiver.reason || '').trim()) {
    throw Object.assign(new Error('A waiver reason is required'), { status: 400 });
  }
  return runSignedAppointmentChange(appointmentId, facts, actor, {
    previewChange: async (...args) => {
      const preview = await previewAppointmentChange(...args);
      if (facts.waiver?.action === 'recommend' && !['fee', 'package'].includes(preview.consequence.model)) {
        throw Object.assign(new Error('There is no fee or package consequence to send for waiver review'), { status: 400 });
      }
      if (facts.eventType === 'no_show') {
        const start = preview.appointment.startAt;
        const instant = start instanceof Date ? start : new Date(String(start).replace(' ', 'T').replace(/Z?$/, 'Z'));
        if (instant > new Date()) throw Object.assign(new Error('A future appointment cannot be marked no-show'), { status: 400 });
      }
      if (preview.appointment.packageEntitlementId && preview.evaluation.recommendedPackageAction === 'review'
        && preview.isLate && !['waive', 'waived'].includes(facts.waiver?.action)) {
        throw Object.assign(new Error('This package consequence requires administrative review before completion'), { status: 409 });
      }
      return preview;
    }, applyChange: applyAppointmentChange
  });
}

export async function setAgencyMedicaidStrikePolicy(agencyId, enabled) {
  const aid = safeInt(agencyId);
  if (!aid) throw Object.assign(new Error('agencyId required'), { status: 400 });
  await pool.execute(
    `UPDATE agencies SET medicaid_strike_policy_enabled = ? WHERE id = ?`,
    [enabled ? 1 : 0, aid]
  );
  return { agencyId: aid, medicaidStrikePolicyEnabled: !!enabled };
}

export async function getAgencyMedicaidStrikePolicy(agencyId) {
  return {
    agencyId: Number(agencyId),
    medicaidStrikePolicyEnabled: await loadAgencyStrikePolicyEnabled(agencyId)
  };
}

export default {
  previewAppointmentChange,
  completeAppointmentChange,
  assembleAppointmentChangeNarrative,
  setAgencyMedicaidStrikePolicy,
  getAgencyMedicaidStrikePolicy
};
