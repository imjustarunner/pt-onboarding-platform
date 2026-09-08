/**
 * Appointment Change Workflow — preview consequence + assemble narrative + complete.
 * Provider reports facts; system classifies late/miss, consequence, and writes the note.
 */
import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import ClientMedicaidAttendanceStrike from '../models/ClientMedicaidAttendanceStrike.model.js';
import ClientNotes from '../models/ClientNotes.model.js';
import AgencyMedicalServiceCode from '../models/AgencyMedicalServiceCode.model.js';
import User from '../models/User.model.js';
import { evaluateCancel } from './bookingCancellationPolicy.service.js';
import {
  cancelAppointment,
  getAppointmentBundle,
  settleAppointment,
  updateAppointment
} from './appointment.service.js';
import { applyMissedSessionPolicy } from './practitionerPackage.service.js';

/**
 * Hard rule: not-occurring appointments never create a primary session insurance claim.
 * Secondary / missed-fee claim drafts are opt-in only via agency_medical_service_codes override.
 */
const DEFAULT_INSURANCE_CLAIM_POLICY = Object.freeze({
  willCreatePrimarySessionClaim: false,
  willCreateSecondaryClaim: false,
  willAutoSubmit: false,
  reason: 'Not-occurring appointments do not create insurance claims by default.'
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

function formatApptWhen(isoOrMysql) {
  if (!isoOrMysql) return null;
  const d = new Date(String(isoOrMysql).includes('T') ? isoOrMysql : String(isoOrMysql).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-US', {
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

function triggerKeyForClassification(classification, eventType) {
  const c = String(classification || '').toLowerCase();
  const et = String(eventType || '').toLowerCase();
  if (et === 'no_show' || c === 'no_show') return 'no_show';
  if (c.includes('late_cancel') || c === 'late_cancel') return 'late_cancel';
  return null;
}

async function resolveSessionServiceCode(appointment) {
  const clinicalSessionId = safeInt(appointment?.clinicalSessionId);
  if (clinicalSessionId) {
    try {
      const { default: ClinicalSession } = await import('../models/clinical/ClinicalSession.model.js');
      const session = await ClinicalSession.findById(clinicalSessionId);
      const code = session?.service_code || session?.effective_service_code;
      if (code) return String(code).trim().toUpperCase();
    } catch { /* optional */ }
  }
  if (appointment?.tenantServiceId) {
    try {
      const [rows] = await pool.execute(
        `SELECT service_code FROM tenant_services WHERE id = ? LIMIT 1`,
        [Number(appointment.tenantServiceId)]
      );
      const code = rows?.[0]?.service_code;
      if (code) return String(code).trim().toUpperCase();
    } catch { /* optional */ }
  }
  return null;
}

async function resolveMissedBillingOverride({ agencyId, appointment, classification, eventType }) {
  const trigger = triggerKeyForClassification(classification, eventType);
  const base = {
    ...DEFAULT_INSURANCE_CLAIM_POLICY,
    mode: 'none',
    sourceServiceCode: null,
    claimServiceCode: null,
    trigger,
    applies: false
  };
  if (!trigger || ['void', 'advance_cancel', 'advance_reschedule'].includes(String(classification || ''))) {
    return base;
  }
  const sourceCode = await resolveSessionServiceCode(appointment);
  if (!sourceCode || !agencyId) return { ...base, sourceServiceCode: sourceCode };
  let row = null;
  try {
    row = await AgencyMedicalServiceCode.findByAgencyAndCode(agencyId, sourceCode);
  } catch {
    return { ...base, sourceServiceCode: sourceCode };
  }
  if (!row) return { ...base, sourceServiceCode: sourceCode };

  const mode = String(row.missed_billing_mode || 'none').toLowerCase();
  const triggers = String(row.missed_billing_triggers || 'no_show,late_cancel')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const applies = mode !== 'none' && triggers.includes(trigger);
  const claimCode = row.missed_billing_service_code
    ? String(row.missed_billing_service_code).toUpperCase()
    : null;

  return {
    willCreatePrimarySessionClaim: false,
    willCreateSecondaryClaim: applies && mode === 'secondary_claim_draft',
    willAutoSubmit: false,
    reason: applies
      ? (mode === 'secondary_claim_draft'
        ? `Opt-in override on ${sourceCode}: draft secondary claim${claimCode ? ` using ${claimCode}` : ''} for billing review (not auto-submitted).`
        : `Opt-in override on ${sourceCode}: record missed fee on appointment ledger only (no insurance claim).`)
      : DEFAULT_INSURANCE_CLAIM_POLICY.reason,
    mode: applies ? mode : 'none',
    sourceServiceCode: sourceCode,
    claimServiceCode: claimCode,
    trigger,
    applies
  };
}

/**
 * Block primary session claim; optionally queue fee or draft secondary claim per override.
 * Never auto-submits to a clearinghouse.
 */
async function applyMissedBillingArtifacts({
  appointment,
  clientId,
  classification,
  eventType,
  feeCents = 0,
  override = null,
  actorUserId = null,
  waiveDirect = false
}) {
  const out = {
    primarySessionClaimBlocked: true,
    feeLedger: null,
    secondaryClaimDraft: null
  };

  const clinicalSessionId = safeInt(appointment?.clinicalSessionId);
  if (clinicalSessionId) {
    try {
      const clinicalPool = (await import('../config/clinicalDatabase.js')).default;
      const encounterStatus = String(eventType) === 'no_show' ? 'no_show' : 'canceled';
      await clinicalPool.execute(
        `UPDATE clinical_sessions
         SET encounter_status = ?,
             claim_blocked_reason = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          encounterStatus,
          'Appointment did not occur — primary session claim blocked by appointment change workflow',
          clinicalSessionId
        ]
      );
    } catch (e) {
      console.warn('[appointmentChange] claim block on session failed', e?.message || e);
    }
  }

  if (waiveDirect || !override?.applies) {
    // Still block primary claim even when no override.
    return out;
  }

  if (override.mode === 'fee_ledger_only') {
    const amount = feeCents > 0 ? feeCents : Number(appointment?.cancellationFeeCents || 0);
    if (amount > 0) {
      try {
        await Appointment.upsertBilling(appointment.id, {
          amountCents: amount,
          paymentStatus: 'fee_pending',
          notes: `Missed-appointment fee (${override.trigger || eventType}); not an insurance claim`
        });
        out.feeLedger = { amountCents: amount, paymentStatus: 'fee_pending' };
      } catch (e) {
        console.warn('[appointmentChange] fee ledger failed', e?.message || e);
      }
    }
  }

  if (override.mode === 'secondary_claim_draft' && clinicalSessionId && clientId) {
    try {
      const ClinicalClaim = (await import('../models/clinical/ClinicalClaim.model.js')).default;
      const claim = await ClinicalClaim.create({
        clinicalSessionId,
        agencyId: appointment.agencyId,
        clientId,
        claimStatus: 'PENDING',
        amountCents: feeCents || 0,
        metadataJson: {
          kind: 'missed_appointment_secondary',
          sourceServiceCode: override.sourceServiceCode,
          claimServiceCode: override.claimServiceCode || override.sourceServiceCode,
          trigger: override.trigger,
          appointmentId: appointment.id,
          autoSubmit: false,
          note: 'Draft only — billing team must review before submit. Primary session code was not billed.'
        },
        createdByUserId: actorUserId
      });
      out.secondaryClaimDraft = {
        id: claim?.id || null,
        status: 'PENDING',
        claimServiceCode: override.claimServiceCode || override.sourceServiceCode
      };
    } catch (e) {
      console.warn('[appointmentChange] secondary claim draft failed', e?.message || e);
    }
  }

  return out;
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

async function findNextAppointment({ agencyId, clientId, afterStartAt, excludeId }) {
  const aid = safeInt(agencyId);
  const cid = safeInt(clientId);
  if (!aid || !cid || !afterStartAt) return null;
  const [rows] = await pool.execute(
    `SELECT a.id, a.start_at, a.end_at, a.status, a.title
     FROM appointments a
     INNER JOIN appointment_participants ap ON ap.appointment_id = a.id AND ap.client_id = ?
     WHERE a.agency_id = ?
       AND a.id <> ?
       AND a.start_at > ?
       AND a.status IN ('draft','confirmed','client_confirmed','reschedule_requested')
     ORDER BY a.start_at ASC
     LIMIT 1`,
    [cid, aid, Number(excludeId || 0), afterStartAt]
  );
  const r = rows?.[0];
  if (!r) return null;
  return {
    id: Number(r.id),
    startAt: r.start_at,
    endAt: r.end_at,
    status: r.status,
    title: r.title,
    displayWhen: formatApptWhen(r.start_at)
  };
}

async function loadPackageBalanceHint({ agencyId, clientId, packageEntitlementId, providerUserId }) {
  if (!packageEntitlementId && !(agencyId && clientId)) {
    return null;
  }
  try {
    if (packageEntitlementId) {
      const [rows] = await pool.execute(
        `SELECT e.id, e.sessions_remaining, e.free_rebooks_remaining, e.status,
                p.name AS package_name
         FROM booking_package_entitlements e
         LEFT JOIN booking_packages p ON p.id = e.booking_package_id
         WHERE e.id = ? LIMIT 1`,
        [Number(packageEntitlementId)]
      );
      const r = rows?.[0];
      if (r) {
        return {
          entitlementId: Number(r.id),
          sessionsRemaining: Number(r.sessions_remaining || 0),
          freeMissesRemaining: Number(r.free_rebooks_remaining || 0),
          packageName: r.package_name || 'Package',
          source: 'booking_package'
        };
      }
    }
  } catch { /* table may differ */ }

  try {
    const [rows] = await pool.execute(
      `SELECT e.id, e.sessions_remaining, e.free_rebooks_remaining, e.status,
              p.name AS package_name
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

  if (packageBalance && qualifying) {
    const free = Number(packageBalance.freeMissesRemaining || 0);
    const sessions = Number(packageBalance.sessionsRemaining || 0);
    if (free > 0) {
      return {
        model: 'package',
        label: 'Plan / Package-Based',
        feeCents: 0,
        packageAction: 'free_miss',
        before: { sessionsRemaining: sessions, freeMissesRemaining: free },
        after: { sessionsRemaining: sessions, freeMissesRemaining: free - 1 },
        summary: 'Free miss used. No session credit deducted.'
      };
    }
    return {
      model: 'package',
      label: 'Plan / Package-Based',
      feeCents: 0,
      packageAction: 'session_credit',
      before: { sessionsRemaining: sessions, freeMissesRemaining: free },
      after: {
        sessionsRemaining: Math.max(0, sessions - 1),
        freeMissesRemaining: free
      },
      summary: 'One session credit applies to the missed appointment.'
    };
  }

  const feeCents = Number(evaluation?.recommendedFeeCents || 0);
  if (feeCents > 0 && qualifying) {
    return {
      model: 'fee',
      label: 'Eligible non-Medicaid — missed-appointment fee',
      feeCents,
      packageAction: evaluation?.recommendedPackageAction || 'forfeit',
      summary: `A $${(feeCents / 100).toFixed(2)} missed-appointment fee applies per agency policy.`
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
          || `A $${((consequence.feeCents || 0) / 100).toFixed(2)} missed-appointment fee will be assessed in accordance with agency policy.`
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
    } else if (consequence.packageAction === 'session_credit') {
      sentences.push(
        'The client\'s included free miss had previously been used; therefore, one session credit was applied to the missed appointment in accordance with the client\'s package terms'
          + (consequence.after?.sessionsRemaining != null
            ? `. ${consequence.after.sessionsRemaining} session credit${consequence.after.sessionsRemaining === 1 ? '' : 's'} remain.`
            : '.')
      );
    }
    if (waiver?.action === 'recommend') {
      sentences.push(
        `${actorTitle} recommends that the session-credit consequence be waived${waiver.reason ? ` due to ${String(waiver.reason).replace(/_/g, ' ')}` : ''}. The recommendation is pending administrative review.`
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

  const clientId = safeInt(facts.clientId) || (await resolveBillingClientId(appointmentId));
  const eventType = String(facts.eventType || '').toLowerCase();
  if (!['canceled', 'no_show', 'rescheduled', 'void'].includes(eventType)) {
    throw Object.assign(new Error('eventType is required'), { status: 400 });
  }

  const evaluation = ['canceled', 'rescheduled'].includes(eventType)
    ? await evaluateCancel({
        appointment: bundle,
        actorRole,
        clientId,
        waive: !!facts.waive
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
      evaluation.recommendedFeeCents = fullEval.recommendedFeeCents;
      evaluation.recommendedPackageAction = fullEval.recommendedPackageAction;
      evaluation.policy = fullEval.policy;
      evaluation.cancelDeadlineAt = fullEval.cancelDeadlineAt;
      evaluation.noticeHours = fullEval.policy?.noticeHours;
    }
    evaluation.isLate = true;
    evaluation.withinNotice = false;
  }

  const { classification, isLate, isMissed, providerCaused } = classifyEvent({
    eventType,
    evaluation,
    initiator: facts.initiator
  });

  const payer = await loadClientPayerHint(clientId);
  const strikePolicyEnabled = await loadAgencyStrikePolicyEnabled(bundle.agencyId);
  const packageBalance = await loadPackageBalanceHint({
    agencyId: bundle.agencyId,
    clientId,
    packageEntitlementId: bundle.packageEntitlementId,
    providerUserId: bundle.providerUserId
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

  const nextAppointment =
    safeInt(facts.replacementAppointmentId)
      ? await Appointment.findById(facts.replacementAppointmentId).then((a) =>
          a
            ? {
                id: a.id,
                startAt: a.startAt,
                endAt: a.endAt,
                status: a.status,
                title: a.title,
                displayWhen: formatApptWhen(a.startAt)
              }
            : null
        )
      : await findNextAppointment({
          agencyId: bundle.agencyId,
          clientId,
          afterStartAt: bundle.startAt,
          excludeId: bundle.id
        });

  const canWaive = isAdminRole(actorRole);
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

  const insuranceClaim = await resolveMissedBillingOverride({
    agencyId: bundle.agencyId,
    appointment: bundle,
    classification,
    eventType
  });

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
      displayWhen: formatApptWhen(bundle.startAt)
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
    waiverOptions,
    insuranceClaim,
    narrative,
    actorRole,
    canWaive
  };
}

export async function completeAppointmentChange(
  appointmentId,
  facts = {},
  { actorUserId = null, actorRole = 'staff' } = {}
) {
  const preview = await previewAppointmentChange(appointmentId, facts, { actorUserId, actorRole });
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

  if (eventType === 'void') {
    resultBundle = await updateAppointment(
      appointmentId,
      {
        status: 'voided',
        cancellationReason: facts.reasonOther || (facts.reasons || []).join(', ') || 'Voided',
        canceledAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        canceledByUserId: actorUserId,
        updatedByUserId: actorUserId,
        cancellationRecommendationJson: {
          workflow: 'appointment_change',
          eventType: 'void',
          facts
        }
      },
      { actorUserId }
    );
  } else if (eventType === 'no_show') {
    resultBundle = await updateAppointment(
      appointmentId,
      {
        status: 'no_show',
        cancellationReason: (facts.reasons || []).join(', ') || facts.reasonOther || 'No-show',
        cancellationFeeCents: waiveDirect ? 0 : preview.consequence.feeCents || 0,
        canceledAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        canceledByUserId: actorUserId,
        updatedByUserId: actorUserId,
        cancellationRecommendationJson: {
          workflow: 'appointment_change',
          preview,
          facts
        }
      },
      { actorUserId }
    );
    try {
      settlement = await settleAppointment(appointmentId, {
        outcome: 'no_show',
        actorUserId
      });
    } catch { /* best-effort */ }

    if (
      preview.consequence.model === 'package'
      && preview.consequence.packageAction === 'free_miss'
      && !waiveDirect
    ) {
      try {
        await applyMissedSessionPolicy({
          agencyId: preview.appointment.agencyId,
          clientId,
          createdByUserId: actorUserId,
          providerScheduleEventId: preview.appointment.providerUserId
            ? (await Appointment.findById(appointmentId))?.providerScheduleEventId
            : null
        });
      } catch { /* best-effort */ }
    }
  } else if (eventType === 'rescheduled') {
    const status = preview.classification === 'late_cancel_reschedule'
      ? 'late_canceled'
      : 'rescheduled';
    resultBundle = await updateAppointment(
      appointmentId,
      {
        status,
        cancellationReason: (facts.reasons || []).join(', ') || 'Rescheduled',
        cancellationFeeCents: waiveDirect ? 0 : (preview.isLate ? preview.consequence.feeCents : 0),
        canceledAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
        canceledByUserId: actorUserId,
        updatedByUserId: actorUserId,
        cancellationRecommendationJson: {
          workflow: 'appointment_change',
          preview,
          facts,
          replacementAppointmentId: facts.replacementAppointmentId || preview.nextAppointment?.id || null
        }
      },
      { actorUserId }
    );
  } else {
    // canceled
    const status = preview.classification === 'late_cancel'
      ? 'late_canceled'
      : facts.initiator === 'client'
        ? 'canceled_by_client'
        : facts.initiator === 'parent_guardian'
          ? 'canceled_by_guardian'
          : facts.initiator === 'agency' || facts.initiator === 'facility_school'
            ? 'canceled_by_organization'
            : 'canceled_by_provider';

    resultBundle = await cancelAppointment(appointmentId, {
      status,
      actorUserId,
      actorRole,
      reason: (facts.reasons || []).map((r) => String(r)).join(', ') || facts.reasonOther || 'Canceled',
      notes: facts.additionalComments || null,
      clientId,
      waive: waiveDirect,
      waiverReason: facts.waiver?.reason || facts.waiver?.comment || null
    });
  }

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

  // Never bill the primary session code for a non-occurring appointment.
  // Fee ledger / secondary claim draft only when an explicit service-code override applies.
  try {
    const apptRow = await Appointment.findById(appointmentId);
    billingArtifacts = await applyMissedBillingArtifacts({
      appointment: apptRow || preview.appointment,
      clientId,
      classification: preview.classification,
      eventType,
      feeCents: waiveDirect ? 0 : Number(preview.consequence?.feeCents || preview.evaluation?.recommendedFeeCents || 0),
      override: preview.insuranceClaim,
      actorUserId,
      waiveDirect
    });
  } catch (e) {
    console.warn('[appointmentChange] billing artifacts failed', e?.message || e);
  }

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

  let note = null;
  if (clientId && narrative) {
    try {
      note = await ClientNotes.create(
        {
          client_id: clientId,
          author_id: actorUserId,
          category: 'clinical',
          urgency: 'normal',
          message: `[Missed appointment note]\n\n${narrative}`,
          is_internal_only: true
        },
        { hasAgencyAccess: true, canViewInternalNotes: true }
      );
    } catch (e) {
      console.warn('[appointmentChange] note create failed', e?.message || e);
    }
  }

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
    narrative,
    noteId: note?.id || null
  };
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
