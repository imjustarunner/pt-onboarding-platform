/**
 * Client chart hub IA — maps legacy flat tabs into Overview / Account / Lifecycle / Records.
 * Old ?tab= ids remain as aliases so bookmarks keep working.
 */

export const CHART_HUBS = Object.freeze({
  overview: 'overview',
  account: 'account',
  lifecycle: 'lifecycle',
  records: 'records',
  messages: 'messages'
});

/** Legacy tab id → { hub, sub } */
export const LEGACY_TAB_ALIASES = Object.freeze({
  overview: { hub: 'overview', sub: null },
  account: { hub: 'account', sub: 'profile' },
  demographics: { hub: 'account', sub: 'demographics' },
  guardians: { hub: 'account', sub: 'guardians' },
  assignments: { hub: 'account', sub: 'assignments' },
  'school-years': { hub: 'account', sub: 'school-years' },
  lifecycle: { hub: 'lifecycle', sub: 'timeline' },
  checklist: { hub: 'lifecycle', sub: 'checklist' },
  history: { hub: 'lifecycle', sub: 'history' },
  access: { hub: 'lifecycle', sub: 'access' },
  records: { hub: 'records', sub: 'overview' },
  documents: { hub: 'records', sub: 'documents' },
  phi: { hub: 'records', sub: 'documents' },
  /** Clinical profile summary (diagnoses, intake responses). */
  clinical: { hub: 'records', sub: 'clinical-summary' },
  'clinical-summary': { hub: 'records', sub: 'clinical-summary' },
  /** Student / learning summary (areas of concern) — tenant-context gated. */
  'student-summary': { hub: 'records', sub: 'student-summary' },
  /** Running notes list (drafts, signed notes, intake entries). */
  'clinical-notes': { hub: 'records', sub: 'notes' },
  notes: { hub: 'records', sub: 'notes' },
  'medical-record': { hub: 'records', sub: 'medical-record' },
  'client-billing': { hub: 'records', sub: 'billing' },
  billing: { hub: 'records', sub: 'billing' },
  packages: { hub: 'records', sub: 'packages' },
  surveys: { hub: 'records', sub: 'surveys' },
  assessments: { hub: 'records', sub: 'assessments' },
  'life-balance': { hub: 'records', sub: 'assessments' },
  'school-roi': { hub: 'records', sub: 'school-roi' },
  'intake-note': { hub: 'records', sub: 'intake-note' },
  'treatment-plans': { hub: 'records', sub: 'treatment-plans' },
  'learning-plans': { hub: 'records', sub: 'learning-plans' },
  authorizations: { hub: 'records', sub: 'authorizations' },
  audit: { hub: 'records', sub: 'audit' },
  messages: { hub: 'messages', sub: 'messages' },
  communications: { hub: 'messages', sub: 'communications' },
  'skill-builders': { hub: 'overview', sub: 'skill-builders' }
});

export function resolveChartTab(rawTab) {
  const key = String(rawTab || 'overview').trim().toLowerCase();
  return LEGACY_TAB_ALIASES[key] || { hub: 'overview', sub: null };
}

export function accountSubnav({ isSchool = false, canEditAccount = false } = {}) {
  const items = [
    { id: 'profile', label: 'Profile' },
    { id: 'demographics', label: 'Demographics' },
    { id: 'guardians', label: 'Guardians' }
  ];
  if (canEditAccount) items.push({ id: 'assignments', label: 'Assignments' });
  if (isSchool) items.push({ id: 'school-years', label: 'School years' });
  return items;
}

export function lifecycleSubnav({ isSchool = false } = {}) {
  const items = [
    { id: 'timeline', label: 'Care timeline' },
    { id: 'history', label: 'Status history' },
    { id: 'access', label: 'Access log' }
  ];
  if (isSchool) items.splice(1, 0, { id: 'checklist', label: 'Ops checklist' });
  return items;
}

/**
 * Records subnav.
 * Clinical and learning surfaces can both appear for clinical clients enrolled in a
 * learning program when the active chart tenant sponsors that program.
 */
export function recordsSubnav({
  canViewClinical = false,
  canViewMedicalRecord = false,
  canViewBilling = false,
  showLearningSurfaces = false,
  showClinicalSurfaces = false,
  isLearningBilling = false
} = {}) {
  const items = [
    { id: 'overview', label: 'Overview' }
  ];

  const showSummaries = canViewClinical || showLearningSurfaces || showClinicalSurfaces;
  if (showSummaries) {
    if (showClinicalSurfaces) {
      items.push({ id: 'clinical-summary', label: 'Clinical summary' });
    }
    if (showLearningSurfaces) {
      items.push({ id: 'student-summary', label: 'Student summary' });
    }
    if (!showClinicalSurfaces && !showLearningSurfaces) {
      items.push({ id: 'clinical-summary', label: 'Clinical summary' });
    }
    items.push({ id: 'notes', label: 'Notes' });
  }

  if (canViewMedicalRecord && showClinicalSurfaces) {
    items.push({ id: 'medical-record', label: 'Medical record' });
  }

  if (showClinicalSurfaces) {
    items.push({ id: 'treatment-plans', label: 'Treatment plans' });
  }
  if (showLearningSurfaces) {
    items.push({ id: 'learning-plans', label: 'Learning' });
  }
  if (!showClinicalSurfaces && !showLearningSurfaces) {
    items.push({ id: 'treatment-plans', label: 'Treatment plans' });
  }

  items.push({ id: 'documents', label: 'Documents' });
  if (canViewBilling) {
    items.push({
      id: 'billing',
      label: isLearningBilling || (showLearningSurfaces && !showClinicalSurfaces)
        ? 'Billing / self-pay'
        : 'Billing & claims'
    });
  }
  items.push({ id: 'authorizations', label: 'Authorizations' });
  items.push({ id: 'audit', label: 'Audit trail' });
  return items;
}

