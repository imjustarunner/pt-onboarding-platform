import {changeClinicalSessionService,getClinicalSessionService} from '../services/clinicalSessionServiceChange.service.js';

function input(req) {
  return {...req.query,...req.body,agencyId:req.mobileClinical?.agencyId||req.body?.agencyId||req.query?.agencyId,sessionId:req.params.sessionId};
}
export const getClinicalSessionServiceCode=async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json(await getClinicalSessionService(req.user,input(req)));}catch(error){next(error);}};
export const changeClinicalSessionServiceCode=async(req,res,next)=>{try{res.set('Cache-Control','no-store');res.json(await changeClinicalSessionService(req.user,input(req)));}catch(error){next(error);}};
