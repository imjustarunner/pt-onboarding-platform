const text = (value, limit) => typeof value === 'string' ? value.trim().slice(0, limit) : '';
const relationshipLabels = { manager: 'Direct supervisor', coworker: 'Colleague or coworker', direct_report: 'I reported to them', other: 'Other' };

// Application relationships are free text. Preserve unfamiliar descriptions rather
// than guessing a reporting relationship or asking the referee to enter it again.
export function referenceContactDetails(source = {}) {
  if (!source || typeof source !== 'object') source = {};
  const relationship = text(source.relationshipType || source.relationship, 500);
  const aliases = { supervisor: 'manager', 'direct supervisor': 'manager', 'colleague or coworker': 'coworker', colleague: 'coworker', 'co-worker': 'coworker', 'i reported to them': 'direct_report' };
  const key = relationship.toLowerCase();
  const relationshipType = Object.hasOwn(relationshipLabels, key) ? key : (Object.hasOwn(aliases, key) ? aliases[key] : relationship ? 'other' : '');
  const relationshipOther = relationshipType === 'other'
    ? text(source.relationshipOther || (key !== 'other' ? relationship : ''), 500) : '';
  const duration = text(source.relationshipDuration, 40);
  return {
    referenceName: text(source.referenceName || source.name, 255),
    referenceEmail: text(source.referenceEmail || source.email, 320),
    referencePhone: text(source.referencePhone || source.phone || source.phone_number, 100),
    referenceOrganization: text(source.referenceOrganization || source.organization, 255),
    relationshipType,
    relationshipOther,
    relationshipLabel: relationshipType === 'other' ? relationshipOther || 'Other' : relationshipLabels[relationshipType] || '',
    relationshipDuration: ['under_1_year', '1_2_years', '3_5_years', 'over_5_years'].includes(duration) ? duration : ''
  };
}
