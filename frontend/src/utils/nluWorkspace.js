const json = value => { try { return typeof value === 'string' ? JSON.parse(value) : value || {}; } catch { return {}; } };
export function serviceWorkspace(user, agency = {}, context = user?.workspaceServiceContext) {
  const scoped = Number(context?.agencyId) === Number(agency?.id) ? context : null;
  const flags = json(agency.feature_flags ?? agency.featureFlags);
  const learningTenant = flags.qaSandbox?.program === 'tutoring' || String(agency.organization_type).toLowerCase() === 'learning';
  const manager = ['admin', 'super_admin'].includes(String(user?.role));
  return { canTutor: scoped?.canTutor === true, canClinical:scoped?.canClinical===true, canChildcare: scoped?.canChildcare === true,
    learningOnly: !manager && (scoped?.learningOnly === true || learningTenant), agencyId: Number(agency.id) || null };
}
export function isClinicalWorkspacePath(path) {
  return /\/(?:note-aid|clinical-note-generator|medical-records|clinical-records|clinical-notes|supervision)(?:\/|$)/.test(path)||/\/admin\/clients(?:\/|$)/.test(path);
}
export function scopedWorkspacePath(slug, path) { return `${slug ? `/${slug}` : ''}${path}`; }

export function canLoadClinicalSupervision(user,agency={}) {
 if(!Number(agency?.id))return false;
 const flags=json(agency.feature_flags??agency.featureFlags);
 return !serviceWorkspace(user,agency).learningOnly && !(flags.clinicalChartEnabled===false && flags.standardsLearningEnabled===true);
}
