import { jsonObject } from './hirePortalWorkflow.js';

export function sanitizeHireTraining(input) {
  const raw = jsonObject(input), result = {};
  for (const key of ['moduleIds', 'trackIds', 'excludedModuleIds', 'excludedTrackIds']) {
    result[key] = [...new Set((Array.isArray(raw[key]) ? raw[key] : []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))].slice(0, 200);
  }
  result.guideRequirements = Object.fromEntries(Object.entries(jsonObject(raw.guideRequirements)).filter(([key, required]) => /^[a-z0-9-]{1,80}$/.test(key) && typeof required === 'boolean'));
  return result;
}
export function resolveHireTraining(shared, job, person) {
  if (person) return sanitizeHireTraining(person);
  const base = sanitizeHireTraining(shared), local = sanitizeHireTraining(job);
  return { moduleIds: [...new Set([...base.moduleIds, ...local.moduleIds])].filter(id => !local.excludedModuleIds.includes(id)),
    trackIds: [...new Set([...base.trackIds, ...local.trackIds])].filter(id => !local.excludedTrackIds.includes(id)),
    excludedModuleIds: local.excludedModuleIds, excludedTrackIds: local.excludedTrackIds,
    guideRequirements: { ...base.guideRequirements, ...local.guideRequirements } };
}
