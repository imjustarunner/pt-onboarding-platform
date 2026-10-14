import { hasSchedulingBillingAccess } from '../services/schedulingBillingAccess.service.js';
import pool from '../config/database.js';
import { grantVerifiedBillingScope } from '../utils/verifiedBillingScope.js';
import User from '../models/User.model.js';
import { getMedicalBillingFlags } from '../services/medicalBillingFlags.service.js';

async function loadAgencyFlags(agencyId) {
  const id = parseInt(agencyId, 10);
  if (!id) return null;
  const [rows] = await pool.execute('SELECT id, feature_flags FROM agencies WHERE id = ? AND is_active = 1 AND COALESCE(is_archived, 0) = 0', [id]);
  return rows?.[0] || null;
}

function resolveAgencyId(req) {
  // X-Agency-Id identifies the shell's current agency. Explicit billing scope
  // may differ, but body/query/path must agree with each other.
  const values = [req.params?.agencyId, req.body?.agencyId, req.query?.agencyId]
    .filter(value => value != null && value !== '');
  if (!values.length && req.headers?.['x-agency-id']) values.push(req.headers['x-agency-id']);
  if (!values.length) return null;
  const ids = values.map(Number);
  if (ids.some(id => !Number.isSafeInteger(id) || id < 1) || new Set(ids).size !== 1) {
    throw Object.assign(new Error('Provide one consistent agencyId for this request'), { status: 400 });
  }
  return ids[0];
}

/**
 * Require medicalBillingEnabled. Optional childFlag e.g. 'medicalClaimsEnabled'.
 */
export function requireMedicalBilling(childFlag = null) {
  return async (req, res, next) => {
    try {
      const agencyId = resolveAgencyId(req);
      if (!agencyId) {
        return res.status(400).json({ error: { message: 'agencyId is required' } });
      }
      const agency = await loadAgencyFlags(agencyId);
      if (!agency) {
        return res.status(404).json({ error: { message: 'Agency not found' } });
      }
      const flags = getMedicalBillingFlags(agency);
      if (!flags.medicalBillingEnabled) {
        return res.status(403).json({ error: { message: 'Medical billing is not enabled for this agency' } });
      }
      if (childFlag && !flags[childFlag]) {
        return res.status(403).json({ error: { message: `${childFlag} is not enabled for this agency` } });
      }
      req.medicalBillingFlags = flags;
      req.medicalBillingAgencyId = Number(agency.id);
      next();
    } catch (e) {
      next(e);
    }
  };
}

export const requireMedicalBillingMaster = requireMedicalBilling(null);
export const requireClinicalChart = requireMedicalBilling('clinicalChartEnabled');
export const requireClinicalNoteSigning = requireMedicalBilling('clinicalNoteSigningEnabled');
export const requireMedicalClaims = requireMedicalBilling('medicalClaimsEnabled');
export const requireClaimMd = requireMedicalBilling('claimMdEnabled');

const CLINICAL_BILLING_ROLES = new Set([
  'super_admin',
  'admin',
  'provider',
  'provider_plus',
  'clinical_practice_assistant',
  'supervisor'
]);

/**
 * After agency medical-billing flags: allow clinical roles always;
 * support/staff only with user_agencies.has_billing_access for the agency.
 */
export async function requireMedicalBillingActorAccess(req, res, next) {
  try {
    const role = String(req.user?.role || req.user?.effectiveRole || '').toLowerCase();
    if (CLINICAL_BILLING_ROLES.has(role)) return next();

    if (role === 'support' || role === 'staff') {
      const agencyId = Number(
        req.medicalBillingAgencyId ||
          resolveAgencyId(req) ||
          0
      );
      if (!agencyId) {
        return res.status(400).json({ error: { message: 'agencyId is required' } });
      }
      const ids = await User.listBillingAgencyIds(req.user.id);
      if ((ids || []).some((id) => Number(id) === agencyId)) return next();
      return res.status(403).json({ error: { message: 'Medical billing access required for this agency' } });
    }

    return res.status(403).json({ error: { message: 'Access denied' } });
  } catch (e) {
    next(e);
  }
}

/** Pricing, claim transmission, and reporting require delegated billing access. */
export async function requireMedicalBillingFinancialAccess(req, res, next) {
  try {
    const agencyId = Number(req.medicalBillingAgencyId || resolveAgencyId(req));
    if (await hasSchedulingBillingAccess(req.user, agencyId)) {
      req.user = { ...req.user };
      grantVerifiedBillingScope(req.user, agencyId);
      return next();
    }
    return res.status(403).json({ error: { message: 'Billing access required for this agency' } });
  } catch (error) { next(error); }
}

export const requireMedicalBillingReportAccess = requireMedicalBillingFinancialAccess;

/** Shared code/location metadata can be read by clinicians or authorized billers.
 * This does not run on chart, note, treatment-plan or signing routes.
 */
export async function allowVerifiedBillingMetadataAccess(req, res, next) {
  try {
    const agencyId = Number(req.medicalBillingAgencyId || resolveAgencyId(req));
    if (await hasSchedulingBillingAccess(req.user, agencyId)) {
      req.user = { ...req.user };
      grantVerifiedBillingScope(req.user, agencyId);
    }
    next();
  } catch (error) { next(error); }
}
