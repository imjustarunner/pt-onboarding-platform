import pool from '../config/database.js';
import { decodeInsuranceProfile } from '../models/GuardianInsuranceProfile.model.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { readClientInsurance, writeClientInsurance, claimInsuranceIssues } from '../services/clientInsurance.service.js';
import { positiveId, auditBilling } from '../services/familyBillingPolicy.service.js';

async function authorize(req) {
  const agencyId = positiveId(req.query?.agencyId || req.body?.agencyId), clientId = positiveId(req.params.clientId);
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
  const [rows] = await pool.execute('SELECT id FROM clients WHERE id = ? AND agency_id = ?', [clientId, agencyId]);
  if (!rows.length) throw Object.assign(new Error('Client not found'), { status:404 });
  return {agencyId,clientId};
}
export async function getClientInsurance(req,res,next) {
  try {
    const c = await authorize(req);
    const insurance = await readClientInsurance(c.clientId,c.agencyId);
    const [submitted]=await pool.execute(`SELECT DISTINCT p.*, u.first_name, u.last_name FROM guardian_insurance_profiles p JOIN users u ON u.id=p.guardian_user_id LEFT JOIN guardian_insurance_clients gic ON gic.profile_id=p.id AND gic.agency_id=p.agency_id WHERE p.agency_id=? AND (p.client_id=? OR gic.client_id=?) ORDER BY p.collected_at DESC`,[c.agencyId,c.clientId,c.clientId]);
    const policies=submitted.map(row=>{const value=decodeInsuranceProfile(row);return{id:row.id,submittedBy:[row.first_name,row.last_name].filter(Boolean).join(' '),primary:value.primary || {},secondary:value.secondary || null,hasCardEvidence:!!value.primary_card_front_url};});
    await auditBilling({...c,userId:req.user.id,action:'staff_view_insurance'});
    res.set('Cache-Control','no-store').json({insurance,policies,missingClaimFields:claimInsuranceIssues(insurance?.primary)});
  } catch(e){next(e);}
}
export async function saveClientInsurance(req,res,next) {
  try {
    const c = await authorize(req);
    let profileId = req.body.profileId ? positiveId(req.body.profileId) : null;
    if(profileId){const [matches]=await pool.execute('SELECT p.id FROM guardian_insurance_profiles p LEFT JOIN guardian_insurance_clients gic ON gic.profile_id=p.id AND gic.agency_id=p.agency_id WHERE p.id=? AND p.agency_id=? AND (p.client_id=? OR gic.client_id=?)',[profileId,c.agencyId,c.clientId,c.clientId]);if(!matches.length)throw Object.assign(new Error('Policy is not assigned to this client'),{status:403});}
    const insurance = await writeClientInsurance({...c,primary:req.body.primary,secondary:req.body.secondary,patient:req.body.patient,profileId,confirmedBy:req.user.id,verifiedForClaims:req.body.verifiedForClaims===true,acceptAssignment:req.body.acceptAssignment===true ? true : req.body.acceptAssignment===false ? false : null});
    await auditBilling({...c,userId:req.user.id,action:'staff_update_insurance'});
    res.set('Cache-Control','no-store').json({insurance,missingClaimFields:claimInsuranceIssues(insurance.primary)});
  } catch(e){next(e);}
}
