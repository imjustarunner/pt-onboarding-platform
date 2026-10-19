import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { readServiceSupervisors, serviceSupervisorOptions, saveServiceSupervisor } from '../services/serviceBillingSupervisor.service.js';

async function scope(req) {
  const agencyId = Number(req.body?.agencyId || req.query?.agencyId);
  const providerUserId = Number(req.body?.providerUserId || req.query?.providerUserId);
  if (![agencyId, providerUserId].every(n => Number.isSafeInteger(n) && n > 0))
    throw Object.assign(new Error('Agency and provider are required.'), { status: 400 });
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
  if (!['admin', 'super_admin'].includes(req.user.role))
    throw Object.assign(new Error('An agency administrator must manage service billing supervisors.'), { status: 403 });
  return { agencyId, providerUserId };
}

export async function getServiceBillingSupervisors(req, res, next) {
  try {
    const s = await scope(req);
    const policy = await readServiceSupervisors(s.agencyId);
    res.json({ revision: policy.revision, entries: policy.entries.filter(e => e.providerUserId === s.providerUserId),
      supervisors: (await serviceSupervisorOptions(s.agencyId)).filter(u => u.id !== s.providerUserId) });
  } catch (error) { next(error); }
}

export async function putServiceBillingSupervisor(req, res, next) {
  try {
    const s = await scope(req);
    const policy = await saveServiceSupervisor({ ...s, actorUserId: req.user.id, input: req.body });
    res.json({ revision: policy.revision, entries: policy.entries.filter(e => e.providerUserId === s.providerUserId) });
  } catch (error) { next(error); }
}
