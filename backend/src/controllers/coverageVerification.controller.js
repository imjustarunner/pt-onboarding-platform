import pool from '../config/database.js';
import {runMeteredCoverageCheck} from '../services/eligibilityUsage.service.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { positiveId } from '../services/familyBillingPolicy.service.js';
import { readClientInsurance } from '../services/clientInsurance.service.js';
import { getClaimMdBillingProfile } from '../services/claimMdBillingProfile.service.js';
import { resolveClaimMdConnection } from '../services/claimMdConnection.service.js';
import { listCoverageEvidence,runCoverageCheck,saveCoverageReview,coverageReviewBlockers,coverageReviewToken,assignmentInsuranceSummary,assignmentCoverageIssues,syntheticQaCoverageReviewAvailable } from '../services/coverageVerification.service.js';
import { clientCoverageAdmission } from '../services/clientCoverageAdmission.service.js';
async function scope(req){
 const agencyId=positiveId(req.body?.agencyId||req.query.agencyId),clientId=positiveId(req.params.clientId);
 await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
 const [[client]]=await pool.execute('SELECT id FROM clients WHERE id=? AND agency_id=?',[clientId,agencyId]);
 if(!client)throw Object.assign(new Error('Client not found'),{status:404});
 return {agencyId,clientId,actorUserId:req.user.id};
}
export async function getCoverageEvidence(req,res,next){try{
 const s=await scope(req),serviceDate=req.query.serviceDate,insurance=await readClientInsurance(s.clientId,s.agencyId),evidence=await listCoverageEvidence({...s,serviceDate});
 const missingAssignmentFields=assignmentCoverageIssues(insurance,serviceDate);
 res.set('Cache-Control','no-store').json({...evidence,syntheticQaReviewAvailable:await syntheticQaCoverageReviewAvailable(s),blockers:coverageReviewBlockers({insurance,...evidence}),insuranceSummary:assignmentInsuranceSummary(insurance),
  reviewToken:coverageReviewToken({...s,...evidence,serviceDate,insurance}),readyForAssignmentReview:!missingAssignmentFields.length,missingAssignmentFields,
  ...(req.query.forAssignment==='true'||req.query.forAssignment===true?{admission:await clientCoverageAdmission(s.clientId)}:{})});
}catch(e){next(e);}}
export async function checkClientCoverage(req,res,next){try{const s=await scope(req),profile=await getClaimMdBillingProfile(s.agencyId,req.body.billingOfficeId),connection=await resolveClaimMdConnection(s.agencyId);res.json(await runMeteredCoverageCheck({...s,slot:req.body.slot,serviceDate:req.body.serviceDate,requestKey:req.body.requestKey,lookupMode:req.body.lookupMode,profile,connection}));}catch(e){next(e);}}
export async function reviewClientCoverage(req,res,next){try{
 const s=await scope(req),saved=await saveCoverageReview({...req.body,...s});
 res.set('Cache-Control','no-store').status(201).json({...saved,...(req.body.assignmentReview===true?{admission:await clientCoverageAdmission(s.clientId)}:{})});
}catch(e){if(e.code==='COVERAGE_REVIEW_STALE')return res.set('Cache-Control','no-store').status(409).json({error:{code:e.code,message:e.message}});next(e);}}
