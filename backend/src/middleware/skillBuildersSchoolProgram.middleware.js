import { assertSkillBuildersSchoolProgramForRequest } from '../utils/skillBuildersSchoolProgramFeature.js';

function parseAgencyIdFromRequest(req) {
  const h = req.get('x-agency-id');
  if (h != null && String(h).trim()) {
    const n = parseInt(String(h).trim(), 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
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

    const agencyId = parseAgencyIdFromRequest(req);
    if (!agencyId) {
      return res.status(400).json({
        error: { message: 'Agency context is required (X-Agency-Id or agencyId) for Skill Builders requests' }
      });
    }
    const gate = await assertSkillBuildersSchoolProgramForRequest(req, agencyId);
    if (!gate.ok) {
      return res.status(gate.status).json({ error: { message: gate.message } });
    }
    return next();
  } catch (e) {
    return next(e);
  }
}
