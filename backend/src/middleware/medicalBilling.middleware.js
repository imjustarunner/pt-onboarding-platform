import pool from '../config/database.js';
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
