import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import { listClientAgencyMembershipIds } from '../utils/noteAidClientAgency.js';
import { clientPayerServiceEligibility } from '../services/clientPayerServiceEligibility.service.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import { resolveClinicalDraftSessionContext } from '../services/clinicalDraftSessionContext.service.js';

const positive = value => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw Object.assign(new Error('Valid agency, client and provider identifiers are required.'), { status: 400 });
  return n;
};

export async function getClientServiceCodeEligibility(req, res, next) {
  try {
    const requestedAgencyId = positive(req.query.agencyId);
    const clientId = positive(req.query.clientId);
    const providerUserId = positive(req.query.providerId || req.user.id);
    const dateOfService = String(req.query.dateOfService || '');
    if (dateOfService && (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfService) || !Number.isFinite(Date.parse(dateOfService))
      || new Date(dateOfService).toISOString().slice(0, 10) !== dateOfService)) {
      throw Object.assign(new Error('Select a valid service date.'), { status: 400 });
    }
    await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId: requestedAgencyId });
    if (providerUserId !== Number(req.user.id) && !['clinical_practice_assistant', 'provider_plus', 'admin', 'super_admin', 'support', 'staff'].includes(req.user.role)) {
      throw Object.assign(new Error('Schedule management access is required to review another provider’s service choices.'), { status: 403 });
    }
    const access = await resolveClientRecordAccess({ userId: req.user.id, role: req.user.role, clientId });
    if (!access.ok) throw Object.assign(new Error('This client is not available in the selected practice.'), { status: 403 });

    let agencyId = requestedAgencyId;
    // A shell agency may differ from the saved encounter. Only an explicit,
    // fully validated session can select another practice; never guess from a name.
    const clinicalSessionId = req.query.clinicalSessionId ? positive(req.query.clinicalSessionId) : null;
    const officeEventId = req.query.officeEventId ? positive(req.query.officeEventId) : null;
    if (clinicalSessionId || officeEventId) {
      const session = clinicalSessionId ? await ClinicalSession.findById(clinicalSessionId)
        : await ClinicalSession.findByOfficeEventAndClient({ officeEventId, clientId });
      if (!session) throw Object.assign(new Error('The selected session is not available.'), { status: 403 });
      agencyId = positive(session.agency_id);
      await resolveClinicalDraftSessionContext({ agencyId, clientId, providerUserId,
        clinicalSessionId: session.id, officeEventId, dateOfService }, { sessions: { findById: async () => session } });
      if (agencyId !== requestedAgencyId) await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
    }
    if (!(await listClientAgencyMembershipIds(clientId)).map(Number).includes(agencyId)) {
      throw Object.assign(new Error('This client is not available in the selected practice.'), { status: 403 });
    }
    const eligibility = await clientPayerServiceEligibility({ agencyId, clientId, providerUserId, dateOfService });
    res.set('Cache-Control', 'no-store').json({ ...eligibility, agencyId });
  } catch (error) { next(error); }
}
