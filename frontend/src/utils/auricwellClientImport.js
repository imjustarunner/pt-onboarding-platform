const cleanKey = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export const nonemptyFields = value => Object.fromEntries(Object.entries(value || {}).filter(([, item]) => item != null && String(item).trim() !== ''));

export function importDate(value) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : text;
}

export function splitDemographicsContacts(text) {
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const index = lines.findIndex(line => /^\s*(additional contacts?|emergency contacts?|contacts)\s*:?\s*$/i.test(line));
  return index < 0 ? { demographics: lines.join('\n'), contacts: '' } : { demographics: lines.slice(0, index).join('\n'), contacts: lines.slice(index + 1).join('\n') };
}

function labeledLines(text, aliases) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(line => line.trim()).filter(Boolean);
  const values = [], unmatched = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const colon = line.match(/^([^:\t]+)\s*[:\t]\s*(.*)$/);
    const label = colon ? colon[1] : line;
    const field = aliases[cleanKey(label)];
    if (!field) { unmatched.push(line); continue; }
    let value = colon?.[2] || '';
    if (!value && lines[i + 1] && !aliases[cleanKey(lines[i + 1].split(/[:\t]/)[0])]) value = lines[++i];
    values.push({ field, value });
  }
  return { values, unmatched };
}

const CONTACT_FIELDS = {
  name: 'fullName', fullname: 'fullName', contactname: 'fullName', legalname: 'fullName',
  relationship: 'relationshipType', relationshiptype: 'relationshipType', relationshiptoclient: 'relationshipType',
  phone: 'phone', phonenumber: 'phone', mobilephone: 'phone', cellphone: 'phone', homephone: 'phone',
  email: 'email', emailaddress: 'email'
};

export function parseAdditionalContacts(text) {
  const raw = String(text || '').trim();
  if (!raw) return { contacts: [], warnings: [] };
  const lines = raw.replace(/\r/g, '').split('\n').filter(line => line.trim());
  const header = lines[0].split('\t').map(value => CONTACT_FIELDS[cleanKey(value)]);
  if (header.includes('fullName') && header.filter(Boolean).length > 1) {
    const contacts = lines.slice(1).map(line => Object.fromEntries(line.split('\t').map((value, index) => [header[index], value.trim()]).filter(([key]) => key)));
    return { contacts: contacts.filter(contact => Object.values(contact).some(Boolean)), warnings: [] };
  }
  const { values, unmatched } = labeledLines(raw, CONTACT_FIELDS);
  const contacts = [];
  let current = {};
  for (const { field, value } of values) {
    if (field === 'fullName' && Object.values(current).some(Boolean)) { contacts.push(current); current = {}; }
    if (value) current[field] = value;
  }
  if (Object.values(current).some(Boolean)) contacts.push(current);
  return { contacts, warnings: unmatched.length ? [`${unmatched.length} contact line(s) were not recognized. Compare the original paste and add missing contacts below.`] : [] };
}

const POLICY_FIELDS = {
  insurer: 'insurerName', insurername: 'insurerName', insurance: 'insurerName', insurancecarrier: 'insurerName', insurancecompany: 'insurerName', payer: 'insurerName', payername: 'insurerName', carrier: 'insurerName',
  payerid: 'payerId', electronicpayerid: 'payerId', eligibilitypayerid: 'eligibilityPayerId',
  memberid: 'memberId', membernumber: 'memberId', memberidentificationnumber: 'memberId', policyid: 'memberId', policynumber: 'memberId', insuranceid: 'memberId', medicaidid: 'memberId',
  group: 'groupNumber', groupid: 'groupNumber', groupnumber: 'groupNumber', patientsuffix: 'patientSuffix',
  subscriber: 'subscriberName', subscribername: 'subscriberName', policyholder: 'subscriberName', policyholdername: 'subscriberName', insuredname: 'subscriberName',
  subscriberfirstname: 'subscriberFirstName', subscriberlegalfirstname: 'subscriberFirstName', subscriberlastname: 'subscriberLastName', subscriberlegallastname: 'subscriberLastName',
  subscriberdob: 'subscriberDob', subscriberdateofbirth: 'subscriberDob', policyholderdob: 'subscriberDob',
  relationship: 'relationshipToSubscriber', relationshiptosubscriber: 'relationshipToSubscriber', patientrelationshiptosubscriber: 'relationshipToSubscriber',
  subscriberaddress: 'subscriberAddressLine1', subscriberaddressline1: 'subscriberAddressLine1', subscriberaddressline2: 'subscriberAddressLine2', subscribercity: 'subscriberCity', subscriberstate: 'subscriberState', subscriberzip: 'subscriberPostalCode', subscriberpostalcode: 'subscriberPostalCode',
  subscribersex: 'subscriberSex', plantype: 'planType', insurancetype: 'planType', effectivedate: 'effectiveDate', coverageeffectivedate: 'effectiveDate', terminationdate: 'terminationDate', coverageenddate: 'terminationDate', claimsphone: 'claimsPhone'
};

