import pool from '../config/database.js';
import {dependentError as fail,dependentAccess} from './dependentPortalPolicy.service.js';

export async function assertDependentThreadAccess(userId,threadId){
 const [[t]]=await pool.execute('SELECT * FROM dependent_portal_threads WHERE thread_id=?',[threadId]);
 if(!t)return null;
 const {requireClinicalScope}=await import('./guardianClinicalAccess.service.js');
 const access=await dependentAccess(t.user_id);
 if(!access||access.revoked_at||Number(access.client_id)!==Number(t.client_id))throw fail(403,'This personal conversation is no longer active.');
 const {personalContext}=await import('./dependentPortal.service.js');
 const context=await personalContext(t.user_id,{agencyId:t.agency_id,serviceId:t.service_id});
 if(context.selected.permissions_json?.canMessage===false)throw fail(403,'Messaging is not enabled for this personal login.');
 const provider=Number(context.selected.service?.provider_user_id);
 if(![Number(t.user_id),provider].includes(Number(userId)))throw fail(403,'This conversation belongs to the client and their assigned provider.');
 const [[active]]=await pool.execute(`SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1 WHERE u.id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.status IN ('ACTIVE_EMPLOYEE','EHR_ONLY')`,[t.agency_id,provider]);
 if(!active)throw fail(403,'The assigned provider is no longer available.');
 if(context.selected.service.service_kind==='counseling')await requireClinicalScope({userId:t.user_id,clientId:t.client_id,agencyId:t.agency_id,scope:'clinical_messages'});
 // A service reassignment must also change notification recipients before a
 // reply is sent from an already-open browser tab.
 await pool.execute('DELETE FROM chat_thread_participants WHERE thread_id=? AND user_id NOT IN (?,?)',[threadId,t.user_id,provider]);
 const [[member]]=await pool.execute('SELECT user_id FROM chat_thread_participants WHERE thread_id=? AND user_id=?',[threadId,userId]);
 if(!member)throw fail(403,'This earlier personal conversation belongs only to its recorded participants.');
 return t;
}
export async function personalConversation(userId,input){
 const {personalContext}=await import('./dependentPortal.service.js');
 const context=await personalContext(userId,input),service=context.selected.service;
 if(!service?.provider_user_id)throw fail(409,'Your team will assign a provider before messaging is available.');
 const {familySharedConversations}=await import('./familySharedConversations.service.js');
 const shared=await familySharedConversations.open({userId,clientId:context.clientId,agencyId:context.agencyId,serviceId:context.serviceId,providerUserId:service.provider_user_id});
 return {...shared,providerName:service.provider_name,audience:'Secure messages are shared with all currently authorized family portal users for this client and the assigned provider. Review the recipient list before sending.'};

}
