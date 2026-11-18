const clean = value => String(value || '').replace(/\r/g, '')
  .replace(/\[([^\]]+)\]\([^\n)]*\)/g, '$1').replace(/^\s*#{1,6}\s*/gm, '').trim();
const date = value => value.replace(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, (_, m, d, y) => `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`);
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const CONTACT_PASTE_FIELDS = {
  'Full Name': 'fullName', 'Contact Name': 'fullName', Name: 'fullName',
  'First Name': 'firstName', First: 'firstName', 'Middle Name': 'middleName', Middle: 'middleName', 'Last Name': 'lastName', Last: 'lastName',
  Suffix: 'suffix', Title: 'title', Company: 'company', 'Contact Type': 'contactType', Relationship: 'relationshipType',
  'ROI Signed': 'roiSigned', 'Date of Birth': 'dateOfBirth', 'Appt Reminders': 'appointmentReminders',
  'Appointment Reminders': 'appointmentReminders', Comments: 'comments',
  'Mobile Phone': 'mobilePhone', 'Work Phone': 'workPhone', 'Home Phone': 'homePhone', 'Phone Number': 'phone', Phone: 'phone',
  Fax: 'fax', Email: 'email', 'Email Address': 'email', 'Address 1': 'address1', 'Address 2': 'address2', Address: 'address',
  Country: 'country', 'Zip Code': 'zip', Zip: 'zip', 'City/State': 'cityState', City: 'city', State: 'state', 'Time Zone': 'timezone'
};

function labeledTokens(text, fields, { compact = false } = {}) {
  const labels = Object.keys(fields).sort((a, b) => b.length - a.length);
  const lookup = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key.toLowerCase(), value]));
  const canonical = Object.fromEntries(labels.map(label => [label.toLowerCase(), label]));
  const alternatives = labels.map(escape).join('|');
  const anchor = new RegExp(`^([ \\t]*)(${alternatives})(?=[:\\t(]|[A-Za-z0-9]|[ \\t]*$)[:\\t ]*`, 'i');
  const inline = new RegExp(`(?<![-_])(${alternatives})(?=[:\\t(]|[A-Za-z0-9]|$)[:\\t ]*`, 'g');
  // Browser copies can concatenate values and the next label without whitespace.
  const marked = text.split('\n').map(line => {
    const match = line.match(anchor);
    if (!match) return line;
    if (compact && ['appointmentReminders','comments'].includes(lookup[match[2].toLowerCase()])) return line.replace(anchor, (_, space, label) => `\n@@${lookup[label.toLowerCase()]}@@`);
    if (!compact) return line.replace(anchor, (_, space, label) => `\n@@${lookup[label.toLowerCase()]}@@`);
    const canonicalLine = `${canonical[match[2].toLowerCase()]}:${line.slice(match[0].length)}`;
    return canonicalLine.replace(inline, (_, label) => `\n@@${lookup[label.toLowerCase()]}@@`);
  }).join('\n');
  const tokens = [];
  for (const part of marked.split('\n@@')) {
    const match = part.match(/^(\w+)@@([\s\S]*)$/);
    tokens.push(match ? { key: match[1], value: match[2].trim() } : { key: null, value: part.trim() });
  }
  return tokens;
}

