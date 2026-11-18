import IntakeLink from '../models/IntakeLink.model.js';
import User from '../models/User.model.js';
import policy from '../services/plotlineCompanyPolicy.service.js';
const flags=value=>typeof value==='string'?JSON.parse(value):value||{};
const run=fn=>async(req,res,next)=>{try{await fn(req);next();}catch(error){if(error.status)return res.status(error.status).json({error:{code:error.code,message:error.message}});next(error);}};
export const plotlinePublicFormTrial=run(async req=>{
 if(['GET','HEAD','OPTIONS'].includes(req.method))return;
 const link=await IntakeLink.findByPublicKey(req.params.publicKey);
 if(link?.organization_id)await policy.assertWritable(Number(link.organization_id));
});
export const plotlineCandidateTrial=run(async req=>{
 if(['GET','HEAD','OPTIONS'].includes(req.method))return;
 const agencies=await User.getAgencies(req.portalUser.id);
 for(const agency of agencies||[])if(flags(agency.feature_flags||agency.featureFlags).plotlineOnly===true)await policy.assertWritable(agency.id);
});
