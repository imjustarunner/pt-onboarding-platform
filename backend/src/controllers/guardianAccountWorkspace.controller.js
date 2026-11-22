import User from '../models/User.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import {guardianFinancialWorkspace} from '../services/guardianFinancialWorkspace.service.js';
import {requireClientAccountSupport} from '../services/clientAccountSupportAccess.service.js';
import {getClientPreferences,putClientPreferences} from '../services/sessionNotification.service.js';
import {logAuditEvent} from '../services/auditEvent.service.js';
import {createAgencyScheduledAnnouncement} from './agencyAnnouncements.controller.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const id=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<1)throw fail('Invalid account or client.');return n;};
export const financialWorkspace=async(req,res,next)=>{try{const data=await guardianFinancialWorkspace({actor:req.user,guardianId:id(req.params.id)});await logAuditEvent(req,{actionType:'guardian_financial_workspace_viewed',metadata:{guardianUserId:id(req.params.id),clientIds:data.clients.map(c=>c.clientId)}});res.set('Cache-Control','no-store').json(data);}catch(e){next(e);}};
async function preferenceContext(req){
 const guardianId=id(req.params.id),clientId=id(req.params.clientId);
 const client=await requireClientAccountSupport(req.user,clientId);
 const link=await ClientGuardian.getLink({clientId,guardianUserId:guardianId});
 if(!link || link.permissions_json?.relationshipRevoked)throw fail('Select a current relationship for communication preferences.',409);
 return {guardianId,clientId,agencyId:Number(client.agency_id)};
}
export const getSessionPreferences=async(req,res,next)=>{try{const c=await preferenceContext(req);res.set('Cache-Control','no-store').json(await getClientPreferences(c.agencyId,c.clientId,c.guardianId));}catch(e){next(e);}};
export const saveSessionPreferences=async(req,res,next)=>{try{
 const c=await preferenceContext(req),previous=await getClientPreferences(c.agencyId,c.clientId,c.guardianId);
 const fields=['optionalRemindersEnabled','confirmationRequestsEnabled','providerPushedUpdatesEnabled','schedulingChangesEnabled'];
 const clean={...previous};
 for(const key of fields)if(Object.hasOwn(req.body||{},key)){if(typeof req.body[key]!=='boolean')throw fail('Choose valid notification options.');clean[key]=req.body[key];}
 if(req.body?.channels){if(['email','sms'].some(key=>typeof req.body.channels[key]!=='boolean'))throw fail('Choose valid delivery channels.');clean.channels={in_app:true,email:req.body.channels.email,sms:req.body.channels.sms,phone:false};}
 // Delivery choices never grant SMS consent or overwrite carrier opt-outs.
 const saved=await putClientPreferences(c.agencyId,c.clientId,clean,c.guardianId);
 await logAuditEvent(req,{actionType:'guardian_notification_preferences_updated',agencyId:c.agencyId,metadata:{clientId:c.clientId,guardianUserId:c.guardianId}});
 res.json(saved);
}catch(e){next(e);}};
export const postProfileAnnouncement=async(req,res,next)=>{try{
 const guardianId=id(req.params.id),agencyId=id(req.body?.agencyId);
 const guardian=await User.findById(guardianId);
 if(!['client_guardian','guardian'].includes(guardian?.role))throw fail('Guardian account not found.',404);
 const agencies=await User.getAgencies(guardianId);
 if(!agencies.some(a=>Number(a.id)===agencyId))throw fail('This guardian is not linked to the selected organization.',403);
 // Preserve the real authenticated staff actor and force the recipient on the server.
 const scoped=Object.assign(Object.create(req),{params:{...req.params,id:String(agencyId)},body:{...req.body,recipientUserIds:[guardianId],recipient_user_ids:[guardianId],audience:'specific_users'}});
 return createAgencyScheduledAnnouncement(scoped,res,next);
}catch(e){next(e);}};
