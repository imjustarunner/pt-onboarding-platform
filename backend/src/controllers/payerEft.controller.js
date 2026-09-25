import { positiveId } from '../services/familyBillingPolicy.service.js';
import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import { listPayerEft, savePayerEft, payerEftHistory } from '../services/payerEft.service.js';
async function agency(req){const id=positiveId(req.body?.agencyId||req.query.agencyId);await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId:id});return id;}
export async function getEft(req,res,next){try{res.set('Cache-Control','no-store').json(await listPayerEft(await agency(req)));}catch(e){next(e);}}
export async function saveEft(req,res,next){try{res.json(await savePayerEft({...req.body,agencyId:await agency(req),actorUserId:req.user.id}));}catch(e){next(e);}}
export async function getEftHistory(req,res,next){try{res.set('Cache-Control','no-store').json({items:await payerEftHistory(await agency(req),positiveId(req.params.id))});}catch(e){next(e);}}
