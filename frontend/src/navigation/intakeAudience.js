/** Shared by the form and its receipt so repeated field names keep the right audience. */
export function intakeAudienceMatches(audience, subject) {
  const value = String(audience || '').trim().toLowerCase();
  const required = { self: 'self', dependent: 'dependent', guardian: 'dependent', couple: 'couple', couple_partner: 'couple', family: 'family', family_member: 'family' }[value];
  return !required || required === subject;
}
