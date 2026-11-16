const fields = ['fullName', 'email', 'phone', 'address', 'city', 'state', 'postalCode'];
const invalid = message => Object.assign(new Error(message), { status: 400 });

/** Account ownership is resolved from the saved submission, never a browser user ID. */
export function normalizeIntakeResponsibleParty(input) {
  if (input == null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) throw invalid('Choose the responsible billing party.');
  if (!input.kind) return null;
  if (input.kind === 'applicant') return { kind: 'applicant' };
  if (input.kind !== 'other') throw invalid('Choose yourself or provide the responsible party’s contact information.');
  const contact = {};
  for (const field of fields) {
    const value = input.contact?.[field];
    if (typeof value !== 'string' || !value.trim() || value.length > (field === 'address' ? 500 : 255)) throw invalid('Enter the responsible party’s name, email, phone and complete mailing address.');
    contact[field] = value.trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) throw invalid('Enter one valid billing email address.');
  return { kind: 'other', contact };
}
