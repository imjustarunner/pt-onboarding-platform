import { assertSkillBuildersSchoolProgramForRequest } from '../utils/skillBuildersSchoolProgramFeature.js';
import { resolveTenantRootAgencyId } from '../utils/meDashboardTenantScope.js';
import pool from '../config/database.js';

function parsePositiveInt(raw) {
  const n = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function getSkillBuilderCoordinatorAccess(userId) {
  const uid = parsePositiveInt(userId);
  if (!uid) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT has_skill_builder_coordinator_access FROM users WHERE id = ? LIMIT 1`,
      [uid]
    );
    const v = rows?.[0]?.has_skill_builder_coordinator_access;
    return v === true || v === 1 || v === '1';
  } catch (e) {
    // Migration may not be applied yet.
    if (e?.code === 'ER_BAD_FIELD_ERROR' || e?.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

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
    // Program coordinators (flag-based) should also be able to access the tooling,
    // even if their role is not one of the backoffice roles above.
    if (await getSkillBuilderCoordinatorAccess(req.user?.id)) {
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
