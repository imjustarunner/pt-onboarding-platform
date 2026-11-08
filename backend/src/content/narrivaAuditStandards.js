// Versioned transcription of the user's supplied CCHA self-audit checklist.
// This is not a declaration that this historical edition applies to every payer
// or date of service. Keep identity/claim/PDF evidence inside the application.
export const CCHA_AUDIT_STANDARD_VERSION = 'ccha-sfy25-26-2025-05';
const check = (id, label, evidence, sourcePage, conditional = false) => ({ id, label, evidence, sourcePage, conditional });
export const NARRIVA_AUDIT_STANDARD = {
  id: CCHA_AUDIT_STANDARD_VERSION,
  title: 'CCHA Behavioral Health Encounter Data Quality Review',
  edition: 'SFY25–26 · May 2025',
  sourceFile: 'ITSCO LLC - PSYC_RESID 411 Scorecard SFY25.pdf',
  sourceSha256: 'addf99d4ec05eb3f875c861a69478e8feeec4c769640b428f707c7b3f900026d',
  sourcePages: [2, 3, 4, 5, 6, 7, 8],
  scope: 'Professional psychotherapy and residential encounters. Confirm the applicable payer and service-date handbook edition before relying on this reference.',
  disclaimer: 'Internal audit readiness support. Narriva approval and its 70% quality threshold are not payer approval or a prediction of reimbursement. This supplied standard does not specify a numeric passing cutoff.',
  groups: [
    { id: 'general', label: 'Record and submission requirements', checks: [
      check('general.encounter_pdf', 'One complete PDF for each sampled encounter line.', 'internal', 5),
      check('general.identity_match', 'Patient identifiers match the claim.', 'internal', 5),
      check('general.page_identifiers', 'At least two visible patient identifiers appear on every submitted page.', 'internal', 5),
      check('general.signature', 'Each service note has a dated rendering-provider signature and credentials or title.', 'internal', 5),
      check('general.service_dates', 'Documentation dates match the claim start and end dates.', 'internal', 6),
      check('general.distinct_services', 'Each distinct service has separate documentation and signature.', 'internal', 6),
      check('general.complete_record', 'All required documentation elements are present.', 'internal', 6),
      check('general.timespan', 'For multiday claims, documentation covers every service date.', 'internal', 6, true)
    ] },
    { id: 'procedure', label: 'Encounter procedure code', checks: [
      check('procedure.claim_match', 'The claim procedure matches the documented service.', 'internal', 6),
      check('procedure.duration', 'The timed service meets the applicable minimum and maximum duration.', 'internal', 6),
      check('procedure.service_content', 'The narrative supports the service definition, required content, and technical documentation.', 'narrative', 6),
      check('procedure.progress', 'The service content addresses progress toward treatment goals or discharge.', 'narrative', 6),
      check('procedure.signature_type', 'The rendering provider signature is electronic or legible handwritten, with credentials or title.', 'internal', 6),
      check('procedure.prtf', 'Where applicable, PRTF services use the required revenue code rather than H0017, H0018, or H0019.', 'internal', 6, true),
      check('procedure.em_addon', 'Where applicable, a psychotherapy E/M add-on has documented evaluation and management service.', 'internal', 3, true)
    ] },
    { id: 'diagnosis', label: 'Encounter diagnosis', checks: [
      check('diagnosis.treated', 'The documented clinical evidence identifies the condition treated.', 'narrative', 6),
      check('diagnosis.current', 'The diagnosis is current for the date of service.', 'internal', 6),
      check('diagnosis.covered', 'The diagnosis is covered or is an explicitly permitted exception.', 'internal', 6),
      check('diagnosis.claim_match', 'The documented diagnosis matches the claim at the required specificity.', 'internal', 6),
      check('diagnosis.episode', 'The documented diagnosis belongs to the applicable episode of care.', 'internal', 6)
    ] },
    { id: 'place', label: 'Place of service', checks: [
      check('place.permitted', 'The place of service is permitted for the service code.', 'internal', 7),
      check('place.description', 'The documented setting describes the place of service, not just a building or street address.', 'internal', 7),
      check('place.telehealth', 'Telehealth documentation distinguishes the patient being at home from another location.', 'internal', 7, true),
      check('place.consent', 'Telehealth participation has documented verbal or written consent.', 'internal', 7, true),
      check('place.audio_barriers', 'For audio-only services, documentation explains barriers to alternative delivery.', 'narrative', 7, true)
    ] },
    { id: 'category', label: 'Service/program category', checks: [
      check('category.modifier', 'Required modifiers are present, permitted for the service, and valid for the service date.', 'internal', 7),
      check('category.procedure_dependency', 'Procedure-code requirements pass before service/program category can pass.', 'internal', 7),
      check('category.audio_modifier', 'For audio-only service, FQ is in the first available modifier position when required by this edition.', 'internal', 7, true)
    ] },
    { id: 'units', label: 'Encounter units', checks: [
      check('units.duration', 'Start/end times or total contact time support the units.', 'internal', 7),
      check('units.timespan', 'For multiday claims, every service date has supporting documentation.', 'internal', 7, true),
      check('units.calculation', 'Units follow the applicable handbook unit calculation.', 'internal', 7),
      check('units.claim_match', 'Claim units match documented service length or occurrences.', 'internal', 7),
      check('units.extended_90834', 'Where applicable, an extended 90834 encounter follows this edition’s two-unit same-line requirement.', 'internal', 7, true)
    ] },
    { id: 'dates', label: 'Service dates', checks: [
      check('dates.start', 'The documented start date matches the encounter claim.', 'internal', 7),
      check('dates.end_present', 'The service end date or applicable discharge date is documented.', 'internal', 8),
      check('dates.end_match', 'The documented end date matches the encounter claim.', 'internal', 8)
    ] },
    { id: 'population', label: 'Population', checks: [
      check('population.birth_date', 'The submitted record contains date of birth; this is verified internally and never sent to Narriva.', 'internal', 8),
      check('population.eligible_age', 'Age at service meets the applicable code’s population requirements.', 'internal', 8)
    ] },
    { id: 'duration', label: 'Documented duration', checks: [
      check('duration.documented', 'Timed services document length or start and end times.', 'internal', 8),
      check('duration.allowed', 'Documented duration fits the applicable service rule.', 'internal', 8)
    ] },
    { id: 'staff', label: 'Staff requirements', checks: [
      check('staff.visible_credentials', 'The rendering provider’s credentials or eligible title appear in the service documentation.', 'internal', 8),
      check('staff.eligible', 'The provider’s qualifications at the service date meet the service requirements.', 'internal', 8)
    ] }
  ]
};

