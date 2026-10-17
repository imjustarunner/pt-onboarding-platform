import {guardianDemographics} from '../services/guardianDemographics.service.js';
const handle=fn=>async(req,res,next)=>{try{if(req.guardianPreviewMode)return res.status(403).json({error:{message:'Client details are unavailable in preview.'}});res.json(await fn(req));}catch(e){next(e);}};
export const read=handle(req=>guardianDemographics.read({user:req.user,clientId:Number(req.params.clientId)}));
export const submit=handle(req=>guardianDemographics.submit({user:req.user,clientId:Number(req.params.clientId),values:req.body?.values,revision:req.body?.revision}));
export const staffRead=handle(req=>guardianDemographics.read({user:req.user,clientId:Number(req.params.id),staff:true}));
export const review=handle(req=>guardianDemographics.review({user:req.user,clientId:Number(req.params.id),requestId:Number(req.params.requestId),acceptedFields:req.body?.acceptedFields,reason:req.body?.reason,revision:req.body?.revision}));
