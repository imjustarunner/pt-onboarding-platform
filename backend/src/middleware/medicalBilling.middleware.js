import pool from '../config/database.js';
import User from '../models/User.model.js';
import { getMedicalBillingFlags } from '../services/medicalBillingFlags.service.js';

async function loadAgencyFlags(agencyId) {
  const id = parseInt(agencyId, 10);
  if (!id) return null;
  const [rows] = await pool.execute('SELECT id, feature_flags FROM agencies WHERE id = ?', [id]);
  return rows?.[0] || null;
}

function resolveAgencyId(req) {
  return (
    req.params?.agencyId
    || req.body?.agencyId
    || req.query?.agencyId
    || req.headers?.['x-agency-id']
  );
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

/** Agency-wide reporting is limited to administrators and delegated billing staff. */
export function requireMedicalBillingReportAccess(req, res, next) {
  const role = String(req.user?.role || req.user?.effectiveRole || '').toLowerCase();
  if (['super_admin', 'admin', 'support', 'staff'].includes(role)) return next();
  return res.status(403).json({ error: { message: 'Billing report administrator access required' } });
}
