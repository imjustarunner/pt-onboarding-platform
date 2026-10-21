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
 for(const id of [t.user_id,provider])await pool.execute('INSERT IGNORE INTO chat_thread_participants(thread_id,user_id) VALUES(?,?)',[threadId,id]);
 return t;
}
export async function personalConversation(userId,input){
 const {personalContext}=await import('./dependentPortal.service.js');
 const context=await personalContext(userId,input),service=context.selected.service;
 if(!service?.provider_user_id)throw fail(409,'Your team will assign a provider before messaging is available.');
 const db=await pool.getConnection();let threadId;
 try{
  await db.beginTransaction();await db.execute('SELECT user_id FROM dependent_portal_access WHERE user_id=? FOR UPDATE',[userId]);
  const [[old]]=await db.execute('SELECT thread_id FROM dependent_portal_threads WHERE user_id=? AND agency_id=? AND service_id=?',[userId,context.agencyId,context.serviceId]);threadId=old?.thread_id;
  if(!threadId){
   // Separate history: never reuse the family conversation or add a parent.
   const [thread]=await db.execute("INSERT INTO chat_threads(agency_id,thread_type,message_channel,name) VALUES(?,'client_secure','secure',?)",[context.agencyId,'Personal portal conversation']);threadId=thread.insertId;
   await db.execute('INSERT INTO dependent_portal_threads(thread_id,user_id,client_id,agency_id,service_id) VALUES(?,?,?,?,?)',[threadId,userId,context.clientId,context.agencyId,context.serviceId]);
  }
  await db.execute('DELETE FROM chat_thread_participants WHERE thread_id=? AND user_id NOT IN (?,?)',[threadId,userId,service.provider_user_id]);
  for(const id of [userId,service.provider_user_id])await db.execute('INSERT IGNORE INTO chat_thread_participants(thread_id,user_id) VALUES(?,?)',[threadId,id]);
  await db.commit();
 }catch(e){await db.rollback();throw e;}finally{db.release();}
 await assertDependentThreadAccess(userId,threadId);
 return {threadId,clientId:context.clientId,providerName:service.provider_name,audience:`This conversation is between you and ${service.provider_name}. It is separate from your guardian’s conversations.`};
}
