const emailAddress = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;
const emailInText = /[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

export function normalizeStaffContactAddress(value) {
  const address = String(value || '').trim().toLowerCase();
  return emailAddress.test(address) ? address : '';
}

export function tenantStaffWorkAddress(staff, domain) {
  if (!domain) return '';
  const privateAddress = normalizeStaffContactAddress(staff?.personal_email);
  return [staff?.work_mailbox_email, staff?.work_email].map(normalizeStaffContactAddress)
    .find(address => address.endsWith(`@${domain}`) && address !== privateAddress) || '';
}

export function redactStaffPrivateAddresses(text, staff, domain) {
  const privateAddress = normalizeStaffContactAddress(staff?.personal_email);
  const login = normalizeStaffContactAddress(staff?.email);
  const work = normalizeStaffContactAddress(staff?.work_email);
  const privateAddresses = new Set([privateAddress, login, work].filter(address => address &&
    (address === privateAddress || !domain || !address.endsWith(`@${domain}`))));
  return String(text || '').replace(emailInText, address => privateAddresses.has(address.toLowerCase()) ? 'the agency’s Messages inbox' : address);
}
