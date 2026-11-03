import { getCanonicalFeeSchedule, saveCanonicalFeeSchedule, adoptPlatformFeeDefaults, assertFeeScheduleAccess } from '../services/feeSchedule.service.js';
import { normalizeFeeScope } from '../utils/feeScheduleRates.js';
import { syncCredentialingPayerCatalog } from '../services/credentialingPayerCatalog.service.js';
export const getFeeSchedule = async (req, res, next) => {
  try { return res.json(await getCanonicalFeeSchedule(req.user, req.query)); } catch (error) { return next(error); }
};
export const postFeeSchedule = async (req, res, next) => {
  try { return res.json(await saveCanonicalFeeSchedule(req.user, req.body)); } catch (error) { return next(error); }
};
export const postFeeScheduleDefaults = async (req, res, next) => {
  try { return res.json(await adoptPlatformFeeDefaults(req.user, req.body)); } catch (error) { return next(error); }
};
export const postFeeSchedulePayerSync = async (req, res, next) => {
  try {
    const { agencyId } = normalizeFeeScope({ agencyId: req.body.agencyId });
    await assertFeeScheduleAccess(req.user, agencyId);
    return res.json(await syncCredentialingPayerCatalog({ agencyId, actorUserId: req.user.id, apply: req.body.apply === true, planToken: req.body.planToken }));
  } catch (error) { return next(error); }
};
