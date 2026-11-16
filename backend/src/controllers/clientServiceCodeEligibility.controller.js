import ClinicalEligibilityService from '../services/clinicalEligibility.service.js';
import {resolveClientRecordAccess} from '../services/clientRecordAccess.service.js';
import {listClientAgencyMembershipIds} from '../utils/noteAidClientAgency.js';
import {clientPayerServiceEligibility} from '../services/clientPayerServiceEligibility.service.js';
const positive=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw Object.assign(new Error('Valid agency, client and provider identifiers are required.'),{status:400});return n;};
export async function getClientServiceCodeEligibility(req,res,next){
 try{
  const agencyId=positive(req.query.agencyId),clientId=positive(req.query.clientId),providerUserId=positive(req.query.providerId || req.user.id);
  await ClinicalEligibilityService.ensureAgencyAccess({reqUser:req.user,agencyId});
  if(providerUserId!==Number(req.user.id) && !['clinical_practice_assistant','provider_plus','admin','super_admin','support','staff'].includes(req.user.role))throw Object.assign(new Error('Schedule management access is required to review another provider’s service choices.'),{status:403});
  const access=await resolveClientRecordAccess({userId:req.user.id,role:req.user.role,clientId});
  if(!access.ok || !(await listClientAgencyMembershipIds(clientId)).includes(agencyId))throw Object.assign(new Error('This client is not available in the selected practice.'),{status:403});
  const dateOfService=String(req.query.dateOfService || '');if(dateOfService && (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfService) || !Number.isFinite(Date.parse(dateOfService)) || new Date(dateOfService).toISOString().slice(0,10)!==dateOfService))throw Object.assign(new Error('Select a valid service date.'),{status:400});
  res.set('Cache-Control','no-store').json(await clientPayerServiceEligibility({agencyId,clientId,providerUserId,dateOfService}));
 }catch(error){next(error);}
}
