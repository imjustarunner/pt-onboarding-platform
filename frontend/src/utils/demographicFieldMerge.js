/**
 * Field-by-field demographic merge.
 * When both sides have a value, keep the file and offer one checkbox to take the paste.
 * When the file is empty, start on whichever side has content.
 */

export const DEMOGRAPHIC_MERGE_FIELDS = Object.freeze([
  { key: 'firstName', label: 'First name' },
  { key: 'lastName', label: 'Last name' },
  { key: 'dateOfBirth', label: 'Date of birth' },
  { key: 'administrativeSex', label: 'Sex' },
  { key: 'grade', label: 'Grade' },
  { key: 'addressStreet', label: 'Street' },
  { key: 'addressCity', label: 'City' },
  { key: 'addressState', label: 'State' },
  { key: 'addressZip', label: 'ZIP' },
  { key: 'contactPhone', label: 'Phone' },
  { key: 'email', label: 'Email' }
]);

export function splitPersonName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { firstName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

export function joinPersonName(first, last) {
  return [first, last].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
}

function norm(value) {
  return String(value ?? '').trim().toLowerCase();
}

export function defaultUseIncoming(current, incoming) {
  const next = String(incoming ?? '').trim();
  if (!next) return false;
  const prev = String(current ?? '').trim();
  if (!prev) return true;
  return false;
}

export function currentDemographicsFromClient(client) {
  const name = splitPersonName(client?.full_name || client?.fullName || '');
  const dob = client?.date_of_birth || client?.dateOfBirth || '';
  return {
    firstName: name.firstName,
    lastName: name.lastName,
    dateOfBirth: dob ? String(dob).slice(0, 10) : '',
    administrativeSex: client?.gender || client?.administrativeSex || '',
    grade: client?.grade || '',
    addressStreet: client?.address_street || client?.addressStreet || '',
    addressCity: client?.address_city || client?.addressCity || '',
    addressState: client?.address_state || client?.addressState || '',
    addressZip: client?.address_zip || client?.addressZip || '',
    contactPhone: client?.contact_phone || client?.contactPhone || '',
    email: client?.email || ''
  };
}

export function incomingDemographicsFromParsed(parsed) {
  const name = splitPersonName(parsed?.fullName || '');
  return {
    firstName: name.firstName,
    lastName: name.lastName,
    dateOfBirth: parsed?.dateOfBirth ? String(parsed.dateOfBirth).slice(0, 10) : '',
    administrativeSex: parsed?.administrativeSex || '',
    grade: parsed?.grade || '',
    addressStreet: parsed?.addressStreet || '',
    addressCity: parsed?.addressCity || '',
    addressState: parsed?.addressState || '',
    addressZip: parsed?.addressZip || '',
    contactPhone: parsed?.contactPhone || '',
    email: parsed?.email || ''
  };
}

export function buildDemographicMergeRows(current, incoming) {
  return DEMOGRAPHIC_MERGE_FIELDS.map((field) => {
    const onFile = String(current?.[field.key] ?? '').trim();
    const pasted = String(incoming?.[field.key] ?? '').trim();
    const same = !!onFile && !!pasted && norm(onFile) === norm(pasted);
    return {
      ...field,
      current: onFile,
      incoming: pasted,
      same,
      useIncoming: same ? false : defaultUseIncoming(onFile, pasted)
    };
  }).filter((row) => row.current || row.incoming);
}

export function mergedDemographicsPayload(rows) {
  const chosen = {};
  for (const row of rows || []) {
    chosen[row.key] = row.useIncoming ? row.incoming : row.current;
  }
  return {
    fullName: joinPersonName(chosen.firstName, chosen.lastName),
    dateOfBirth: chosen.dateOfBirth || '',
    administrativeSex: chosen.administrativeSex || '',
    grade: chosen.grade || '',
    addressStreet: chosen.addressStreet || '',
    addressCity: chosen.addressCity || '',
    addressState: chosen.addressState || '',
    addressZip: chosen.addressZip || '',
    contactPhone: chosen.contactPhone || '',
    email: chosen.email || ''
  };
}
