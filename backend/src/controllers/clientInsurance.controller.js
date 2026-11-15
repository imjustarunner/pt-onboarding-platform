import pool from '../config/database.js';
import ClientPhiDocument from '../models/ClientPhiDocument.model.js';
import {coverageInsuranceFingerprint as coverageFingerprint} from '../utils/paperInsuranceReviewGate.js';
import {paperInsuranceIsReviewed} from '../utils/paperInsuranceReviewGate.js';
import {paperInsuranceStatus} from '../services/paperInsuranceStatus.service.js';
import { decodeInsuranceProfile } from '../models/GuardianInsuranceProfile.model.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { readClientInsurance, writeClientInsurance, claimInsuranceIssues, insuranceDemographics } from '../services/clientInsurance.service.js';
import { positiveId, auditBilling } from '../services/familyBillingPolicy.service.js';
import { requireClientAccountSupport } from '../services/clientAccountSupportAccess.service.js';
import { readEligibilityProfile } from '../services/eligibilityProfile.service.js';
import { clientInsurancePayers, resolveConfiguredPolicy } from '../services/clientInsurancePayers.service.js';
import { decryptDemographicsPayload } from '../services/demographicsImport.service.js';
import { paperCoverageFromCandidate } from '../../../frontend/src/navigation/paperInsuranceReview.js';

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
    const payers = await clientInsurancePayers(c.agencyId, pool);
    const [[paperClient]] = await pool.execute('SELECT paper_packet_demo_candidate_enc FROM clients WHERE id=? AND agency_id=?', [c.clientId,c.agencyId]);
    let paperCoverage = null;
    if (paperClient?.paper_packet_demo_candidate_enc) {
      try {
        const parsed=decryptDemographicsPayload(paperClient.paper_packet_demo_candidate_enc);
        if(!req.query?.paperDocumentId || !parsed?.documentId || Number(parsed.documentId)===Number(req.query.paperDocumentId))paperCoverage = paperCoverageFromCandidate(parsed, demographics);
      } catch { /* The source PDF remains available for manual review. */ }
    }
    const [submitted]=await pool.execute(`SELECT DISTINCT p.*, u.first_name, u.last_name FROM guardian_insurance_profiles p JOIN users u ON u.id=p.guardian_user_id LEFT JOIN guardian_insurance_clients gic ON gic.profile_id=p.id AND gic.agency_id=p.agency_id WHERE p.agency_id=? AND (p.client_id=? OR gic.client_id=?) ORDER BY p.collected_at DESC`,[c.agencyId,c.clientId,c.clientId]);
    const policies=submitted.map(row=>{const value=decodeInsuranceProfile(row);return{id:row.id,submittedBy:[row.first_name,row.last_name].filter(Boolean).join(' '),primary:value.primary || {},secondary:value.secondary || null,hasCardEvidence:!!value.primary_card_front_url,cardEvidence:Object.fromEntries(['primary_front','primary_back','secondary_front','secondary_back'].map(slot=>[slot,!!value[`${slot.replace('_','_card_')}_url`]]))};});
    const findings=!support || insurance?.paperReviewRequired ? await readEligibilityProfile({...c,fingerprint:coverageFingerprint(insurance)}) : [];
    const eligibilityStatus=await paperInsuranceStatus({...c,insurance,findings},pool);
    await auditBilling({...c,userId:req.user.id,action:'staff_view_insurance'});
    res.set('Cache-Control','no-store').json({insurance:support?supportInsurance(insurance):insurance,policies,demographics,payers,paperCoverage,eligibilityStatus,...(support?{}:{missingClaimFields:claimInsuranceIssues(insurance?.primary),eligibilityFindings:findings})});
  } catch(e){next(e);}
}
async function saveInsurance(req,res,next,support=false) {
  try {
    const c = await authorize(req,support);
    if (support && (req.body.verifiedForClaims === true || req.body.acceptAssignment !== undefined)) {
      throw Object.assign(new Error('Claim verification and payment assignment require billing access'), {status:403});
    }
    const transitionImport = req.body.importContext === 'ehr_transition';
    const previous = await readClientInsurance(c.clientId,c.agencyId);
    const paperDocumentId=Number(req.body.paperDocumentId || previous?.paperSourceDocumentId)||null;
    if(req.body.paperReviewConfirmed===true && !paperDocumentId)throw Object.assign(new Error('Choose the uploaded paper packet before confirming its insurance transcription.'),{status:400});
    if(req.body.paperDocumentId || req.body.paperReviewConfirmed===true) {
      const source=await ClientPhiDocument.findSchoolPaperPacket(c.clientId,paperDocumentId);
      if(!source || Number(source.client_id)!==c.clientId || Number(source.agency_id)!==c.agencyId || source.removed_at || req.body.paperReviewConfirmed===true && source.scan_status!=='clean')throw Object.assign(new Error('Review the current uploaded packet after its file check is complete.'),{status:409});
      if(previous?.paperSourceDocumentId && Number(previous.paperSourceDocumentId)!==paperDocumentId)throw Object.assign(new Error('The packet source changed. Reload the current packet before confirming its insurance.'),{status:409});
    }
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
    const payers = [req.body.primary,req.body.secondary].some(policy=>policy?.payerCatalogId) ? await clientInsurancePayers(c.agencyId,pool) : [];
    const primary=resolveConfiguredPolicy(req.body.primary,payers),secondary=resolveConfiguredPolicy(req.body.secondary,payers);
    const insurance = await writeClientInsurance({...c,primary,secondary,patient:req.body.patient,profileId,coverageSources,confirmedBy:req.user.id,paperSourceDocumentId:paperDocumentId,paperReviewActorId:req.body.paperReviewConfirmed===true?req.user.id:null,queueEligibility:!transitionImport && (!(paperDocumentId || previous?.paperReviewRequired) || req.body.paperReviewConfirmed===true),verifiedForClaims:!transitionImport&&!support&&req.body.verifiedForClaims===true,acceptAssignment:support||transitionImport?(previous?.acceptAssignment??null):req.body.acceptAssignment===true ? true : req.body.acceptAssignment===false ? false : null});
    await auditBilling({...c,userId:req.user.id,action:'staff_update_insurance'});
    if(req.body.paperReviewConfirmed===true)await auditBilling({...c,userId:req.user.id,action:'staff_confirm_paper_insurance_transcription',objectId:paperDocumentId});
    const eligibilityQueueWarning=insurance.eligibilityQueueWarning||null,automaticEligibility=insurance.automaticEligibility||(insurance.paperReviewRequired&&!paperInsuranceIsReviewed(insurance)?{status:'awaiting_paper_review'}:null);
    res.set('Cache-Control','no-store').json({insurance:support?supportInsurance(insurance):insurance,eligibilityQueueWarning,automaticEligibility,...(support?{}:{missingClaimFields:claimInsuranceIssues(insurance.primary)})});
  } catch(e){next(e);}
}

function supportInsurance(value) {
  return value ? Object.fromEntries(['primary','secondary','patient','profileId','coverageSources','paperReviewRequired','paperSourceDocumentId','paperReview','paperDraftSaved'].map(key=>[key,value[key]])) : null;
}
export const getClientInsurance = (req,res,next) => getInsurance(req,res,next);
export const saveClientInsurance = (req,res,next) => saveInsurance(req,res,next);
export const getSupportClientInsurance = (req,res,next) => getInsurance(req,res,next,true);
export const saveSupportClientInsurance = (req,res,next) => saveInsurance(req,res,next,true);
