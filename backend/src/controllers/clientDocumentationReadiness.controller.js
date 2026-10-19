import { positiveId } from '../services/familyBillingPolicy.service.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { getClientDocumentationReadiness, saveClientDocumentationReview } from '../services/clientDocumentationReadiness.service.js';
async function scope(req) {
  const agencyId = positiveId(req.body?.agencyId || req.query.agencyId), clientId = positiveId(req.params.clientId);
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
  return { agencyId, clientId, actorUserId: req.user.id };
}
export async function getDocumentationReadiness(req, res, next) {
  try { res.json(await getClientDocumentationReadiness({ ...await scope(req), scope: req.query.scope, serviceDate: req.query.serviceDate })); } catch (error) { next(error); }
}
export async function reviewDocumentationReadiness(req, res, next) {
  try { res.status(201).json(await saveClientDocumentationReview({ ...req.body, ...await scope(req) })); } catch (error) { next(error); }
}
