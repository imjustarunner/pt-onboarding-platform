import pool from '../config/database.js';
import {ASSISTANT_OWNER_EMAIL,assistantRef,parseAssistantJson} from './assistantTeamPolicy.js';

export async function recordAssistantChange(db,{accountId,agencyId,actorUserId,eventType,changes={},reason}){
 // Credential values and clinical bodies never belong in account-change notices.
 const safe={};for(const k of ['status','capabilities','schedule','baaStatus','privacyPolicyRevision','groupStatus','email','subrole','policyRevision','credentialChanged','verification','drift'])if(changes[k]!==undefined)safe[k]=changes[k];
 const key=assistantRef();await db.execute('INSERT INTO assistant_change_events(event_key,account_id,agency_id,actor_user_id,event_type,changes_json,reason) VALUES (?,?,?,?,?,?,?)',[key,accountId,agencyId,actorUserId||null,eventType,JSON.stringify(safe),String(reason||'Assistant account configuration updated').slice(0,1000)]);return key;
}
export async function processAssistantAccountAlerts({db=pool,limit=20,send,notify}={}){
 const conn=await db.getConnection();let locked=false;
 try{
  const [[l]]=await conn.query("SELECT GET_LOCK('assistant_account_alerts',0) acquired");locked=Number(l.acquired)===1;if(!locked)return {sent:0};
  const [[owner]]=await conn.execute("SELECT id,email,role FROM users WHERE LOWER(email)=? AND role='super_admin' AND is_active=1",[ASSISTANT_OWNER_EMAIL]);if(!owner)throw new Error('ASSISTANT_OWNER_NOT_AVAILABLE');
  const [events]=await conn.execute("SELECT e.*,u.email,a.name agency_name FROM assistant_change_events e JOIN assistant_accounts aa ON aa.id=e.account_id JOIN users u ON u.id=aa.user_id JOIN agencies a ON a.id=e.agency_id WHERE e.email_status='pending' AND e.next_attempt_at<=UTC_TIMESTAMP(3) ORDER BY e.id LIMIT "+Math.max(1,Math.min(100,Math.trunc(Number(limit)||20))));let sent=0;
  for(const e of events){
   try{
    const message=`Assistant account change: ${e.event_type}. Agency: ${e.agency_name}. Account: ${e.email}. Reason: ${e.reason}. Review Assistant Teams for details. No password or clinical data is included.`;
    if(!e.notification_at){
     if(notify)await notify({owner,e,message});else {const {default:Notification}=await import('../models/Notification.model.js');await Notification.create({type:'assistant_account_changed',severity:'warning',title:'Assistant account changed',message,userId:owner.id,agencyId:e.agency_id,relatedEntityType:'assistant_change',relatedEntityId:e.id,actorUserId:e.actor_user_id,actorSource:'system'});}
     await conn.execute('UPDATE assistant_change_events SET notification_at=UTC_TIMESTAMP(3) WHERE id=?',[e.id]);
    }
    let result;
    if(send)result=await send({owner,e,message});else {
     const {resolveSecurityMailbox}=await import('./securityMailbox.service.js');const {sendEmailFromIdentity}=await import('./unifiedEmail/unifiedEmailSender.service.js');const {identity}=await resolveSecurityMailbox(e.agency_id);
     result=await sendEmailFromIdentity({senderIdentityId:identity.id,to:ASSISTANT_OWNER_EMAIL,subject:`${e.agency_name}: assistant account change`,text:message,html:`<p>${escapeHtml(message)}</p>`,source:'manual',templateType:'assistant_account_change',internetMessageIdOverride:`<assistant-change-${e.event_key}@plottwistco.com>`});
    }
    if(!result?.id||result.queued||result.pendingApproval||result.skipped||result.blocked)throw new Error('ASSISTANT_ALERT_NOT_SENT');
    await conn.execute("UPDATE assistant_change_events SET email_status='sent',sent_at=UTC_TIMESTAMP(3),attempts=attempts+1,last_error=NULL WHERE id=?",[e.id]);sent++;
   }catch(error){await conn.execute('UPDATE assistant_change_events SET attempts=attempts+1,last_error=?,next_attempt_at=DATE_ADD(UTC_TIMESTAMP(3),INTERVAL 5 MINUTE) WHERE id=?',[String(error.code||'DELIVERY_UNCONFIRMED').slice(0,120),e.id]);}
  }return {sent};
 }finally{if(locked)await conn.query("SELECT RELEASE_LOCK('assistant_account_alerts')");conn.release();}
}
const escapeHtml=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
