import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import {positiveId,billingError} from '../services/familyBillingPolicy.service.js';
import {serviceFeeAgreementOverview,saveServiceFeeAgreement} from '../services/medicalServiceFees.service.js';
async function scope(req){const agencyId=positiveId(req.body?.agencyId||req.query.agencyId);await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});return {agencyId,actorUserId:req.user.id};}
export async function getMedicalServiceFees(req,res,next){try{const s=await scope(req);res.json({...await serviceFeeAgreementOverview(s.agencyId),canEdit:req.user.role==='super_admin'});}catch(e){next(e);}}
export async function saveMedicalServiceFees(req,res,next){try{if(req.user.role!=='super_admin')throw billingError(403,'Only a platform administrator can set agency service prices');res.json(await saveServiceFeeAgreement({...req.body,...await scope(req)}));}catch(e){next(e);}}
