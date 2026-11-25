import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import {claimFinancialReview,saveClaimPatientEstimate,recordFinalPatientResponsibility} from '../services/claimFinancialReview.service.js';
async function scope(req){const agencyId=Number(req.body?.agencyId||req.query?.agencyId);await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});return agencyId;}
export const getClaimFinancialReview=async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json(await claimFinancialReview({agencyId:await scope(req),claimId:Number(req.params.claimId)}));}catch(error){next(error);}};
export const postClaimPatientEstimate=async(req,res,next)=>{try{res.json(await saveClaimPatientEstimate({...req.body,agencyId:await scope(req),claimId:Number(req.params.claimId),actorUserId:req.user.id}));}catch(error){next(error);}};

export const postFinalPatientResponsibility=async(req,res,next)=>{try{res.json(await recordFinalPatientResponsibility({...req.body,agencyId:await scope(req),claimId:Number(req.params.claimId),actorUserId:req.user.id}));}catch(error){next(error);}};