export const NARRIVA_AUDIT_CHECKS = NARRIVA_AUDIT_STANDARD.groups.flatMap(group => group.checks.map(item => ({ ...item, groupId: group.id })));

// Callers supply only server-verified evidence. A model must not populate the
// internal checks. An absent value is unassessed, not a successful test.
export function summarizeNarrivaAuditEvidence(evidence = {}) {
  const checks = NARRIVA_AUDIT_CHECKS.map(item => {
    const supplied = evidence[item.id];
    const hasEvidence = typeof supplied?.evidence === 'string' && supplied.evidence.trim().length > 0;
    const allowed = ['passed', 'failed', 'not_assessed', ...(item.conditional ? ['not_applicable'] : [])];
    const status = hasEvidence && allowed.includes(supplied?.status) ? supplied.status : 'not_assessed';
    return { ...item, status, detail: hasEvidence ? supplied.evidence.trim() : 'Required evidence has not been verified.' };
  });
  const failedProcedure = checks.some(item => item.groupId === 'procedure' && item.status === 'failed');
  if (failedProcedure) {
    const dependent = checks.find(item => item.id === 'category.procedure_dependency');
    dependent.status = 'failed';
    dependent.detail = 'Procedure-code requirements failed; the service/program category cannot pass.';
  }
  const counts = Object.fromEntries(['passed', 'failed', 'not_assessed', 'not_applicable'].map(status => [status, checks.filter(item => item.status === status).length]));
  const applicable = checks.length - counts.not_applicable;
  return { standardVersion: CCHA_AUDIT_STANDARD_VERSION, checks, counts,
    completenessPercent: applicable ? Math.floor((counts.passed + counts.failed) * 100 / applicable) : 0,
    // No invented payer score or passing threshold.
    status: counts.failed ? 'findings' : counts.not_assessed || applicable === 0 ? 'incomplete' : 'ready_for_review',
    disclaimer: NARRIVA_AUDIT_STANDARD.disclaimer };
}
