import { REFERRAL_SERVICES } from '../utils/referralMatching.js';
import { authorizeReferralOutreach, findReferralOptions, prepareReferralEmail, sendReferralEmail } from '../services/referralOutreach.service.js';
const action = fn => async (req,res) => {
  res.set('Cache-Control','no-store');
  try { const agencyId=req.referralAgencyId,actorUserId=req.user.id;
    await authorizeReferralOutreach(agencyId,actorUserId);
    res.json(await fn(req,{agencyId,actorUserId}));
  } catch(error) { res.status(error.status || 503).json({error:{message:error.status ? error.message : 'Referral email service is unavailable. Please retry later.'}}); }
};
export const referralServices = (_req,res) => res.json({services:REFERRAL_SERVICES.map(({id,label})=>({id,label}))});
export const matchReferralRequest = action((req,{agencyId}) => findReferralOptions(agencyId,req.body || {}));
export const previewReferralRequest = action((req,scope) => prepareReferralEmail({...req.body,...scope}));
export const sendReferralRequest = action((req,scope) => sendReferralEmail({...scope,draftId:req.params.id}));
