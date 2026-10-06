import { addressPartForKey } from './intakeSameAsMe.js';

const QUESTION_TYPES = new Set(['questions', 'clinical_questions', 'demographics', 'child_review']);
const SHARED_AUDIENCES = new Set(['guardian', 'family', 'submission', 'self', 'couple', 'couple_partner']);

// Older school masters predate repeatPerClient. Their child questions must still
// have an individual answer bag, even when there is only one child today.
export function schoolStepRepeatsForChild(step) {
  if (!QUESTION_TYPES.has(step?.type)) return false;
  if (SHARED_AUDIENCES.has(String(step.audience || step.scope || '').toLowerCase())) return false;
  const fields = (step.fields || []).filter(f => f.type !== 'info');
  if (fields.length && fields.every(f => ['guardian', 'family'].includes(f.scope))) return false;
  return true;
}

export function groupSchoolChildSteps(steps) {
  const result = [];
  let childPages = [];
  const flush = () => {
    result.push(...childPages.sort((a, b) => a.clientIndex - b.clientIndex));
    childPages = [];
  };
  for (const step of steps) {
    if (Number.isInteger(step.clientIndex)) childPages.push(step);
    else { flush(); result.push(step); }
  }
  flush();
  return result;
}

export function childDetailKind(field) {
  if (['dob', 'grade', 'sex', 'address_street', 'address_apt', 'address_city', 'address_state', 'address_zip'].includes(field?.detailKind)) return field.detailKind;
  if (['guardian', 'family'].includes(field?.scope)) return '';
  const keys = [field?.key, field?.documentKey].filter(Boolean);
  for (const raw of keys) {
    const key = String(raw).toLowerCase();
    if (/^(guardian|parent|responsible|emergency|subscriber|school)_/.test(key)) continue;
    if (/(^|_)(dob|date_of_birth|birth_date)$/.test(key)) return 'dob';
    if (/(^|_)(grade|current_grade)$/.test(key)) return 'grade';
    if (/(^|_)(sex|gender)$/.test(key)) return 'sex';
    const address = addressPartForKey(key);
    if (address) return `address_${address}`;
  }
  // Some saved school builders use generated keys and human-readable labels.
  const label = String(field?.label || '').toLowerCase();
  if (/guardian|parent|responsible|emergency|subscriber|school address/.test(label)) return '';
  if (/date of birth|fecha de nacimiento/.test(label)) return 'dob';
  if (/^(client'?s?|child'?s?|student'?s?)?\s*(current )?grade\b|grado actual/.test(label)) return 'grade';
  if (/^(client'?s?|child'?s?|student'?s?)?\s*(sex|gender)\b|sexo del/.test(label)) return 'sex';
  if (/street address|dirección de la calle/.test(label)) return 'address_street';
  if (/apartment|apartamento/.test(label)) return 'address_apt';
  if (/^(client'?s?|child'?s?|student'?s?)?\s*(zip|postal)\b/.test(label)) return 'address_zip';
  if (/^(client'?s?|child'?s?|student'?s?)?\s*city\b/.test(label)) return 'address_city';
  if (/^(client'?s?|child'?s?|student'?s?)?\s*state\b/.test(label)) return 'address_state';
  return '';
}

export function schoolChildDetailFields(steps) {
  const seen = new Set();
  return steps.filter(schoolStepRepeatsForChild).flatMap(s => s.fields || []).filter(field => {
    const kind = childDetailKind(field);
    if (!kind || kind === 'dob' || !field.key || seen.has(field.key)) return false;
    seen.add(field.key);
    return true;
  }).map(field => ({ ...field, detailKind: childDetailKind(field) }));
}

export function validChildDob(value, today = new Date()) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = new Date(`${text}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === text
    && text <= today.toISOString().slice(0, 10);
}

export function syncSchoolChildIdentity(client, answers, fields = []) {
  answers.client_first = String(client.firstName || '').trim();
  answers.client_last = String(client.lastName || '').trim();
  answers.child_legal_first = answers.client_first;
  answers.child_legal_last = answers.client_last;
  for (const key of ['child_dob', 'client_dob', 'child_date_of_birth', 'date_of_birth']) {
    answers[key] = client.dateOfBirth || '';
  }
  for (const field of fields) {
    if (childDetailKind(field) === 'dob') answers[field.key] = client.dateOfBirth || '';
  }
}

export function syncSiblingAddresses(clients, answers, fields) {
  const addressFields = fields.filter(f => childDetailKind(f).startsWith('address_'));
  const first = answers[0] || {};
  clients.forEach((client, index) => {
    if (!index) return;
    const bag = answers[index] ||= {};
    if (client.sameAddressAsFirst == null) {
      // Preserve an older draft's separately entered address.
      client.sameAddressAsFirst = !addressFields.some(f => bag[f.key] && bag[f.key] !== first[f.key]);
    }
    if (client.sameAddressAsFirst) {
      for (const field of addressFields) bag[field.key] = first[field.key] ?? '';
    }
  });
}

export function migrateLegacySchoolAnswers(responses, steps, clients) {
  const first = responses.clients[0] ||= {};
  const shared = responses.submission || {};
  const clinical = shared.clinicalResponses || {};
  for (const field of steps.filter(schoolStepRepeatsForChild).flatMap(s => s.fields || [])) {
    if (['guardian', 'family'].includes(field.scope) || !field.key) continue;
    const value = clinical[field.key] ?? shared[field.key];
    if (first[field.key] == null && value != null) first[field.key] = value;
    delete shared[field.key];
    delete clinical[field.key];
  }
  clients.forEach((client, index) => {
    const bag = responses.clients[index] || {};
    if (!client.dateOfBirth) {
      const dobField = steps.flatMap(s => s.fields || []).find(f => childDetailKind(f) === 'dob' && bag[f.key]);
      client.dateOfBirth = bag.child_dob || bag.client_dob || bag.date_of_birth || (dobField ? bag[dobField.key] : '') || '';
    }
  });
}
