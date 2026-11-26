export const supervisorFeedbackSections = {
  'Encounter details': ['service code', 'service location or delivery method', 'date, times or duration', 'participants or consent'],
  Diagnoses: ['diagnosis selection', 'diagnostic justification'],
  'Mental status': ['findings observed', 'findings that could not be assessed'],
  'Risk assessment': ['risk findings', 'safety interventions or follow-up'],
  'Treatment plan': ['goals and objectives', 'objective ratings or progress'],
  Subjective: ['reported symptoms', 'functional impact', 'who reported the information'],
  Objective: ['clinical interventions', 'observations', 'assessment results'],
  Interventions: ['clinical interventions', 'client response'],
  Plan: ['next steps', 'follow-up timing or referrals'],
  Assessments: ['the instrument or source', 'results and clinical interpretation'],
  'Confidential addendums': ['a confidential entry already in the client file'],
  Signature: ['signature or attestation']
};

export const supervisorFeedbackReasons = {
  detail: 'add additional information',
  clarify: 'clarify the documentation',
  correct: 'correct the documentation'
};

export function supervisorFeedbackSentence(selection) {
  const {section, reason, topic} = selection || {};
  if (!Object.hasOwn(supervisorFeedbackSections, section) || !Object.hasOwn(supervisorFeedbackReasons, reason)
    || !supervisorFeedbackSections[section].includes(topic)) return '';
  const location = section === 'Objective' ? 'objective content' : section.toLowerCase();
  return `Can you please ${supervisorFeedbackReasons[reason]} in the ${location} section regarding ${topic}?`;
}

export function eligibleForDocumentationAddendum(selection) {
  return Boolean(supervisorFeedbackSentence(selection)
    && !['Encounter details', 'Diagnoses', 'Risk assessment', 'Confidential addendums', 'Signature'].includes(selection.section));
}
