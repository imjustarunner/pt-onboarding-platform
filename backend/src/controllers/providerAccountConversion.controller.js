import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import {previewProviderConversion,captureProviderConversion,prepareProviderConversion,activateProviderConversion} from '../services/providerAccountConversion.service.js';
const handler=action=>async(req,res,next)=>{try{
 const agencyId=Number(req.body?.agencyId || req.query?.agencyId);
 await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
 const result=await action({...req.body,agencyId,providerUserId:Number(req.params.providerUserId),actor:req.user});
 res.json(result);
}catch(cause){if(cause.code==='ER_NO_SUCH_TABLE')return res.status(503).json({error:{message:'Individual account conversion requires database migration1848 before use.',code:'PROVIDER_CONVERSION_SCHEMA_REQUIRED'}});next(cause);}};
export const previewProviderAccountConversion=handler(previewProviderConversion);
export const captureProviderAccountConversion=handler(captureProviderConversion);
export const prepareProviderAccountConversion=handler(prepareProviderConversion);
export const activateProviderAccountConversion=handler(activateProviderConversion);
