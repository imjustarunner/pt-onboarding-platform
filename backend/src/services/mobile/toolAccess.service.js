import {mobileSessions} from './session.service.js';
import {listMobileAgencies} from './agencyScope.service.js';
import {readAgencyAccess} from '../agencyAccessProfiles.service.js';
import {applyAgencyAccess} from '../../utils/agencyAccessPolicy.js';
import {getUserCapabilities} from '../../utils/capabilities.js';
import {mobileAgencyIcon} from './agencyBrand.service.js';
const exchangeRoles=new Set(['staff','support','admin','super_admin','provider','provider_plus','intern','intern_plus','supervisor','clinical_practice_assistant']);
const supportRoles=new Set(['support','admin','super_admin']);
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function toolAllowed(user,tool){return tool==='exchange'?exchangeRoles.has(user.role):tool==='applicants'?getUserCapabilities(user).canManageHiring===true:supportRoles.has(user.role);}
export function createMobileToolAccess({access=(...args)=>mobileSessions.access(...args),listAgencies=listMobileAgencies,readAccess=readAgencyAccess}={}){
 return async(req,tool,agencyId=null)=>{
  const qv=req.quickView;if(!qv?.mobileDeviceSessionId)throw fail(403,'Sign into AuricWell with your account to use this tool.');
  const context=await access(qv.mobileDeviceSessionId,qv.userId,qv.agencyId,qv.credentialVersion??null);
  if(context.surface!=='staff')throw fail(403,'This tool is available to authorized staff.');
  const scope=await listAgencies(context.user),agencies=[];
  for(const agency of scope.agencies){if(qv.qaAgencyIds && !qv.qaAgencyIds.map(Number).includes(Number(agency.id)))continue;const grant=await readAccess(context.user.id,Number(agency.id));if(!grant)continue;const actor=applyAgencyAccess({...context.user},grant);if(tool && !toolAllowed(actor,tool))continue;agencies.push({agency,actor});}
  if(agencyId!=null){if(!/^[1-9]\d*$/.test(String(agencyId)))throw fail(400,'Choose a valid agency.');const selected=agencies.find(row=>Number(row.agency.id)===Number(agencyId));if(!selected)throw fail(403,'This tool is unavailable for that agency.');return selected;}
  return agencies;
 };
}
export const mobileToolAccess=createMobileToolAccess();
export async function getMobileTools(req,res,next){
 try{res.set('Cache-Control','no-store');const tools={},scope=await mobileToolAccess(req,null);for(const tool of ['exchange','support','livechat','applicants'])tools[tool]=scope.filter(({actor})=>toolAllowed(actor,tool)).map(({agency})=>({id:Number(agency.id),name:agency.name,logoUrl:mobileAgencyIcon(agency)}));res.json({tools});}catch(error){next(error);}
}
