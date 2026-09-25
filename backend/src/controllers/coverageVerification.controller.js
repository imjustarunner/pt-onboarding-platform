import pool from '../config/database.js';
import {runMeteredCoverageCheck} from '../services/eligibilityUsage.service.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { positiveId } from '../services/familyBillingPolicy.service.js';
import { readClientInsurance } from '../services/clientInsurance.service.js';
import { getClaimMdBillingProfile } from '../services/claimMdBillingProfile.service.js';
import { resolveClaimMdConnection } from '../services/claimMdConnection.service.js';
import { listCoverageEvidence,runCoverageCheck,saveCoverageReview,coverageReviewBlockers } from '../services/coverageVerification.service.js';
async function scope(req){
 const agencyId=positiveId(req.body?.agencyId||req.query.agencyId),clientId=positiveId(req.params.clientId);
 await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
 const [[client]]=await pool.execute('SELECT id FROM clients WHERE id=? AND agency_id=?',[clientId,agencyId]);
 if(!client)throw Object.assign(new Error('Client not found'),{status:404});
 return {agencyId,clientId,actorUserId:req.user.id};
}
export async function getCoverageEvidence(req,res,next){try{const s=await scope(req),insurance=await readClientInsurance(s.clientId,s.agencyId),evidence=await listCoverageEvidence({...s,serviceDate:req.query.serviceDate});res.json({...evidence,blockers:coverageReviewBlockers({insurance,...evidence})});}catch(e){next(e);}}
export async function checkClientCoverage(req,res,next){try{const s=await scope(req),profile=await getClaimMdBillingProfile(s.agencyId,req.body.billingOfficeId),connection=await resolveClaimMdConnection(s.agencyId);res.json(await runMeteredCoverageCheck({...s,slot:req.body.slot,serviceDate:req.body.serviceDate,requestKey:req.body.requestKey,profile,connection}));}catch(e){next(e);}}
export async function reviewClientCoverage(req,res,next){try{const s=await scope(req);res.status(201).json(await saveCoverageReview({...req.body,...s}));}catch(e){next(e);}}
