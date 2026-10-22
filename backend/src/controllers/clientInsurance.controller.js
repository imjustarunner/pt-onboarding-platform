import pool from '../config/database.js';
import { decodeInsuranceProfile } from '../models/GuardianInsuranceProfile.model.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { readClientInsurance, writeClientInsurance, claimInsuranceIssues, insuranceDemographics } from '../services/clientInsurance.service.js';
import { positiveId, auditBilling } from '../services/familyBillingPolicy.service.js';
import { requireClientAccountSupport } from '../services/clientAccountSupportAccess.service.js';

async function authorize(req, support) {
  if (support) {
    const client = await requireClientAccountSupport(req.user, req.params.id);
    return { agencyId: Number(client.agency_id), clientId: Number(client.id) };
  }
  const agencyId = positiveId(req.query?.agencyId || req.body?.agencyId), clientId = positiveId(req.params.clientId);
  await ClinicalEligibilityService.ensureAgencyAccess({ reqUser: req.user, agencyId });
  const [rows] = await pool.execute('SELECT id FROM clients WHERE id = ? AND agency_id = ?', [clientId, agencyId]);
  if (!rows.length) throw Object.assign(new Error('Client not found'), { status:404 });
  return {agencyId,clientId};
}
async function getInsurance(req,res,next,support=false) {
  try {
    const c = await authorize(req,support);
    const insurance = await readClientInsurance(c.clientId,c.agencyId);
    const demographics = await insuranceDemographics(c.clientId,c.agencyId);
    const [submitted]=await pool.execute(`SELECT DISTINCT p.*, u.first_name, u.last_name FROM guardian_insurance_profiles p JOIN users u ON u.id=p.guardian_user_id LEFT JOIN guardian_insurance_clients gic ON gic.profile_id=p.id AND gic.agency_id=p.agency_id WHERE p.agency_id=? AND (p.client_id=? OR gic.client_id=?) ORDER BY p.collected_at DESC`,[c.agencyId,c.clientId,c.clientId]);
    const policies=submitted.map(row=>{const value=decodeInsuranceProfile(row);return{id:row.id,submittedBy:[row.first_name,row.last_name].filter(Boolean).join(' '),primary:value.primary || {},secondary:value.secondary || null,hasCardEvidence:!!value.primary_card_front_url,cardEvidence:Object.fromEntries(['primary_front','primary_back','secondary_front','secondary_back'].map(slot=>[slot,!!value[`${slot.replace('_','_card_')}_url`]]))};});
    await auditBilling({...c,userId:req.user.id,action:'staff_view_insurance'});
    res.set('Cache-Control','no-store').json({insurance:support?supportInsurance(insurance):insurance,policies,demographics,...(support?{}:{missingClaimFields:claimInsuranceIssues(insurance?.primary)})});
  } catch(e){next(e);}
}
async function saveInsurance(req,res,next,support=false) {
  try {
    const c = await authorize(req,support);
    if (support && (req.body.verifiedForClaims === true || req.body.acceptAssignment !== undefined)) {
      throw Object.assign(new Error('Claim verification and payment assignment require billing access'), {status:403});
    }
    const previous = support ? await readClientInsurance(c.clientId,c.agencyId) : null;
    let profileId = req.body.profileId ? positiveId(req.body.profileId) : null;
    if(profileId){const [matches]=await pool.execute('SELECT p.id FROM guardian_insurance_profiles p LEFT JOIN guardian_insurance_clients gic ON gic.profile_id=p.id AND gic.agency_id=p.agency_id WHERE p.id=? AND p.agency_id=? AND (p.client_id=? OR gic.client_id=?)',[profileId,c.agencyId,c.clientId,c.clientId]);if(!matches.length)throw Object.assign(new Error('Policy is not assigned to this client'),{status:403});}
    const coverageSources = {};
    for (const position of ['primary','secondary']) {
      const source = req.body.coverageSources?.[position];
      if (!source || (position === 'secondary' && !req.body.secondary)) continue;
      const sourceId = positiveId(source.profileId);
      if (!['primary','secondary'].includes(source.slot)) throw Object.assign(new Error('Choose a valid submitted policy'), {status:400});
      const [matches] = await pool.execute('SELECT DISTINCT p.* FROM guardian_insurance_profiles p LEFT JOIN guardian_insurance_clients gic ON gic.profile_id=p.id AND gic.agency_id=p.agency_id WHERE p.id=? AND p.agency_id=? AND (p.client_id=? OR gic.client_id=?)', [sourceId,c.agencyId,c.clientId,c.clientId]);
      if (!matches[0] || !decodeInsuranceProfile(matches[0])?.[source.slot]) throw Object.assign(new Error('Submitted coverage is not assigned to this client'), {status:403});
      coverageSources[position] = {profileId:sourceId,slot:source.slot};
    }
    if (coverageSources.primary && coverageSources.secondary && coverageSources.primary.profileId === coverageSources.secondary.profileId && coverageSources.primary.slot === coverageSources.secondary.slot) throw Object.assign(new Error('The same submitted policy cannot be both primary and secondary'), {status:400});
    if (coverageSources.primary) profileId = coverageSources.primary.profileId;
    const insurance = await writeClientInsurance({...c,primary:req.body.primary,secondary:req.body.secondary,patient:req.body.patient,profileId,coverageSources,confirmedBy:req.user.id,verifiedForClaims:!support&&req.body.verifiedForClaims===true,acceptAssignment:support?(previous?.acceptAssignment??null):req.body.acceptAssignment===true ? true : req.body.acceptAssignment===false ? false : null});
    await auditBilling({...c,userId:req.user.id,action:'staff_update_insurance'});
    res.set('Cache-Control','no-store').json({insurance:support?supportInsurance(insurance):insurance,...(support?{}:{missingClaimFields:claimInsuranceIssues(insurance.primary)})});
  } catch(e){next(e);}
}

function supportInsurance(value) {
  return value ? Object.fromEntries(['primary','secondary','patient','profileId','coverageSources'].map(key=>[key,value[key]])) : null;
}
export const getClientInsurance = (req,res,next) => getInsurance(req,res,next);
export const saveClientInsurance = (req,res,next) => saveInsurance(req,res,next);
export const getSupportClientInsurance = (req,res,next) => getInsurance(req,res,next,true);
export const saveSupportClientInsurance = (req,res,next) => saveInsurance(req,res,next,true);