export function parseChartContacts(input) {
  let text = clean(String(input || '').replace(/^\s*#{1,6}\s+([^\n]+)$/gm,'\n@@CONTACT@@\n$1'))
    .replace(/^.*?\bwas\s+added\s+as\s+a\s+(?:Patient\s+)?Contact[.!]?\s*/gmi,'')
    .replace(/svg\s*(?:Edit)/gi, '\n@@CONTACT@@\n')
    .replace(/^\s*(?:Contacts|Additional\s+Contacts|\+?\s*New\s*Contact|Save New Patient Contact|Cancel|Convert to Practice Contact|svg|Edit)\s*$/gmi, '');
  // Some browser copies omit the edit icon/headings. A name immediately before
  // a phone/email label still starts a new card, rather than the previous ROI.
  text = text.replace(/^([^\n@]+)\n(?=(?:Mobile Phone|Home Phone|Work Phone|Email)[:\t(\w])/gm, (line, name) =>
    /\d|^(?:Mobile Phone|Home Phone|Work Phone|Email|Address|Relationship|Contact Type|Appt Reminders|Time Zone|ROI Signed)/i.test(name) || name.trim().split(/\s+/).length < 2 ? line : `@@CONTACT@@\n${name}\n`);
  // A TSV table has one contact per row, including separately named phone fields.
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  const headers = (lines[0] || '').split('\t').map(label => Object.entries(CONTACT_PASTE_FIELDS).find(([key]) => key.toLowerCase() === label.toLowerCase())?.[1]);
  let contacts;
  if (headers.includes('fullName') && headers.filter(Boolean).length > 1) {
    contacts = lines.slice(1).map(line => Object.fromEntries(line.split('\t').map((value, i) => [headers[i], value.trim()]).filter(([key, value]) => key && value)));
  } else {
    contacts = [];
    for (const block of text.split('@@CONTACT@@')) {
      let current = {};
      for (const { key, value } of labeledTokens(block.trim(), CONTACT_PASTE_FIELDS, { compact: true })) {
        if (!value) continue;
        if (key === 'fullName' && Object.keys(current).length) { contacts.push(current); current = {}; }
        if (key) current[key] = value;
        else if (!current.fullName) current.fullName = value.split('\n').map(line=>line.trim()).filter(line=>line&&!/^(?:Contacts|Additional Contacts|\+?\s*New\s*Contact|svg|Edit)$/i.test(line)).join(' ');
      }
      if (Object.keys(current).length) contacts.push(current);
    }
  }
  for (const contact of contacts) {
    contact.fullName ||= [contact.firstName, contact.middleName, contact.lastName, contact.suffix].filter(Boolean).join(' ');
    if (contact.dateOfBirth) contact.dateOfBirth = date(contact.dateOfBirth.replace(/\s*Age\s*:?[\s\S]*$/i,'').trim());
  }
  if (!contacts.length || contacts.some(c => !c.fullName || c.fullName.includes('\n'))) throw Object.assign(new Error('Contact names could not be separated. Copy each contact with its name and field labels.'), { status: 400 });
  if (contacts.length > 100) throw Object.assign(new Error('Import up to 100 contacts at a time'), { status: 400 });
  return contacts;
}

const INSURANCE_FIELDS = {
  'Insurance carrier': 'insurerName', 'Insurer Name': 'insurerName', 'Payer Name': 'insurerName', Payer: 'insurerName', Carrier: 'insurerName',
  'Payer ID': 'payerId', 'Member ID': 'memberId', 'Member Number': 'memberId', 'Policy Group': 'groupNumber', 'Group Number': 'groupNumber', Copay: 'copay',
  Eligibility: 'lastEligibilityCheck', 'Subscriber Name': 'subscriberName', 'Policy Holder Name': 'subscriberName', Name: 'subscriberName',
  'Subscriber DOB': 'subscriberDob', 'Subscriber Date of Birth': 'subscriberDob', 'Date of Birth': 'subscriberDob',
  'Administrative Sex': 'subscriberSex', 'Subscriber Sex': 'subscriberSex', 'Relationship to Subscriber': 'relationshipToSubscriber', 'Policy Holder': 'relationshipToSubscriber',
  'Subscriber Address': 'subscriberAddressLine1', Address: 'subscriberAddressLine1', 'Phone Number': 'subscriberPhone',
  'Effective Date': 'effectiveDate', 'Termination Date': 'terminationDate'
};

export function parseChartInsurance(input, { position = null } = {}) {
  const blocks = { primary: [], secondary: [] };
  let slot = position || 'primary';
  for (const line of clean(input).replace(/\b(?:Show Insurance Card|Verify Eligibility|Edit Policy|Remove Policy)\b[^\n]*/gi, '').split('\n')) {
    const heading = line.trim().match(/^(.+?)\s*(?:\(([^)]+)\))?\s*:\s*(Primary|Secondary)$/i);
    const plain = line.trim().match(/^(Primary|Secondary)(?: Insurance| Coverage| Policy)?\s*:?(.*)$/i);
    if (heading) {
      slot = heading[3].toLowerCase();
      if (position && slot !== position) throw Object.assign(new Error(`This paste is labeled ${slot}. Choose ${slot} coverage before importing it.`), { status: 400 });
      blocks[slot].push(`Insurance carrier:\t${heading[1].trim()}`);
      if (heading[2]) blocks[slot].push(`Payer ID:\t${heading[2]}`);
    } else if (plain) {
      slot = plain[1].toLowerCase();
      if (position && slot !== position) throw Object.assign(new Error(`This paste is labeled ${slot}. Choose ${slot} coverage before importing it.`), { status: 400 });
      if (plain[2].trim()) blocks[slot].push(`Insurance carrier:\t${plain[2].trim()}`);
    } else if (/^Policy Holder:\s*/i.test(line.trim())) {
      blocks[slot].push(`Relationship to Subscriber:\t${line.replace(/^\s*Policy Holder:\s*/i, '').replace(/\s+of$/i, '')}`);
    } else if (!/^\s*(Insurance|Policy Information|Verify Eligibility)\s*$/i.test(line)) blocks[slot].push(line);
  }
  const result = {};
  for (const position of ['primary', 'secondary']) {
    const policy = Object.fromEntries(labeledTokens(blocks[position].join('\n'), INSURANCE_FIELDS).filter(t => t.key && t.value).map(t => [t.key, t.value]));
    if (policy.subscriberAddressLine1) {
      const address = policy.subscriberAddressLine1.split('\n').filter(Boolean);
      const city = address.at(-1)?.match(/^(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/);
      if (city) {
        address.pop(); policy.subscriberCity = city[1].replace(/,$/, ''); policy.subscriberState = city[2]; policy.subscriberPostalCode = city[3];
      }
      policy.subscriberAddressLine1 = address.shift() || '';
      if (address.length) policy.subscriberAddressLine2 = address.join(' ');
    }
    if (policy.relationshipToSubscriber) policy.relationshipToSubscriber = policy.relationshipToSubscriber.toLowerCase().replace(/\s+of$/, '');
    if (policy.subscriberSex) policy.subscriberSex = ({ female: 'F', male: 'M', unknown: 'U' })[policy.subscriberSex.toLowerCase()] || policy.subscriberSex;
    for (const key of ['subscriberDob', 'effectiveDate', 'terminationDate']) if (policy[key]) policy[key] = date(policy[key]);
    if (policy.subscriberName) {
      const parts = policy.subscriberName.split(/\s+/);
      if (parts.length > 1) { policy.subscriberFirstName = parts.shift(); policy.subscriberLastName = parts.join(' '); }
    }
    if (Object.keys(policy).length) result[position] = policy;
  }
  if (!result.primary && !result.secondary) throw Object.assign(new Error('No insurance fields found. Include the carrier and labeled policy information.'), { status: 400 });
  return result;
}

export function parsePatientComments(input) {
  return clean(input).replace(/^Patient Comments\s*\n?/i, '').replace(/^\s*svgEdit\s*$/gm, '').trim();
}

export function parsePayerInformation(input) {
  const text = clean(input).replace(/^\s*(Payer Information|svgEdit|svg|This Payer ID is already in use for this practice\.)\s*$/gm, '');
  const fields = { 'Payer Name': 'payerName', Network: 'network', 'Billing Method': 'billingMethod', 'Insurance Type': 'insuranceType', 'Payer ID': 'sourcePayerId', Address: 'address' };
  const payer = Object.fromEntries(labeledTokens(text, fields).filter(token => token.key && token.value).map(token => [token.key, token.value]));
  if (!payer.payerName && !payer.sourcePayerId) throw Object.assign(new Error('Include the payer name or payer ID from TherapyNotes'), { status: 400 });
  return payer;
}

export function parseBillingComments(input) {
  return clean(input).replace(/^Billing Comments\s*\n?/i, '').replace(/^\s*svgEdit\s*$/gm, '').trim();
}
