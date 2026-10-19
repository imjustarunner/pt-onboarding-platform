import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { clientSessionBookingAccess, readClientSessionBookingRollout, sessionBookingProviders, saveClientSessionBookingRollout } from '../services/clientSessionBookingRollout.service.js';
const managers = new Set(['admin', 'super_admin', 'support']);
async function scope(req, manage = false) {
  const agencyId = Number(req.body?.agencyId || req.query?.agencyId);
  if (!Number.isSafeInteger(agencyId) || agencyId < 1) throw Object.assign(new Error('Choose a practice.'), { status: 400 });
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
  if (manage && !managers.has(req.user.role)) throw Object.assign(new Error('Practice administration or support access is required.'), { status: 403 });
  return agencyId;
}
export async function getClientSessionBookingAccess(req, res, next) {
  try {
    const agencyId = await scope(req);
    const providerUserId = Number(req.query?.providerUserId || req.user.id);
    if (!Number.isSafeInteger(providerUserId) || providerUserId < 1) return res.status(400).json({ error: { message: 'Choose a provider.' } });
    // This response contains only a booking capability, never private provider data.
    res.json(await clientSessionBookingAccess(agencyId, providerUserId));
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