/** Secondary Records surfaces (not in the primary subnav). */
export const RECORDS_SECONDARY_SUBS = Object.freeze([
  'surveys',
  'assessments',
  'packages',
  'school-roi',
  'intake-note'
]);

/** Whether a content panel for legacyId should show given current hub/sub. */
export function panelVisible(legacyId, hub, sub) {
  const resolved = resolveChartTab(legacyId);
  if (resolved.hub !== hub) return false;
  const subNorm = String(sub || '').trim();
  const legacy = String(legacyId || '').trim().toLowerCase();
  if (!resolved.sub) {
    if (hub === 'overview') return !subNorm || subNorm === 'home' || subNorm === 'overview';
    return !subNorm;
  }
  if (!subNorm) {
    if (hub === 'account') return resolved.sub === 'profile';
    if (hub === 'lifecycle') return resolved.sub === 'timeline';
    if (hub === 'records') return resolved.sub === 'overview';
    if (hub === 'messages') return resolved.sub === 'messages';
  }
  if (hub === 'overview' && (subNorm === 'overview' || resolved.sub === 'overview')) {
    return !resolved.sub;
  }
  if (hub === 'records' && subNorm === 'clinical-summary') {
    return legacy === 'clinical' || resolved.sub === 'clinical-summary';
  }
  if (hub === 'records' && subNorm === 'student-summary') {
    return legacy === 'student-summary' || resolved.sub === 'student-summary';
  }
  if (hub === 'records' && subNorm === 'notes') {
    return legacy === 'clinical-notes' || legacy === 'notes' || resolved.sub === 'notes';
  }
  if (hub === 'records' && subNorm === 'learning-plans') {
    return legacy === 'learning-plans' || resolved.sub === 'learning-plans';
  }
  return resolved.sub === subNorm;
}

/** Canonical navigation target for a hub + optional sub. */
export function chartNavTarget(hubId, subId = '') {
  const hub = String(hubId || 'overview');
  const sub = String(subId || '').trim();
  if (hub === 'overview') {
    if (sub === 'skill-builders') return { activeTab: 'skill-builders', hubSub: 'skill-builders' };
    return { activeTab: 'overview', hubSub: sub === 'home' ? 'home' : '' };
  }
  if (hub === 'account') {
    if (sub === 'demographics') return { activeTab: 'demographics', hubSub: 'demographics' };
    if (sub === 'guardians') return { activeTab: 'guardians', hubSub: 'guardians' };
    if (sub === 'assignments') return { activeTab: 'assignments', hubSub: 'assignments' };
    if (sub === 'school-years') return { activeTab: 'school-years', hubSub: 'school-years' };
    return { activeTab: 'account', hubSub: 'profile' };
  }
  if (hub === 'lifecycle') {
    if (sub === 'checklist') return { activeTab: 'checklist', hubSub: 'checklist' };
    if (sub === 'history') return { activeTab: 'history', hubSub: 'history' };
    if (sub === 'access') return { activeTab: 'access', hubSub: 'access' };
    return { activeTab: 'lifecycle', hubSub: 'timeline' };
  }
  if (hub === 'records') {
    if (sub === 'documents') return { activeTab: 'phi', hubSub: 'documents' };
    if (sub === 'clinical-summary') return { activeTab: 'clinical', hubSub: 'clinical-summary' };
    if (sub === 'student-summary') return { activeTab: 'student-summary', hubSub: 'student-summary' };
    if (sub === 'clinical-notes') return { activeTab: 'clinical-notes', hubSub: 'notes' };
    if (sub === 'notes') return { activeTab: 'clinical-notes', hubSub: 'notes' };
    if (sub === 'medical-record') return { activeTab: 'medical-record', hubSub: 'medical-record' };
    if (sub === 'intake-note') return { activeTab: 'intake-note', hubSub: 'intake-note' };
    if (sub === 'treatment-plans') return { activeTab: 'treatment-plans', hubSub: 'treatment-plans' };
    if (sub === 'learning-plans') return { activeTab: 'learning-plans', hubSub: 'learning-plans' };
    if (sub === 'billing') return { activeTab: 'billing', hubSub: 'billing' };
    if (sub === 'authorizations') return { activeTab: 'authorizations', hubSub: 'authorizations' };
    if (sub === 'audit') return { activeTab: 'audit', hubSub: 'audit' };
    if (sub === 'surveys') return { activeTab: 'surveys', hubSub: 'surveys' };
    if (sub === 'assessments') return { activeTab: 'assessments', hubSub: 'assessments' };
    if (sub === 'packages') return { activeTab: 'packages', hubSub: 'packages' };
    if (sub === 'school-roi') return { activeTab: 'school-roi', hubSub: 'school-roi' };
    return { activeTab: 'records', hubSub: 'overview' };
  }
  if (hub === 'messages') {
    return {
      activeTab: sub === 'communications' ? 'communications' : 'messages',
      hubSub: sub === 'communications' ? 'communications' : 'messages'
    };
  }
  return { activeTab: 'overview', hubSub: '' };
}