export function parseInsurancePaste(text) {
  const blocks = { primary: [], secondary: [] };
  let slot = 'primary';
  for (const line of String(text || '').replace(/\r/g, '').split('\n')) {
    const heading = line.trim().match(/^(primary|secondary)(?:\s+(?:insurance|coverage|policy))?\s*(?::\s*(.*))?$/i);
    if (heading) {
      slot = heading[1].toLowerCase();
      if (heading[2]?.trim()) blocks[slot].push(`Insurance carrier: ${heading[2].trim()}`);
    } else {
      const prefixed = line.match(/^\s*(primary|secondary)\s+(.+)$/i);
      if (prefixed) { slot = prefixed[1].toLowerCase(); blocks[slot].push(prefixed[2]); }
      else blocks[slot].push(line);
    }
  }
  const warnings = [];
  const output = {};
  for (const position of ['primary', 'secondary']) {
    const { values, unmatched } = labeledLines(blocks[position].join('\n'), POLICY_FIELDS);
    const policy = Object.fromEntries(values.filter(row => row.value).map(({ field, value }) => [field, value]));
    for (const key of ['subscriberDob', 'effectiveDate', 'terminationDate']) if (policy[key]) policy[key] = importDate(policy[key]);
    if (policy.relationshipToSubscriber) {
      const relationship = cleanKey(policy.relationshipToSubscriber);
      policy.relationshipToSubscriber = /^(self|child|spouse|other)$/.test(relationship) ? relationship : /son|daughter|dependent/.test(relationship) ? 'child' : '';
      if (!policy.relationshipToSubscriber) warnings.push(`${position === 'primary' ? 'Primary' : 'Secondary'} coverage: choose the client’s relationship to the subscriber; the source value was unclear.`);
    }
    if (policy.subscriberSex) policy.subscriberSex = ({male:'M',female:'F',unknown:'U',m:'M',f:'F',u:'U'})[String(policy.subscriberSex).toLowerCase()] || policy.subscriberSex;
    if (policy.subscriberName && !policy.subscriberFirstName && !policy.subscriberLastName) {
      const comma = policy.subscriberName.split(',').map(part=>part.trim());
      const parts = policy.subscriberName.split(/\s+/);
      if (comma.length === 2) { policy.subscriberFirstName = comma[1]; policy.subscriberLastName = comma[0]; }
      else if (parts.length > 1) { policy.subscriberFirstName = parts.shift(); policy.subscriberLastName = parts.join(' '); }
    }
    output[position] = Object.keys(policy).length ? policy : null;
    if (unmatched.length) warnings.push(`${position === 'primary' ? 'Primary' : 'Secondary'} coverage: ${unmatched.length} line(s) were not recognized. Compare the original paste before saving.`);
  }
  return { primary: output.primary || {}, secondary: output.secondary, warnings };
}

export function contactMatches(contact, items) {
  const email = String(contact.email || '').trim().toLowerCase();
  const phone = String(contact.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
  const name = cleanKey(contact.fullName);
  return items.filter(item => {
    const existing = item.contact || {};
    const existingPhone = String(existing.phone || '').replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
    return (email && email === String(existing.email || '').trim().toLowerCase()) || (phone && phone === existingPhone) || (name && name === cleanKey(existing.fullName));
  });
}
