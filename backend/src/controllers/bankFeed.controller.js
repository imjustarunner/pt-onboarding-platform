import { requestEraDepositVerification } from '../services/bankDepositVerification.service.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { positiveId, billingError } from '../services/familyBillingPolicy.service.js';
import { bankFeedOverview, startBankConnection, completeBankConnection, disconnectBankFeed, syncBankFeed } from '../services/bankFeed.service.js';

async function scope(req) {
  // Bank-owner consent is more privileged than delegated claim billing access.
  if (!['admin', 'super_admin'].includes(req.user?.role)) throw billingError(403, 'Agency administrator access is required for bank connections');
  const agencyId = positiveId(req.body?.agencyId || req.query.agencyId);
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
  return { agencyId, actorUserId: positiveId(req.user.id) };
}
function endpoint(action) {
  return async (req, res, next) => {
    try { res.json(await action(req, await scope(req))); }
    catch (error) {
      // Never return Stripe request payloads or account details through generic errors.
      next(error.type?.startsWith('Stripe') ? billingError(502, 'Bank connection could not complete; review its status and Stripe setup') : error);
    }
  };
}
export const getBankFeeds = endpoint((req, s) => bankFeedOverview(s.agencyId, req.query.accountId ? positiveId(req.query.accountId) : null, req.query.after ? positiveId(req.query.after) : 0));
export const createBankSession = endpoint((req, s) => startBankConnection({ ...s, ownerAuthorized: req.body.ownerAuthorized, sharedAccount: false, requestKey: req.body.requestKey }));
export const finishBankSession = endpoint((req, s) => completeBankConnection({ ...s, sessionKey: String(req.body.sessionKey || '') }));
export const removeBankFeed = endpoint((req, s) => disconnectBankFeed({ ...s, accountId: positiveId(req.params.id) }));
export const importBankFeed = endpoint((req, s) => syncBankFeed(s.agencyId, positiveId(req.params.id)));

export const verifyEraDeposit = endpoint((req, s) => requestEraDepositVerification({ ...s, accountId: positiveId(req.params.id), eraId: String(req.body.eraId || ''), page: Number(req.body.page || 1) }));
