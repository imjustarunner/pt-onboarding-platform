/** Provider-confirmed attendance, shared by the writer, review and signing. */
export function clinicalClientPresent(metadata = {}) {
  const context = metadata.narrivaContext || {};
  const chart = metadata.structuredChart || {};
  const encounter = metadata.sessionContext || metadata;
  const participants = String(encounter.participants || metadata.participants || '').trim();
  if (/without client|client (?:not present|absent)|others.*not present|guardian only|parent only|collateral only/i.test(participants)) return false;
  if (/\bclient\b/i.test(participants)) return true;
  if (typeof context.clientPresent === 'boolean') return context.clientPresent;
  if (typeof chart.patientPresent === 'boolean') return chart.patientPresent;
  return null;
}

export function clinicalServiceRequirements({serviceCode, assessmentKind, clientPresent} = {}) {
  const code = String(serviceCode || '').trim().toUpperCase();
  const assessment = ['90791','H0031'].includes(code);
  const initialAssessment = assessment && assessmentKind !== 'additional';
  const planning = code === 'H0032';
  const screening = code === 'H0002';
  const outreach = ['H0023','H0025'].includes(code);
  const crisis = ['H2011','90839','90840'].includes(code);
  const administrativeClinical = planning || screening || outreach || crisis || assessmentKind === 'additional';
  return {
    assessment, initialAssessment, planning, screening, outreach,
    clientPresent, directAssessment:clientPresent !== false,
    requireDiagnosis:!['H0031','H0032','H0002','H0023','H0025'].includes(code),
    requireParticipation:!assessment && !administrativeClinical && clientPresent !== false,
    requireProgress:!assessment && !administrativeClinical,
    requireExistingGoals:!assessment && !administrativeClinical,
    actionLabel:assessment ? 'assessment activities' : planning ? 'treatment planning activities' : screening ? 'screening activities' : outreach ? 'outreach or coordination activities' : 'service actions and interventions'
  };
}
