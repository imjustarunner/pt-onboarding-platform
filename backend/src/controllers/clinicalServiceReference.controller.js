import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { getClinicalServiceReference } from '../services/clinicalServiceReference.service.js';

export async function getServiceReference(req, res, next) {
  try {
    const agencyId = Number(req.query.agencyId);
    if (!Number.isSafeInteger(agencyId) || agencyId < 1) return res.status(400).json({ error: { message: 'agencyId is required' } });
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    const serviceInfo = getClinicalServiceReference(req.params.serviceCode);
    if (!serviceInfo) return res.status(404).json({ error: { message: 'No supplied service reference is available for this code.' } });
    return res.json({ serviceInfo });
  } catch (error) { next(error); }
}
