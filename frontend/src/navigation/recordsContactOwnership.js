export const portalContactRelationships = Object.freeze(['Mother', 'Father', 'Parent', 'Stepmother', 'Stepfather', 'Legal guardian', 'Guardian', 'Grandparent', 'Spouse', 'Other']);

const emailKey = value => String(value || '').trim().toLowerCase();
const contactPhones = contact => [contact.mobilePhone, contact.phone, contact.homePhone, contact.workPhone];
const phoneKey = value => {
  const digits = String(value || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  return digits.length === 10 ? digits : '';
};

export const isParentContact = contact =>
  /^(father|mother|parent|guardian|legal guardian|stepfather|stepmother|padre|madre|tutor)$/i.test(contact.relationshipType || '') ||
  /^(guardian|legal guardian)$/i.test(contact.contactType || '');

export function matchingGuardian(patient, contacts) {
  const email = emailKey(patient?.email);
  const phone = phoneKey(patient?.contactPhone);
  const parents = contacts.filter(isParentContact);
  const emailMatches = parents.filter(contact => email && emailKey(contact.email) === email);
  const phoneMatches = parents.filter(contact => phone && contactPhones(contact).some(value => phoneKey(value) === phone));
  const contact = emailMatches.length === 1 ? emailMatches[0] :
    !emailMatches.length && phoneMatches.length === 1 ? phoneMatches[0] : null;
  if (!contact) return null;
  const contactEmail = emailKey(contact.email);
  const contactPhone = phoneKey(contact.mobilePhone || contact.phone || contact.homePhone || contact.workPhone);
  if (email && contactEmail && email !== contactEmail || phone && contactPhone && !phoneMatches.includes(contact)) return null;
  return { contact, emailMatched: !!email && email === contactEmail, phoneMatched: !!phone && phoneMatches.length === 1 && phone === contactPhone };
}

export function suggestRecordsContactOwnership(patient, contacts, today) {
  const birthDate = String(patient?.dateOfBirth || '').slice(0, 10);
  const validBirthDate = /^\d{4}-\d{2}-\d{2}$/.test(birthDate) && Number.isFinite(Date.parse(birthDate))
    && new Date(birthDate).toISOString().slice(0,10) === birthDate;
  const adult = validBirthDate &&
    Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4)) - Number(today.slice(5) < birthDate.slice(5)) >= 18;
  const hasContact = !!(emailKey(patient?.email) || phoneKey(patient?.contactPhone));
  const sharedDetails = contacts.some(contact =>
    emailKey(patient?.email) && emailKey(patient?.email) === emailKey(contact.email) ||
    phoneKey(patient?.contactPhone) && contactPhones(contact).some(phone => phoneKey(phone) === phoneKey(patient.contactPhone)));
  const explicitGuardian = contacts.some(contact => [contact.relationshipType, contact.contactType].some(value => /^(legal guardian|guardian)$/i.test(value || '')));
  const owner = adult && hasContact && !sharedDetails && !explicitGuardian ? 'client' : 'guardian';
  return { owner, clientClassification: owner === 'client' ? 'independent' : 'dependent', hasContact };
}
