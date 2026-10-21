import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import {guardianCareContexts,guardianServiceContext} from './clientServiceEnrollment.service.js';
import {dependentAccess,dependentError as fail} from './dependentPortalPolicy.service.js';
import {listGuardianAppointments} from './guardianAppointments.service.js';
import {guardianPlanProgress} from './guardianPlanProgress.service.js';
import {listSharedFiles} from './guardianFileShares.service.js';

export async function personalProfile(userId){
 const access=await dependentAccess(userId);
 if(!access||access.revoked_at)throw fail(403,'Your personal portal is not available.');
 const profiles=await ClientGuardian.listClientsForGuardian({guardianUserId:userId});
 const profile=profiles.find(p=>Number(p.client_id)===Number(access.client_id)&&p.relationship_type==='self'&&p.permissions_json?.dependentSelfAccess&&!ClientGuardian.isNoView(p.permissions_json));
 if(!profile)throw fail(403,'Your personal portal is not available.');
 return profile;
}
export async function personalContext(userId,input){
 const profile=await personalProfile(userId);
 const agencyId=Number(input.agencyId),serviceId=Number(input.serviceId);
 if(!Number.isSafeInteger(agencyId)||agencyId<1||!Number.isSafeInteger(serviceId)||serviceId<1)throw fail(400,'Choose one of your services.');
 const selected=await guardianServiceContext({userId,clientId:profile.client_id,agencyId,serviceId});
 return {userId,clientId:Number(profile.client_id),agencyId,serviceId,selected};
}
export async function personalOverview(userId){
 const profile=await personalProfile(userId),agencies=await guardianCareContexts(profile,userId);
 return {clientId:profile.client_id,name:profile.full_name||profile.initials,schoolName:profile.organization_type==='school'?profile.organization_name:null,
  agencies:agencies.map(a=>({id:a.agency_id,name:a.agency_name,slug:a.agency_slug,logo:a.agency_logo_url,services:a.services.map(s=>({id:s.id,label:s.label,kind:s.service_kind,providerName:s.provider_name}))}))};
}
export async function personalAppointments(userId,input){
 const context=await personalContext(userId,input);
 return (await listGuardianAppointments(context)).map(a=>({id:a.id,startAt:a.startAt,endAt:a.endAt,timeZone:a.timeZone||'America/Denver',providerName:a.providerName,status:a.status,modality:a.modality,joinUrl:a.joinUrl||null}));
}
export async function personalPlan(userId,input){
 const context=await personalContext(userId,input);
 try{
  const data=await guardianPlanProgress(context);
  // A personal portal never returns family ratings, signer identities or history.
  return {hasActivePlan:data.hasActivePlan,plan:data.plan?{title:data.plan.title,prescribedFrequency:data.plan.prescribedFrequency}:null,
   goals:(data.goals||[]).map(g=>({id:g.id,goalText:g.goalText,objectives:(g.objectives||[]).map(o=>({id:o.id,objectiveText:o.objectiveText,scaleCurrent:o.scaleCurrent,scaleTarget:o.scaleTarget}))}))};
 }catch(e){if(e.status===403)return {sharingPending:true,hasActivePlan:false,goals:[]};throw e;}
}
export async function personalDocuments(userId,input){
 const context=await personalContext(userId,input);
 try{return {files:await listSharedFiles(userId,context.clientId,context)};}catch(e){if(e.status===403)return {files:[],sharingPending:true};throw e;}
}
