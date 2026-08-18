/**
 * Session Recording access — Tools product separate from Note Aid.
 * ITSCO: admin, super_admin, CPA, provider_plus only.
 * NLU: all employee roles (tutoring rollout).
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

export function isSessionRecordingEnabledForAgencyFlags(flags) {
  return isTruthyFeatureFlag(flags?.[SESSION_RECORDING_FEATURE_FLAG]);
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
  // Other tenants: employee roles once feature is on (manual entitlements).
  return SESSION_RECORDING_EMPLOYEE_ROLES.includes(r);
}

/** Note aids Session Recording can generate after a live session (same gems as Note Aid). */
export const SESSION_RECORDING_NOTE_AIDS = [
  {
    id: 'psychotherapy',
    label: 'Progress Note Aid (Individual Psychotherapy)',
    toolId: 'clinical_psychotherapy_note',
    serviceCode: '90837',
    codeGroupId: 'psychotherapy',
    guidance: 'Type in all information that occurred during the session, your interpretation of the client’s progress, etc.'
  },
  {
    id: 'h0004_note',
    label: 'H0004 Note Writer (Bachelor’s Level and Up)',
    toolId: 'clinical_h0004_note',
    serviceCode: 'H0004',
    guidance: 'Used to document standard counseling sessions. Minimum 8 minutes required. Symptoms, objective content, interventions, and plan.'
  },
  {
    id: 'h2014_group',
    label: 'Group Program (12-Week Program) Progress Note Aid (Skill Builders)',
    toolId: 'clinical_h2014_group',
    serviceCode: 'H2014',
    needsProgram: true,
    guidance: 'Type in all information that occurred during the session, your interpretation of the client’s participation, progress, whether they’re benefitting etc.'
  },
  {
    id: 'h2014_individual',
    label: 'Individual (or group non-program) Progress Note Aid (H2014/H2015/H2016)',
    toolId: 'clinical_h2014_individual',
    serviceCode: 'H2014',
    guidance: 'Type in all information that occurred during the session, your interpretation of the client’s participation, progress, whether they’re benefitting etc.'
  }
];

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
