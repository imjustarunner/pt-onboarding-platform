// Reuse the completed enrollment's question labels and answers, excluding
// identity, payment, signatures and administrative delivery information.
const administrativeSection = /who this packet is for|^applicant|waivers|acknowledg|signature|authorization|consent|hipaa|privacy notice|policy and services|insurance|payment|billing|communication|reminder|provider selection|release of information|school roi/i;
const administrativeLabel = /(?:^|\b)(?:first name|last name|full name|legal name|preferred name|date of birth|dob|email|phone|address|postal|zip code|member id|policy number|insurance|payment|card number|ssn|signature|password|token|appointment reminder|availability)(?:\b|$)/i;
export function clinicalRowsFromCompletedIntake(record) {
  return (record?.sections || []).filter(section => !administrativeSection.test(section.title || '') && !/PHQ[- ]?(?:9|A)|GAD[- ]?7|PSC[- ]?17/i.test(section.title || '')).flatMap(section =>
    (section.rows || []).filter(row => !administrativeLabel.test(row.label || '') && !/(?:phq|gad|psc).*total|total.*(?:phq|gad|psc)/i.test(row.label || '') && row.value != null && row.value !== '').map(row => ({ section: section.title, question: row.label, answer: row.value })));
}
