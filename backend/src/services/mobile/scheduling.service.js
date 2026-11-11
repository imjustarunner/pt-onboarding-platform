import pool from '../../config/database.js';
import {mobileScheduleActions} from './scheduleContext.service.js';
import {mobileSessions} from './session.service.js';
import {listMobileAgencies} from './agencyScope.service.js';
import {readAgencyAccess} from '../agencyAccessProfiles.service.js';
import {applyAgencyAccess} from '../../utils/agencyAccessPolicy.js';
import {runWithAgencyAccess} from '../../utils/agencyAccessContext.js';
import {maskMobileClientName} from '../narrivaAccess.service.js';
import {utcMysqlToIso} from '../../utils/zonedWallTime.util.js';
import Appointment from '../../models/Appointment.model.js';
import AgencyServiceLocation from '../../models/AgencyServiceLocation.model.js';
const failure=(status,message)=>Object.assign(new Error(message),{status});
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0?Number(value):0;
function invoke(handler,request,overrides={}){const req=Object.assign(Object.create(request),overrides);return new Promise((resolve,reject)=>{let code=200;const res={set(){return this;},status(status){code=status;return this;},json(body){resolve({status:code,body});return this;}};Promise.resolve(handler(req,res,reject)).catch(reject);});}
function safeAppointment(a){if(!a)return null;const fields=['id','agencyId','providerUserId','tenantServiceId','serviceCode','serviceLocationId','modality','status','sourceTimezone','officeEventId','clinicalSessionId','videoRoomMode','notificationMode','othersPresentNames'];const value=Object.fromEntries(fields.filter(k=>a[k]!==undefined).map(k=>[k,a[k]]));return {...value,startAt:utcMysqlToIso(a.startAt),endAt:utcMysqlToIso(a.endAt),participants:(a.participants || []).map(p=>({role:p.role,clientId:p.clientId || p.client_id || null,isBillingResponsible:!!p.isBillingResponsible,receivesReminders:p.receivesReminders!==false})),notes:a.notes || ''};}
/** Explicit operations only. Reuse main appointment rules, never a general API proxy. */
export function createMobileScheduling({db=pool,access=(...args)=>mobileSessions.access(...args),agencies=listMobileAgencies,agencyAccess=readAgencyAccess,applyAccess=applyAgencyAccess,scope=runWithAgencyAccess,findAppointment=id=>Appointment.findById(id),locations=id=>AgencyServiceLocation.listByAgency(id),handlers=null}={}){
 const loadHandlers=async()=>handlers || {...await import('../../controllers/appointment.controller.js'),...await import('../../controllers/tenantServices.controller.js'),...await import('../../controllers/user.controller.js')};
 async function context(req,agencyId){const qv=req.quickView;if(!qv?.mobileDeviceSessionId)throw failure(403,'Sign into Auricwell with your account to manage your schedule.');const ctx=await access(qv.mobileDeviceSessionId,qv.userId,qv.agencyId,qv.credentialVersion??null);if(ctx.surface==='family')throw failure(403,'Use appointment requests in the family portal.');const {agencies:available}=await agencies(ctx.user);if(!available.some(a=>Number(a.id)===agencyId))throw failure(403,'This agency is not available.');if(qv.qaAgencyIds&&!qv.qaAgencyIds.map(Number).includes(agencyId))throw failure(403,'This QA account can use only its synthetic workspace.');const profile=await agencyAccess(ctx.user.id,agencyId);if(!profile&&ctx.user.role!=='super_admin')throw failure(403,'Your scheduling access could not be verified.');const user=applyAccess(ctx.user,profile);return {user,available,profile};}
 async function roster(req,handler,agencyId,userId){const result=await invoke(handler,req,{params:{id:String(userId)},query:{agencyId:String(agencyId),includeGuardians:'false'}});if(result.status>=400)throw failure(result.status,result.body?.error?.message || 'Your clients are unavailable.');const offered=result.body.clients || [];if(!offered.length)return [];const ids=offered.map(c=>positive(c.id)).filter(Boolean);if(!ids.length)return [];const [rows]=await db.execute(`SELECT id,full_name,initials FROM clients WHERE (agency_id=? OR EXISTS(SELECT 1 FROM client_agency_assignments ca WHERE ca.client_id=clients.id AND ca.agency_id=? AND ca.is_active=1)) AND id IN (${ids.map(()=>'?').join(',')})`,[agencyId,agencyId,...ids]);return rows.map(c=>({id:Number(c.id),maskedName:maskMobileClientName(c)}));}
 return async function schedule(req,res,next){try{
  const main=await loadHandlers(),operation=req.mobileScheduleOperation;
  let existing=null,agencyId=positive(req.body?.agencyId || req.query?.agencyId || req.quickView?.agencyId);
  if(req.params?.appointmentId){existing=await findAppointment(positive(req.params.appointmentId));if(!existing)throw failure(404,'Appointment not found.');agencyId=Number(existing.agencyId);if(req.body?.agencyId!==undefined&&Number(req.body.agencyId)!==agencyId)throw failure(403,'An appointment cannot be moved to another agency here.');}
  const ctx=await context(req,agencyId);req.user=ctx.user;
  if(existing&&Number(existing.providerUserId)!==Number(ctx.user.id))throw failure(403,'Open your own appointment here. Use the full schedule for permitted team scheduling.');
  return await scope(agencyId,async()=>{
   if(operation==='actions')return res.json({agencyId,agencies:ctx.available.map(a=>({id:Number(a.id),name:a.name})),actions:mobileScheduleActions(ctx.user)});
   if(operation==='options'){
    const [services,clients,places]=await Promise.all([invoke(main.getBookingOptions,req,{params:{agencyId:String(agencyId)},query:{providerId:String(ctx.user.id)}}),roster(req,main.listUserVirtualSessionClients,agencyId,ctx.user.id),locations(agencyId)]);
    if(services.status>=400)return res.status(services.status).json(services.body);
    return res.json({agencyId,agencies:ctx.available.map(a=>({id:Number(a.id),name:a.name})),services:(services.body.services || []).map(s=>({id:s.id,name:s.name,serviceCode:s.serviceCode,defaultDurationMinutes:s.defaultDurationMinutes,modality:s.modality,allowsIndividual:s.allowsIndividual,allowsGroup:s.allowsGroup})),clients,locations:places.map(p=>({id:Number(p.id),name:p.name,placeOfService:p.place_of_service,schoolOrganizationId:p.school_organization_id || null}))});
   }
   const allowed=['startAt','endAt','timeZone','tenantServiceId','serviceCode','serviceLocationId','modality','notes','othersPresentNames','videoRoomMode','notificationMode','recurrence','occurrenceCount','acknowledgeSameDayServices'];
   const body=Object.fromEntries(allowed.filter(k=>req.body?.[k]!==undefined).map(k=>[k,req.body[k]]));
   if(req.body?.providerUserId && Number(req.body.providerUserId)!==Number(ctx.user.id))throw failure(403,'Use your own schedule here.');
   if(req.body?.participants!==undefined){const clients=await roster(req,main.listUserVirtualSessionClients,agencyId,ctx.user.id),ids=new Set(clients.map(c=>c.id));if(!Array.isArray(req.body.participants)||req.body.participants.some(p=>!p||p.role!=='client'||!ids.has(positive(p.clientId))))throw failure(403,'Choose an authorized client from your schedule.');body.participants=req.body.participants.map((p,i)=>({role:'client',clientId:Number(p.clientId),isBillingResponsible:i===0,receivesReminders:p.receivesReminders!==false}));}
   let handler;
   if(operation==='create'){Object.assign(body,{agencyId,providerUserId:ctx.user.id,source:'staff_grid',createProviderScheduleEvent:true});handler=main.createAppointmentHandler;}
   else if(operation==='update'){handler=main.updateAppointmentHandler;}
   else if(operation==='cancel'){handler=main.cancelAppointmentHandler;Object.assign(body,{status:'canceled_by_provider',reason:String(req.body?.reason || '').trim(),followUpAction:'keep_next'});if(!body.reason)throw failure(400,'Enter the reason for cancellation.');}
   else if(operation==='detail'){handler=main.getAppointment;}
   else throw failure(404,'This scheduling action is unavailable.');
   const response=await invoke(handler,req,{params:{id:String(existing?.id || '')},body,query:{agencyId:String(agencyId)}});
   if(response.status>=400)return res.status(response.status).json(response.body);
   return res.status(response.status).json({...response.body,appointment:safeAppointment(response.body.appointment),...(response.body.appointments?{appointments:response.body.appointments.map(safeAppointment)}:{})});
  },{userId:ctx.user.id,access:ctx.profile});
 }catch(error){if(error.status)return res.status(error.status).json({error:{message:error.message,...(error.code?{code:error.code}:{})}});next(error);}};
}
export const mobileScheduling=createMobileScheduling();
