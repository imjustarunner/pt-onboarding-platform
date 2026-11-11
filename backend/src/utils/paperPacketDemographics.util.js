/**
 * Read demographic fields from school paper-packet OCR.
 * The intake page prints labels such as "Dependent's Name" with the answer
 * on the same line or the next line.
 */

const LABEL_RULES = [
  ['fullName', /^dependent'?s?\s+name\b/i],
  ['dateOfBirth', /^dependent['’]?s?\s+date\s+of\s+birth\b/i],
  ['age', /^dependent'?s?\s+age\b/i],
  ['administrativeSex', /^dependent'?s?\s+sex\b/i],
  ['grade', /^dependent'?s?\s+grade\b/i],
  ['addressStreet', /^dependent'?s?\s+address\b/i],
  ['addressCity', /^dependent'?s?\s+city\b/i],
  ['addressState', /^state\b/i],
  ['addressZip', /^zip\s*code\b/i],
  ['guardianName', /^your name\b/i],
  ['contactPhone', /^your phone(?:\s+number)?\b/i],
  ['email', /^your email(?:\s+address)?\b/i],
  ['otherGuardian', /^other parent\/guardian(?:\s+name,\s+phone,\s+and\s+email)?\b/i],
  ['secondaryInsurance', /^secondary insurance\b/i],
  ['primaryInsurance', /^primary insurance\b/i],
  ['secondaryHolder', /^secondary holder\b/i],
  ['policyHolder', /^policy holder\b/i],
  ['secondaryMemberId', /^secondary id\b/i],
  ['memberId', /^member id\b/i],
  ['secondaryGroup', /^secondary group\b/i],
  ['policyGroup', /^policy group\b/i]
];

const YES_NO_RULES = [
  ['legalCustodian', /^are you the legal parent or custodian\b/i],
  ['legalRightToTreat', /^i have a legal right to obtain treatment\b/i],
  ['custodyDocumentation', /^are you willing to provide documentation\b/i]
];

const STOP_LINE = /^(history of|please list any necessary|please select|consent to release|sign here|authorized school|acknowledgement|how long has this)/i;

function emptyParsed() {
  return {
    fullName: null,
    dateOfBirth: null,
    addressStreet: null,
    addressCity: null,
    addressState: null,
    addressZip: null,
    contactPhone: null,
    email: null,
    administrativeSex: null,
    grade: null,
    guardianName: null,
    legalCustodian: null,
    legalRightToTreat: null,
    custodyDocumentation: null,
    otherGuardianName: null,
    otherGuardianPhone: null,
    otherGuardianEmail: null,
    primaryInsurance: null,
    secondaryInsurance: null,
    policyHolder: null,
    secondaryHolder: null,
    memberId: null,
    secondaryMemberId: null,
    policyGroup: null,
    secondaryGroup: null
  };
}

function parseDateToken(text) {
  const s = String(text || '');
  const mdY = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](20\d{2}|19\d{2})/);
  if (mdY) {
    return `${mdY[3]}-${String(mdY[1]).padStart(2, '0')}-${String(mdY[2]).padStart(2, '0')}`;
  }
  const iso = s.match(/(20\d{2}|19\d{2})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

function matchLabel(line) {
  const s = String(line || '').trim();
  if (!s) return null;
  for (const [key, re] of LABEL_RULES) {
    const m = s.match(re);
    if (!m || m.index !== 0) continue;
    const rest = s.slice(m[0].length).replace(/^[\s:\-–—]+/, '').trim();
    return { key, rest };
  }
  return null;
}

function takeValue(lines, index, rest) {
  const cleaned = String(rest || '').replace(/^[#:.\-–—\s]+/, '').trim();
  if (cleaned) return { value: cleaned, next: index + 1 };
  let j = index + 1;
  while (j < lines.length && !String(lines[j] || '').trim()) j += 1;
  if (j >= lines.length) return { value: '', next: j };
  if (matchLabel(lines[j]) || STOP_LINE.test(String(lines[j] || '').trim())) {
    return { value: '', next: j };
  }
  return { value: String(lines[j] || '').trim(), next: j + 1 };
}

function cleanName(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 80) return null;
  if (/dependent|date of birth|address|phone|email|grade|sex/i.test(s)) return null;
  if (/^(yes|no|n\/a|none)$/i.test(s)) return null;
  return s;
}

function cleanSex(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 40) return null;
  if (/^(yes|no|n\/a|dependent'?s?)$/i.test(s)) return null;
  return s;
}

function cleanGrade(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 32) return null;
  if (s.split(' ').length > 4) return null;
  if (/^(yes|no|dependent'?s?)$/i.test(s)) return null;
  return s;
}

function cleanPhone(value) {
  const m = String(value || '').match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/);
  return m ? m[0] : null;
}

function cleanEmail(value) {
  const m = String(value || '').match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return m ? m[0] : null;
}

function cleanState(value) {
  const m = String(value || '').trim().match(/^([A-Za-z]{2})\b/);
  return m ? m[1].toUpperCase() : null;
}

function cleanZip(value) {
  const m = String(value || '').match(/\b(\d{5}(?:-\d{4})?)\b/);
  return m ? m[1] : null;
}

function markedYesNo(text) {
  const s = String(text || '');
  const mark = '(?:\\[[xX]\\]|\\([xX]\\)|☑|✓|✔|\\b[xX]\\b)';
  const yes = new RegExp(`${mark}\\s*yes\\b|\\byes\\b\\s*${mark}`, 'i').test(s);
  const no = new RegExp(`${mark}\\s*no\\b|\\bno\\b\\s*${mark}`, 'i').test(s);
  if (yes === no) return null;
  return yes ? 'yes' : 'no';
}

function cleanShortText(value, max = 255) {
  const s = String(value || '').replace(/\s+/g, ' ').replace(/^[#:.\-–—\s]+/, '').trim();
  if (!s || s.length > max) return null;
  if (/^(yes|no|n\/a|none|primary insurance|secondary insurance)$/i.test(s)) return null;
  return s;
}

function splitContactLine(value) {
  const raw = String(value || '').replace(/\s+/g, ' ').trim();
  const email = cleanEmail(raw);
  const phone = cleanPhone(raw);
  let name = raw;
  if (email) name = name.replace(email, ' ');
  if (phone) name = name.replace(phone, ' ');
  name = cleanName(name);
  return { name, phone, email };
}

function cleanStreet(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 120) return null;
  if (/^(state|zip|city|dependent)/i.test(s)) return null;
  return s;
}

function cleanCity(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (!s || s.length > 80) return null;
  if (/^(state|zip code|zip)\b/i.test(s)) return null;
  return s.split(/\bstate\b/i)[0].trim() || null;
}

export function extractPaperPacketDemographics(rawText) {
  const result = emptyParsed();
  const lines = String(rawText || '').replace(/\r\n/g, '\n')
    // Vision can wrap the printed labels on the current packet across lines.
    // Join labels only; never take an unrelated date elsewhere as a child's DOB.
    .replace(/dependent['’]?s?\s*\n\s*(date\s+of\s+birth|age|sex|grade|name|address|city)/gi, "Dependent's $1")
    .replace(/(dependent['’]?s?\s+date\s+of)\s*\n\s*birth/gi, '$1 Birth')
    .split('\n');
  let i = 0;
  while (i < lines.length) {
    const line = String(lines[i] || '').trim();
    if (!line) {
      i += 1;
      continue;
    }
    if (STOP_LINE.test(line)) break;
    const yesNo = YES_NO_RULES.find(([, re]) => re.test(line));
    if (yesNo) {
      let answer = markedYesNo(line);
      if (!answer) {
        const next = String(lines[i + 1] || '').trim();
        if (/^(yes|no)$/i.test(next)) answer = next.toLowerCase();
      }
      if (answer && !result[yesNo[0]]) result[yesNo[0]] = answer;
      i += 1;
      continue;
    }
    const label = matchLabel(line);
    if (!label) {
      i += 1;
      continue;
    }
    const taken = takeValue(lines, i, label.rest);
    i = taken.next;
    const value = taken.value;
    if (label.key === 'age') continue;
    if (label.key === 'fullName' && !result.fullName) result.fullName = cleanName(value);
    else if (label.key === 'dateOfBirth' && !result.dateOfBirth) result.dateOfBirth = parseDateToken(value);
    else if (label.key === 'administrativeSex' && !result.administrativeSex) result.administrativeSex = cleanSex(value);
    else if (label.key === 'grade' && !result.grade) result.grade = cleanGrade(value);
    else if (label.key === 'addressStreet' && !result.addressStreet) result.addressStreet = cleanStreet(value);
    else if (label.key === 'addressCity' && !result.addressCity) result.addressCity = cleanCity(value);
    else if (label.key === 'addressState' && !result.addressState) {
      result.addressState = cleanState(value);
      if (!result.addressZip) result.addressZip = cleanZip(value);
    }
    else if (label.key === 'addressZip' && !result.addressZip) result.addressZip = cleanZip(value);
    else if (label.key === 'guardianName' && !result.guardianName) result.guardianName = cleanName(value);
    else if (label.key === 'contactPhone' && !result.contactPhone) result.contactPhone = cleanPhone(value);
    else if (label.key === 'email' && !result.email) result.email = cleanEmail(value);
    else if (label.key === 'otherGuardian' && !result.otherGuardianName && !result.otherGuardianPhone && !result.otherGuardianEmail) {
      const other = splitContactLine(value);
      result.otherGuardianName = other.name;
      result.otherGuardianPhone = other.phone;
      result.otherGuardianEmail = other.email;
    }
    else if (label.key === 'primaryInsurance' && !result.primaryInsurance) result.primaryInsurance = cleanShortText(value);
    else if (label.key === 'secondaryInsurance' && !result.secondaryInsurance) result.secondaryInsurance = cleanShortText(value);
    else if (label.key === 'policyHolder' && !result.policyHolder) result.policyHolder = cleanName(value);
    else if (label.key === 'secondaryHolder' && !result.secondaryHolder) result.secondaryHolder = cleanName(value);
    else if (label.key === 'memberId' && !result.memberId) result.memberId = cleanShortText(value, 80);
    else if (label.key === 'secondaryMemberId' && !result.secondaryMemberId) result.secondaryMemberId = cleanShortText(value, 80);
    else if (label.key === 'policyGroup' && !result.policyGroup) result.policyGroup = cleanShortText(value, 80);
    else if (label.key === 'secondaryGroup' && !result.secondaryGroup) result.secondaryGroup = cleanShortText(value, 80);
  }
  return result;
}

export function paperPacketDemographicsHaveContent(parsed) {
  const p = parsed || {};
  return !!(
    p.fullName
    || p.dateOfBirth
    || p.contactPhone
    || p.email
    || p.addressStreet
    || p.addressCity
    || p.addressZip
    || p.administrativeSex
    || p.grade
    || p.guardianName
    || p.primaryInsurance
    || p.memberId
    || p.otherGuardianName
    || p.otherGuardianPhone
    || p.otherGuardianEmail
  );
}

function blank(value) {
  if (value == null) return true;
  const s = String(value).trim();
  if (!s || s.startsWith('0000-00-00')) return true;
  return false;
}

/** Operational client columns that are still empty and can take the packet read. */
export function paperPacketDemographicFill(client, parsed) {
  const p = parsed || {};
  const patch = {};
  if (blank(client?.full_name) && p.fullName) patch.full_name = p.fullName;
  if (blank(client?.date_of_birth) && p.dateOfBirth) patch.date_of_birth = p.dateOfBirth;
  if (blank(client?.address_street) && p.addressStreet) patch.address_street = p.addressStreet;
  if (blank(client?.address_city) && p.addressCity) patch.address_city = p.addressCity;
  if (blank(client?.address_state) && p.addressState) patch.address_state = p.addressState;
  if (blank(client?.address_zip) && p.addressZip) patch.address_zip = p.addressZip;
  if (blank(client?.contact_phone) && p.contactPhone) patch.contact_phone = p.contactPhone;
  if (blank(client?.email) && p.email) patch.email = p.email;
  if (blank(client?.gender) && p.administrativeSex) patch.gender = p.administrativeSex;
  if (blank(client?.grade) && p.grade) patch.grade = p.grade;
  return patch;
}
