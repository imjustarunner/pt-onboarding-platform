import pool from '../config/database.js';
import { readClientInsurance, writeClientInsurance, patientFromDemographics, mergePatientDefaults } from './clientInsurance.service.js';
import { getMedicalBillingFlags } from './medicalBillingFlags.service.js';

export const eligibilityDemographicFields = ['full_name','date_of_birth','gender','address_street','address_apt','address_city','address_state','address_zip','insurance_type_id','primary_insurer_name'];

export function mergeMissingBillingDemographics(insurance, demographics) {
  return mergePatientDefaults(insurance?.patient || {},demographics);
}

/** Called by chart creation/edits and imports using the shared client model.
 * Only queue work. A demographics save never makes a synchronous payer call. */
export async function syncInsuranceDemographicsForEligibility(clientId, db = pool) {
  if(typeof db.getConnection==='function') {
    const connection=await db.getConnection();
    try {await connection.beginTransaction();const result=await syncInsuranceDemographicsForEligibility(clientId,connection);await connection.commit();return result;}
    catch(error){await connection.rollback();throw error;}finally{connection.release();}
  }
  const [[row]] = await db.execute(`SELECT c.id,c.agency_id,c.full_name,c.date_of_birth,c.gender,
    c.address_street,c.address_apt,c.address_city,c.address_state,c.address_zip,c.primary_insurer_name,
    a.feature_flags,it.insurance_key,it.label AS insurance_label
    FROM clients c JOIN agencies a ON a.id=c.agency_id LEFT JOIN insurance_types it ON it.id=c.insurance_type_id
    WHERE c.id=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0
    AND c.compliance_archived_at IS NULL AND c.status NOT IN ('ARCHIVED','INACTIVE','TERMINATED') FOR UPDATE`, [clientId]);
  if (!row) return null;
  const flags = typeof row.feature_flags === 'string' ? JSON.parse(row.feature_flags || '{}') : row.feature_flags || {};
  if (!flags.intakeEligibilityAutomation?.enabled || !getMedicalBillingFlags(row).medicalBillingEnabled) return null;
  const insurance = await readClientInsurance(clientId, row.agency_id, db);
  const demographics = patientFromDemographics(row);
  const patient = mergeMissingBillingDemographics(insurance, demographics);
  const primary = { ...(insurance?.primary || {}) };
  if(!primary.insurerName && row.primary_insurer_name)primary.insurerName=row.primary_insurer_name;
  if(!primary.insurerName && /medicaid|health first colorado/i.test(`${row.insurance_key || ''} ${row.insurance_label || ''}`))primary.isMedicaid=true;
  // Avoid making an empty billing record for a chart with no usable identity.
  if (!insurance && !patient.firstName && !patient.lastName && !patient.dateOfBirth) return null;
  if (insurance && JSON.stringify(patient) === JSON.stringify(insurance.patient || {}) && JSON.stringify(primary) === JSON.stringify(insurance.primary || {})) return null;
  return writeClientInsurance({ ...insurance, clientId, agencyId: row.agency_id, primary, patient, verifiedForClaims: false }, db);
}
