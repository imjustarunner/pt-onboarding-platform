const SEX_KEYS = new Set(['gender', 'sex', 'child_gender', 'child_sex']);
const PLUS_KEYS = new Set([
  'gender_self_describe',
  'child_gender_self_describe',
  'preferred_called',
  'child_preferred_called'
]);

function isChildKey(key) {
  return String(key || '').toLowerCase().startsWith('child_');
}

export function isSexField(field) {
  return SEX_KEYS.has(String(field?.key || '').trim().toLowerCase());
}

export function plusKeyForSexField(field) {
  return isChildKey(field?.key) ? 'child_preferred_called' : 'preferred_called';
}

export function normalizeIntakeSexFields(fields) {
  const list = Array.isArray(fields) ? fields : [];
  const out = [];
  let sawSex = false;
  let sawPlus = false;
  for (const field of list) {
    const key = String(field?.key || '').trim().toLowerCase();
    if (SEX_KEYS.has(key)) {
      sawSex = true;
      out.push({
        ...field,
        key: isChildKey(key) ? 'child_sex' : 'sex',
        label: 'Sex',
        type: field?.type === 'select' ? 'select' : 'radio',
        options: [
          { value: 'female', label: 'Female' },
          { value: 'male', label: 'Male' }
        ]
      });
      continue;
    }
    if (PLUS_KEYS.has(key)) {
      sawPlus = true;
      out.push({
        ...field,
        key: isChildKey(key) ? 'child_preferred_called' : 'preferred_called',
        label: 'If you want to be called something different, write it here',
        optional: true,
        required: false,
        showIf: null,
        sexPlus: true
      });
      continue;
    }
    out.push(field);
  }
  if (sawSex && !sawPlus) {
    const child = out.some((f) => String(f?.key || '') === 'child_sex');
    out.push({
      id: child ? 'field_child_preferred_called' : 'field_preferred_called',
      key: child ? 'child_preferred_called' : 'preferred_called',
      label: 'If you want to be called something different, write it here',
      type: 'text',
      optional: true,
      required: false,
      sexPlus: true
    });
  }
  return out;
}

export function isContactOrDemographicField(field) {
  const key = String(field?.key || '').trim().toLowerCase();
  const label = String(field?.label || '').trim().toLowerCase();
  const needles = [
    'legal_first',
    'legal_last',
    'first_name',
    'last_name',
    'email',
    'phone',
    'date_of_birth',
    'dob',
    'child_dob',
    'sex',
    'gender',
    'address_street',
    'address_city',
    'address_state',
    'address_zip',
    'guardian_legal',
    'guardian_email',
    'guardian_phone',
    'guardian_relationship'
  ];
  if (needles.some((n) => key.includes(n))) return true;
  return (
    label.includes('email')
    || label.includes('phone')
    || label.includes('date of birth')
    || label === 'sex'
  );
}
