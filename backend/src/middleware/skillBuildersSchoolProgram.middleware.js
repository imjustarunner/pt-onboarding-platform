import { assertSkillBuildersSchoolProgramForRequest } from '../utils/skillBuildersSchoolProgramFeature.js';
import { resolveTenantRootAgencyId } from '../utils/meDashboardTenantScope.js';

function parseAgencyIdFromRequest(req) {
  const q = req.query?.agencyId;
  if (q != null && String(q).trim()) {
    const n = parseInt(String(q).trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const b = req.body?.agencyId;
  if (b != null && String(b).trim()) {
    const n = parseInt(String(b).trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const h = req.get('x-agency-id');
  if (h != null && String(h).trim()) {
    const n = parseInt(String(h).trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Requires authenticated requests to include agency context (X-Agency-Id or agencyId)
 * and that the Skill Builders school program feature is enabled for that tenant.
 */
export async function requireSkillBuildersSchoolProgramForAgencyContext(req, res, next) {
  try {
    const role = String(req.user?.role || '').trim().toLowerCase();
    if (role === 'super_admin') return next();
    // Backoffice roles can access Program events tooling even when the
    // Skill Builders school-program feature flag is not enabled.
    // (Feature flag primarily gates the end-user SB experience.)
    if (role === 'admin' || role === 'staff' || role === 'support' || role === 'clinical_practice_assistant' || role === 'provider_plus') {
      return next();
    }

    const agencyId = parseAgencyIdFromRequest(req);
    if (!agencyId) {
      return res.status(400).json({
        error: { message: 'Agency context is required (X-Agency-Id or agencyId) for Skill Builders requests' }
      });
    }
    const parentAgencyId = (await resolveTenantRootAgencyId(agencyId)) || agencyId;
    const gate = await assertSkillBuildersSchoolProgramForRequest(req, parentAgencyId);
    if (!gate.ok) {
      return res.status(gate.status).json({ error: { message: gate.message } });
    }
    return next();
  } catch (e) {
    return next(e);
  }
}
