const PART_ALIASES = {
  street: ['home_street', 'guardian_address', 'address_street', 'client_street', 'street_address', 'street'],
  apt: ['home_apt', 'guardian_apt', 'address_apt', 'client_apt', 'apartment', 'apt', 'unit'],
  city: ['home_city', 'guardian_city', 'address_city', 'client_city', 'city'],
  state: ['home_state', 'guardian_state', 'address_state', 'client_state', 'state'],
  zip: ['home_zip', 'guardian_zip', 'address_zip', 'client_zip', 'postal_code', 'postal', 'zip']
};

const HOUSEHOLD_KEY = /^(home_|family_|household_|emergency_|guardian_|insurance_|subscriber_)/i;
const EXCLUDE_KEY = /(first_name|firstname|preferred_name|dob|birth|grade|sex|gender|psc_|phq_|gad_|scared|vanderbilt|abuse|neglect|trauma|medication|diagnos|allergy|allergies)/i;

function norm(value) {
  return String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function addressPartForKey(key) {
  const k = norm(key);
  if (!k) return '';
  for (const [part, aliases] of Object.entries(PART_ALIASES)) {
    if (aliases.some((alias) => k === alias || k.endsWith(`_${alias}`))) return part;
  }
  return '';
}

export function isAddressField(field) {
  return Boolean(addressPartForKey(field?.key || field?.id));
}

export function isPrimaryAddressField(field) {
  return addressPartForKey(field?.key || field?.id) === 'street';
}

export function isHouseholdShareableField(field) {
  const key = norm(field?.key || field?.id);
  const type = String(field?.type || '').toLowerCase();
  if (!key || type === 'info') return false;
  if (EXCLUDE_KEY.test(key)) return false;
  if (addressPartForKey(key)) return true;
  if (HOUSEHOLD_KEY.test(key)) return true;
  if (/(last_name|lastname)$/.test(key) && !/first/.test(key)) return true;
  return false;
}

function valueFromBag(bag, aliases) {
  if (!bag || typeof bag !== 'object') return '';
  for (const alias of aliases) {
    const direct = bag[alias];
    if (String(direct || '').trim()) return direct;
  }
  for (const [key, value] of Object.entries(bag)) {
    const part = addressPartForKey(key);
    if (part && PART_ALIASES[part] === aliases && String(value || '').trim()) return value;
  }
  return '';
}

export function guardianHasAddress(guardianBag) {
  return Object.values(PART_ALIASES).some((aliases) => String(valueFromBag(guardianBag, aliases) || '').trim());
}

export function copyAddressInto(targetBag, sourceBag, fields = []) {
  if (!targetBag || typeof targetBag !== 'object') return false;
  let wrote = false;
  const list = Array.isArray(fields) && fields.length
    ? fields
    : Object.keys(targetBag).map((key) => ({ key }));
  for (const field of list) {
    const part = addressPartForKey(field?.key);
    if (!part) continue;
    const next = valueFromBag(sourceBag, PART_ALIASES[part]);
    if (!String(next || '').trim()) continue;
    targetBag[field.key] = next;
    wrote = true;
  }
  if (!wrote && sourceBag && typeof sourceBag === 'object') {
    for (const [part, aliases] of Object.entries(PART_ALIASES)) {
      const next = valueFromBag(sourceBag, aliases);
      if (!String(next || '').trim()) continue;
      const destKey = aliases.find((alias) => alias.startsWith('address_') || alias.startsWith('client_')) || aliases[0];
      if (destKey) {
        targetBag[destKey] = next;
        wrote = true;
      }
    }
  }
  return wrote;
}

export function copyShareableFields(targetBag, sourceBag, fields = []) {
  if (!targetBag || !sourceBag) return false;
  let wrote = false;
  for (const field of fields || []) {
    if (!isHouseholdShareableField(field)) continue;
    const key = field.key;
    const value = sourceBag[key];
    if (value === undefined || value === null || value === '') continue;
    targetBag[key] = Array.isArray(value) ? [...value] : value;
    wrote = true;
  }
  return wrote || copyAddressInto(targetBag, sourceBag, fields);
}
