import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { clientSessionBookingAccess, readClientSessionBookingRollout, sessionBookingProviders, saveClientSessionBookingRollout } from '../services/clientSessionBookingRollout.service.js';
const managers = new Set(['admin', 'super_admin']);
async function scope(req, manage = false) {
  const agencyId = Number(req.body?.agencyId || req.query?.agencyId);
  if (!Number.isSafeInteger(agencyId) || agencyId < 1) throw Object.assign(new Error('Choose a practice.'), { status: 400 });
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
  if (manage && !managers.has(req.user.role)) throw Object.assign(new Error('Practice administrator access is required.'), { status: 403 });
  return agencyId;
}
export async function getClientSessionBookingAccess(req, res, next) {
  try {
    const agencyId = await scope(req);
    if(req.query.scope==='agency') {
      if(!managers.has(req.user.role) && !(agencyId===2 && req.user.role==='support'))throw Object.assign(new Error('Administrator scheduling access is required.'),{status:403});
      const providers=await sessionBookingProviders(agencyId);
      const capabilities=await Promise.all(providers.map(provider=>clientSessionBookingAccess(agencyId,provider.id,undefined,{businessType:'any',actorUserId:req.user.id})));
      const availableBusinessTypes=[...new Set(capabilities.flatMap(c=>c.availableBusinessTypes||[]))];
      return res.json({enabled:availableBusinessTypes.length>0,availableBusinessTypes,reason:availableBusinessTypes.length?null:'No eligible employee has an assigned service available for scheduling.'});
    }
    const providerUserId = Number(req.query?.providerUserId || req.user.id);
    if (!Number.isSafeInteger(providerUserId) || providerUserId < 1) return res.status(400).json({ error: { message: 'Choose a provider.' } });
    // This response contains only a booking capability, never private provider data.
    res.json(await clientSessionBookingAccess(agencyId, providerUserId, undefined, {businessType:req.query.businessType,actorUserId:req.user.id}));
  } catch (error) { next(error); }
}
export async function getClientSessionBookingRollout(req, res, next) {
  try {
    const agencyId = await scope(req, true);
    const [policy, providers] = await Promise.all([readClientSessionBookingRollout(agencyId), sessionBookingProviders(agencyId)]);
    res.json({ policy, providers, canManage: true });
  } catch (error) { next(error); }
}
export async function putClientSessionBookingRollout(req, res, next) {
  try {
    const agencyId = await scope(req, true);
    res.json({ policy: await saveClientSessionBookingRollout({ agencyId, actorUserId: req.user.id, input: req.body }) });
  } catch (error) { next(error); }
}
