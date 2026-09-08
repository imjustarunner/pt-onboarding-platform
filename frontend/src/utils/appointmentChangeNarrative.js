/**
 * Client-side narrative mirror for Appointment Change Workflow (preview while typing).
 * Server assembleAppointmentChangeNarrative is the signed source of truth.
 */
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

export function assembleLocalNarrative({
  eventType,
  initiator,
  reasons = [],
  reasonOther = '',
  outreach = [],
  classification,
  nextAppointment = null,
  consequence = null,
  strike = null,
  waiver = null,
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
  const dueTo = reasonParts.length ? ` due to ${reasonParts.join('; ')}` : '';
  const et = String(eventType || '').toLowerCase();

  if (et === 'no_show') {
    sentences.push(`The provider indicated that the client did not attend the scheduled session${dueTo}.`);
  } else if (et === 'rescheduled') {
    sentences.push(
      `The provider indicated that ${initiatorLabel} requested to reschedule the scheduled session${dueTo}.`
    );
  } else if (et === 'void') {
    sentences.push(
      'The provider indicated that this appointment was voided (completed in error, duplicate, or similar).'
    );
  } else if (et) {
    sentences.push(
      `The provider indicated that ${initiatorLabel} canceled the scheduled session${dueTo}.`
    );
  }

  if (classification === 'late_cancel' || classification === 'late_cancel_reschedule') {
    sentences.push(
      "The cancellation occurred within the agency's late-cancellation period and was classified as a late cancellation."
    );
  }

  const outreachKeys = Array.isArray(outreach) ? outreach : [];
  if (outreachKeys.length && !outreachKeys.includes('not_required')) {
    const bits = outreachKeys.map((k) => OUTREACH_PHRASES[String(k).toLowerCase()]).filter(Boolean);
    if (bits.length) {
      sentences.push(`The provider attempted outreach and ${bits.join(', ')}.`);
    }
  }

  if (nextAppointment?.displayWhen) {
    sentences.push(`The client's next session is scheduled for ${nextAppointment.displayWhen}.`);
  } else if (et && et !== 'void') {
    sentences.push('The client does not currently have another session scheduled.');
  }

  if (consequence?.model === 'fee') {
    if (waiver?.action === 'waive') {
      sentences.push(
        `The missed-appointment fee was waived${waiver.reason ? ` due to ${String(waiver.reason).replace(/_/g, ' ')}` : ''}.`
      );
    } else if (waiver?.action === 'recommend') {
      if (consequence.summary) sentences.push(consequence.summary);
      sentences.push(
        `The provider recommends that the fee consequence be waived${waiver.reason ? ` due to ${String(waiver.reason).replace(/_/g, ' ')}` : ''}. The recommendation is pending administrative review.`
      );
    } else if (consequence.summary) {
      sentences.push(consequence.summary);
    }
  } else if (consequence?.model === 'package') {
    if (consequence.packageAction === 'free_miss') {
      sentences.push(
        "In accordance with the client's package, the available free miss was applied. No session credit was deducted"
          + (consequence.after?.sessionsRemaining != null
            ? `, and ${consequence.after.sessionsRemaining} session credits remain.`
            : '.')
      );
    } else if (consequence.packageAction === 'session_credit') {
      sentences.push(
        "One session credit was applied to the missed appointment in accordance with the client's package terms"
          + (consequence.after?.sessionsRemaining != null
            ? `. ${consequence.after.sessionsRemaining} session credits remain.`
            : '.')
      );
    }
    if (waiver?.action === 'recommend') {
      sentences.push(
        `The provider recommends that the session-credit consequence be waived${waiver.reason ? ` due to ${String(waiver.reason).replace(/_/g, ' ')}` : ''}. The recommendation is pending administrative review.`
      );
    }
  } else if (consequence?.model === 'medicaid_strike' || strike) {
    const n = Number(strike?.strikeNumber || 0);
    if (n === 1) {
      sentences.push(
        "In accordance with the agency's Medicaid attendance policy, this occurrence represents the client's first active missed-appointment strike within the rolling 365-day period."
      );
    } else if (n === 2) {
      sentences.push(
        "This occurrence represents the client's second active missed-appointment strike under the agency's Medicaid attendance policy within the rolling 365-day period."
      );
    } else if (n >= 3) {
      sentences.push(
        "This occurrence represents the client's third active missed-appointment strike within the agency's rolling 365-day Medicaid attendance policy."
      );
      if (waiver?.action === 'recommend_waive_termination') {
        sentences.push(
          `The provider recommends that the termination/discharge recommendation associated with the third strike be waived${waiver.reason ? ` due to ${String(waiver.reason).replace(/_/g, ' ')}` : ''}. Continued scheduling is recommended.`
        );
      } else {
        sentences.push(
          'In accordance with agency policy, the attendance pattern is being referred for review regarding continued scheduling and service arrangements.'
        );
      }
    }
  }

  const extra = String(additionalComments || '').trim();
  if (extra) sentences.push(`Additional comments: ${extra}`);

  return sentences.filter(Boolean).join(' ');
}

export const CANCEL_INITIATORS = [
  { id: 'client', label: 'Client' },
  { id: 'parent_guardian', label: 'Parent/guardian' },
  { id: 'caregiver', label: 'Caregiver' },
  { id: 'provider', label: 'Clinician/provider' },
  { id: 'coach', label: 'Coach/consultant/tutor' },
  { id: 'agency', label: 'Agency' },
  { id: 'facility_school', label: 'Facility/school' },
  { id: 'payer', label: 'Payer/insurance' },
  { id: 'other', label: 'Other' }
];

export const CANCEL_REASONS = [
  { id: 'illness', label: 'Illness' },
  { id: 'family_emergency', label: 'Family emergency' },
  { id: 'transportation', label: 'Transportation issue' },
  { id: 'work_conflict', label: 'Work conflict' },
  { id: 'school_conflict', label: 'School conflict' },
  { id: 'scheduling_conflict', label: 'Scheduling conflict' },
  { id: 'no_longer_wants', label: 'Client no longer wants appointment' },
  { id: 'provider_unavailable', label: 'Provider unavailable' },
  { id: 'facility_school_issue', label: 'Facility/school closure' },
  { id: 'weather', label: 'Weather' },
  { id: 'authorization', label: 'Authorization/insurance issue' },
  { id: 'scheduling_error', label: 'Scheduling error' },
  { id: 'other', label: 'Other' }
];

export const OUTREACH_OPTIONS = [
  { id: 'called', label: 'Called' },
  { id: 'left_voicemail', label: 'Left voicemail' },
  { id: 'sent_message', label: 'Sent message' },
  { id: 'unable_to_reach', label: 'Unable to reach' },
  { id: 'not_required', label: 'Outreach not required' }
];

export const WAIVER_REASONS = [
  { id: 'client_illness', label: 'Client illness' },
  { id: 'family_emergency', label: 'Family emergency' },
  { id: 'transportation_emergency', label: 'Transportation emergency' },
  { id: 'technology_failure', label: 'Technology failure' },
  { id: 'scheduling_misunderstanding', label: 'Scheduling misunderstanding' },
  { id: 'other', label: 'Other' }
];

export const TERMINATION_WAIVE_REASONS = [
  { id: 'barriers', label: 'Client has significant barriers to attendance' },
  { id: 'medical_family', label: 'Medical or family circumstances' },
  { id: 'transportation', label: 'Transportation barriers' },
  { id: 'modify_schedule', label: 'Scheduling arrangement can be modified' },
  { id: 'improvement', label: 'Client has demonstrated improvement' },
  { id: 'clinically_appropriate', label: 'Continued care is clinically appropriate' },
  { id: 'another_opportunity', label: 'Provider recommends another opportunity' },
  { id: 'other', label: 'Other' }
];
