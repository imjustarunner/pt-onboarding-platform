import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { positiveId } from '../services/familyBillingPolicy.service.js';
import { eligibilityAutomationOverview,saveEligibilityAutomation,enrollEligibilityClients } from '../services/eligibilityAutomation.service.js';
async function scope(req){const agencyId=positiveId(req.body?.agencyId||req.query.agencyId);await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});return {agencyId,actorUserId:req.user.id};}
export async function getEligibilityAutomation(req,res,next){try{const s=await scope(req);res.json(await eligibilityAutomationOverview(s.agencyId,{after:req.query.after?positiveId(req.query.after):0}));}catch(e){next(e);}}
export async function saveEligibilitySettings(req,res,next){try{res.json(await saveEligibilityAutomation({...req.body,...await scope(req)}));}catch(e){next(e);}}
export async function enrollEligibilityRoster(req,res,next){try{res.json(await enrollEligibilityClients({...req.body,...await scope(req)}));}catch(e){next(e);}}
