import crypto from 'node:crypto';

export const STEDI_AGENCIES = [2, 6, 377];
export const STEDI_MONTHLY_LIMIT = 25;
export const discoveryReasons = ['unknown_insurance', 'missing_member_id', 'eligibility_failed', 'other_coverage_denial'];
const fail = message => Object.assign(new Error(message), { status: 409 });
const text = value => String(value || '').trim();
export const normalizeDiscoveryName = value => text(value).replace(/\s+/g, ' ').toUpperCase();
export function discoveryNpiValid(value) {
  const npi = String(value || '');
  return /^\d{10}$/.test(npi) && [...`80840${npi}`].reverse().map(Number).reduce((sum,n,i)=>{const v=i%2?n*2:n;return sum+(v>9?v-9:v);},0)%10===0;
}
export function validDiscoveryDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value;
}
export function discoveryMonth(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Denver', year: 'numeric', month: '2-digit' }).formatToParts(now);
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
}
export function discoveryPatient(insurance, demographics) {
  // Use a complete saved identity. Do not combine disagreeing identities.
  const saved = insurance?.patient || {};
  const conflict = ['firstName','lastName','dateOfBirth'].some(k => saved[k] && demographics?.[k] && normalizeDiscoveryName(saved[k]) !== normalizeDiscoveryName(demographics[k]));
  return Object.fromEntries(['firstName','lastName','dateOfBirth','addressLine1','addressLine2','city','state','postalCode'].map(k => [k, text(saved[k] || (!conflict && demographics?.[k]) || '')]));
}
export function discoveryFingerprint(patient) {
  return crypto.createHash('sha256').update(JSON.stringify(Object.fromEntries(Object.keys(patient).sort().map(k => [k, normalizeDiscoveryName(patient[k])])))).digest('hex');
}
export function validateDiscoveryConfirmation(input, patient, now = new Date()) {
  if (!patient.firstName || !patient.lastName || !validDiscoveryDate(patient.dateOfBirth) || new Date(patient.dateOfBirth) > now) throw fail('Save a valid legal first name, last name and birthdate before searching.');
  if (!/^[A-Z]{2}$/.test(patient.state.toUpperCase())) throw fail('Save the patient’s current or previous address state before searching.');
  if (!validDiscoveryDate(input.serviceDate)) throw fail('Choose a valid date of service.');
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(String(input.requestKey || ''))) throw fail('Reopen Find insurance to start a new confirmed request.');
  if (input.fingerprint !== discoveryFingerprint(patient)) throw fail('The saved identity changed. Reopen Find insurance and confirm the current details.');
  if (input.nameConfirmed !== true || input.birthdateConfirmed !== true || input.addressConfirmed !== true || input.costConfirmed !== true) throw fail('Confirm name spelling, birthdate, address and the search charge.');
  if (!discoveryReasons.includes(input.reason)) throw fail('Choose why an insurance search is needed.');
  const completeAddress = patient.addressLine1 && patient.city && patient.state && patient.postalCode;
  if (!completeAddress && text(input.missingAddressReason).length < 10) throw fail('Complete the address or explain why only a partial address is available.');
  if (text(input.missingAddressReason).length > 500) throw fail('Keep the address explanation under 500 characters.');
}
export function stediDiscoveryPayload(patient, npi, serviceDate) {
  if (!discoveryNpiValid(npi)) throw fail('Choose an agency billing office with its own valid group NPI.');
  const address = Object.fromEntries(Object.entries({ address1: patient.addressLine1, address2: patient.addressLine2, city: patient.city, state: patient.state.toUpperCase(), postalCode: patient.postalCode }).filter(([,v]) => v));
  return { provider: { npi }, encounter: { dateOfService: serviceDate.replaceAll('-', '') }, subscriber: { firstName: patient.firstName, lastName: patient.lastName, dateOfBirth: patient.dateOfBirth.replaceAll('-', ''), address } };
}
const isoDate = v => { const d = text(v).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3'); return validDiscoveryDate(d) ? d : ''; };
export function discoveryCandidate(item, index, patient) {
  const person = item.dependent || item.subscriber || {}, subscriber = item.subscriber || {};
  const namesMatch = ['firstName','lastName'].every(k => person[k] && normalizeDiscoveryName(person[k]) === normalizeDiscoveryName(patient[k]));
  const identityMatches = namesMatch && !!isoDate(person.dateOfBirth) && isoDate(person.dateOfBirth) === patient.dateOfBirth;
  const address = subscriber.address || {};
  return { index, identityMatches, payerName: item.payer?.name || item.payer?.lastName || 'Unidentified insurer',
    // Stedi payer identifiers are evidence only, never a Claim.MD routing ID.
    reportedPayerId: item.payer?.payorIdentification || '', person,
    policy: { insurerName: item.payer?.name || item.payer?.lastName || '', memberId: subscriber.memberId || '', groupNumber: subscriber.groupNumber || '',
      subscriberFirstName: subscriber.firstName || '', subscriberLastName: subscriber.lastName || '', subscriberDob: isoDate(subscriber.dateOfBirth),
      relationshipToSubscriber: item.dependent ? ({'19':'child','01':'spouse'}[person.relationToSubscriberCode] || 'other') : 'self',
      subscriberAddressLine1: address.address1 || '', subscriberAddressLine2: address.address2 || '', subscriberCity: address.city || '', subscriberState: address.state || '', subscriberPostalCode: address.postalCode || '',
      effectiveDate: isoDate(item.planDateInformation?.planBegin), terminationDate: isoDate(item.planDateInformation?.planEnd), payerId: '', eligibilityPayerId: '' },
    response: item };
}
