import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { billingSetupEvidence } from '../services/billingSetupEvidence.service.js';
import { readProviderBillingRollout, billingRolloutProviders, saveProviderBillingRollout } from '../services/providerBillingRollout.service.js';

async function scope(req) {
  const agencyId = Number(req.body?.agencyId || req.query?.agencyId);
  if (!Number.isSafeInteger(agencyId) || agencyId < 1) throw Object.assign(new Error('A billing practice is required.'), { status: 400 });
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
  return agencyId;
}
export async function getProviderBillingRollout(req, res, next) {
  try {
    const agencyId = await scope(req);
    const [policy, providers] = await Promise.all([readProviderBillingRollout(agencyId), billingRolloutProviders(agencyId)]);
    const evidence = await billingSetupEvidence(agencyId, providers, policy);
    res.json({ policy, providers, evidence, canManage: ['admin', 'super_admin'].includes(req.user.role) });
  } catch (e) { next(e); }
}
export async function putProviderBillingRollout(req, res, next) {
  try {
    const agencyId = await scope(req);
    if (!['admin', 'super_admin'].includes(req.user.role)) throw Object.assign(new Error('A practice administrator must manage provider activation.'), { status: 403 });
    res.json({ policy: await saveProviderBillingRollout({ agencyId, actorUserId: req.user.id, input: req.body }) });
  } catch (e) { next(e); }
}
