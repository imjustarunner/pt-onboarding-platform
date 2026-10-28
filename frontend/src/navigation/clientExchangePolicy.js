// Shared by the exchange UI and API (this directory ships in the backend image).
export const exchangeStaffRole = role => ['staff', 'support', 'admin', 'super_admin'].includes(String(role || '').trim().toLowerCase());

const labels = {
  account: 'Active provider account', assigned: 'Current assignment', direct_referral: 'Direct referral recipient',
  accepting: 'Accepting new clients', format: 'Visit format', provider_gender: 'Therapist gender preference',
  age: 'Client age', clinical_exclusions: 'Clinical exclusions', diagnoses: 'Diagnosis coverage', concerns: 'Clinical concerns',
  service: 'Service type', insurance: 'Insurance acceptance', insurance_credential: 'Insurance credentials',
  insurance_exclusions: 'Insurance exclusions', schedule: 'Days and times', location: 'In-person location',
  location_availability: 'Location availability', specialties: 'Specialties', ageGroups: 'Age preferences',
  populations: 'Populations', modalities: 'Therapy approaches'
};
export function exchangeCheckLabel(field) {
  if (field.endsWith('_exclusions') && !labels[field]) return `${exchangeCheckLabel(field.slice(0, -11))} exclusions`;
  return labels[field] || field.replace(/_/g, ' ');
}
export const exchangeCheckCanBeWaived = field => Boolean(labels[field] || ['specialties_exclusions', 'ageGroups_exclusions', 'populations_exclusions', 'modalities_exclusions'].includes(field))
  && !['account', 'assigned', 'direct_referral', 'insurance', 'insurance_credential', 'insurance_exclusions'].includes(field);
