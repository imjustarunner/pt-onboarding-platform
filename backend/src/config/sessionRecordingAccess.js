/**
 * Session Recording access helpers (backend).
 * Keep in sync with frontend/src/config/sessionRecordingAccess.js
 */
export const SESSION_RECORDING_FEATURE_FLAG = 'sessionRecordingEnabled';
export const SESSION_RECORDING_FEATURE_KEY = 'sessionRecording';

export const SESSION_RECORDING_ITSCO_ROLES = [
  'admin',
  'super_admin',
  'clinical_practice_assistant',
  'provider_plus'
];

export const SESSION_RECORDING_EMPLOYEE_ROLES = [
  'super_admin',
  'admin',
  'support',
  'staff',
  'provider',
  'provider_plus',
  'supervisor',
  'clinical_practice_assistant',
  'intern',
  'intern_plus',
  'facilitator',
  'school_staff'
];

export const ITSCO_AGENCY_ID = 2;
export const NLU_AGENCY_ID = 6;

export function isTruthyFeatureFlag(v) {
  if (v === true || v === 1) return true;
  const s = String(v ?? '').trim().toLowerCase();
  return s === '1' || s === 'true' || s === 'yes' || s === 'on';
}

export function canUseSessionRecordingRole({ role, agencyId }) {
  const r = String(role || '').toLowerCase();
  const aid = Number(agencyId || 0);
  if (!r || !aid) return false;
  if (aid === ITSCO_AGENCY_ID) {
    return SESSION_RECORDING_ITSCO_ROLES.includes(r);
  }
  if (aid === NLU_AGENCY_ID) {
    return SESSION_RECORDING_EMPLOYEE_ROLES.includes(r);
  }
  return SESSION_RECORDING_EMPLOYEE_ROLES.includes(r);
}

export const SESSION_RECORDING_NOTE_AIDS = [
  {
    id: 'psychotherapy',
    label: 'Progress Note Aid (Individual Psychotherapy)',
    toolId: 'clinical_psychotherapy_note',
    serviceCode: '90837'
  },
  {
    id: 'h0004_note',
    label: 'H0004 Note Writer',
    toolId: 'clinical_h0004_note',
    serviceCode: 'H0004'
  },
  {
    id: 'h2014_group',
    label: 'H2014 Group Progress Note',
    toolId: 'clinical_h2014_group',
    serviceCode: 'H2014'
  },
  {
    id: 'h2014_individual',
    label: 'H2014 Individual Progress Note',
    toolId: 'clinical_h2014_individual',
    serviceCode: 'H2014'
  }
];

/**
 * HCBS Cat 1 → H0004; Cat 2–3 (and unknown) → psychotherapy.
 */
export function defaultProgressNoteAidIdFromHcbsCategory(hcbsCategory) {
  return Number(hcbsCategory) === 1 ? 'h0004_note' : 'psychotherapy';
}

export function withPreferredFirst(list, preferredId, idKey = 'id') {
  const items = Array.isArray(list) ? [...list] : [];
  if (!preferredId) return items;
  const idx = items.findIndex((item) => String(item?.[idKey] || '') === String(preferredId));
  if (idx <= 0) return items;
  const [hit] = items.splice(idx, 1);
  return [hit, ...items];
}

export function resolveSessionRecordingNoteAid({ serviceCode, noteAidId } = {}) {
  if (noteAidId) {
    const byId = SESSION_RECORDING_NOTE_AIDS.find((a) => a.id === noteAidId);
    if (byId) return byId;
  }
  const code = String(serviceCode || '').trim().toUpperCase();
  if (['90832', '90834', '90837'].includes(code)) {
    return SESSION_RECORDING_NOTE_AIDS.find((a) => a.id === 'psychotherapy');
  }
  if (code === 'H0004') return SESSION_RECORDING_NOTE_AIDS.find((a) => a.id === 'h0004_note');
  if (code === 'H2014') return SESSION_RECORDING_NOTE_AIDS.find((a) => a.id === 'h2014_individual');
  return null;
}
