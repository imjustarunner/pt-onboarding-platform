/**
 * Display codes for Log Time activity types (shown on claims and in the UI).
 */

export const LOG_TIME_ACTIVITY_CODE_BY_TYPE_KEY = {
  clinical_documentation: 'IND-01',
  treatment_planning_svc: 'IND-02',
  care_coordination: 'IND-03',
  client_communication: 'IND-04',
  client_record_review: 'IND-05',
  scheduling_follow_up: 'IND-06',
  outreach_activities: 'IND-07',
  staff_meeting: 'SUP-01',
  required_training: 'SUP-02',
  clinical_supervision_sa: 'SUP-03',
  onboarding_sa: 'SUP-04',
  fingerprinting_credentialing: 'SUP-05',
  approved_travel: 'SUP-06',
  supervision_note_time: 'SN-01',
  supervisors_meeting: 'SN-02'
};

export function activityCodeForTypeKey(typeKey) {
  const k = String(typeKey || '').trim().toLowerCase();
  if (!k) return '';
  return LOG_TIME_ACTIVITY_CODE_BY_TYPE_KEY[k] || '';
}

export function formatLogTimeActivityLabel(typeOrKey, labelFallback = '') {
  const typeKey = typeof typeOrKey === 'string'
    ? typeOrKey
    : String(typeOrKey?.typeKey || typeOrKey?.type_key || '').trim().toLowerCase();
  const label = typeof typeOrKey === 'object' && typeOrKey
    ? String(typeOrKey.label || labelFallback || '').trim()
    : String(labelFallback || '').trim();
  const code = activityCodeForTypeKey(typeKey);
  if (code && label) return `${code} ${label}`;
  if (code) return code;
  return label;
}

export function enrichAllocationWithActivityCode(alloc) {
  if (!alloc || typeof alloc !== 'object') return alloc;
  const key = String(alloc.serviceTypeKey || alloc.typeKey || alloc.type_key || '').trim().toLowerCase();
  const code = String(alloc.activityCode || '').trim() || activityCodeForTypeKey(key);
  const label = String(alloc.serviceTypeLabel || alloc.label || '').trim();
  return {
    ...alloc,
    ...(code ? { activityCode: code } : {}),
    ...(code && label ? { serviceTypeLabel: formatLogTimeActivityLabel(key, label) } : {})
  };
}
