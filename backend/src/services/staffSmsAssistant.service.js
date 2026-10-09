import {createHash,randomUUID} from 'node:crypto';
import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import VonageService from './vonage.service.js';
import {getSmsSender,isSmsSuppressed,staffAssistantReplyCapability} from './smsCompliance.service.js';
import {validateSmsRegistration} from '../utils/smsCompliancePolicy.js';
import {normalizeSmsPhone} from '../utils/smsThreadIdentity.js';
import {ITSCO_STAFF_ASSISTANT_NUMBER,parseStaffSmsRequest} from '../utils/staffSmsAssistant.js';
import {isStaffCommunicationRole,staffCommunicationKey,phoneFingerprint} from '../utils/staffCommunicationChoices.js';
import {isCommunicationStaffActive} from '../utils/communicationReceptionPolicy.js';
import {encryptChatText,decryptChatText} from './chatEncryption.service.js';
import {appendSecurityEvidence} from './securityEvidence.service.js';
import {buildPublicPortalBaseUrl} from '../utils/publicPortalUrl.js';
const json=v=>typeof v==='string'?JSON.parse(v):(v||{});
const deps={db:pool,sender:getSmsSender,suppressed:isSmsSuppressed,agency:id=>Agency.findById(id),send:options=>VonageService.sendSms(options),encrypt:encryptChatText,decrypt:decryptChatText,evidence:appendSecurityEvidence,capability:staffAssistantReplyCapability};
export async function handleStaffSmsAssistant({from,to,body,messageId},d=deps){
 if(normalizeSmsPhone(to)!==ITSCO_STAFF_ASSISTANT_NUMBER)return false;
 const request=parseStaffSmsRequest(body);if(!request)return false;
 // No identifiable information is returned based on a telephone number alone.
 if(!messageId)return true;
 const sender=await d.sender(to);
 if(validateSmsRegistration(sender.registration).length||!sender.registration.purposes.includes('workforce')||await d.suppressed(sender,from))return true;
 const phone=normalizeSmsPhone(from);if(!phone)return true;
 const digits=phone.slice(1),local=digits.length===11&&digits[0]==='1'?digits.slice(1):digits;
 const [staff]=await d.db.execute(`SELECT DISTINCT u.id,u.role,u.is_active,u.is_archived,u.status,u.terminated_at,p.notification_categories
   FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
   LEFT JOIN user_preferences p ON p.user_id=u.id
   WHERE REGEXP_REPLACE(COALESCE(u.personal_phone,''),'[^0-9]','') IN (?,?)
     OR REGEXP_REPLACE(COALESCE(u.work_phone,''),'[^0-9]','') IN (?,?)
     OR REGEXP_REPLACE(COALESCE(u.phone_number,''),'[^0-9]','') IN (?,?)`,[sender.agency_id,digits,local,digits,local,digits,local]);
 const active=staff.filter(u=>isStaffCommunicationRole(u.role)&&isCommunicationStaffActive(u));
 if(active.length!==1)return true;
 const user=active[0],state=json(user.notification_categories)[staffCommunicationKey(sender.agency_id)];
 const agency=await d.agency(sender.agency_id);if(!agency)return true;
 const base=new URL(buildPublicPortalBaseUrl(agency)).origin;
 const enabled=state?.accessRequests?.staffSmsAssistant===true&&state.phoneHash===phoneFingerprint(phone);
 const requestKey=createHash('sha256').update(`${sender.id}:${messageId}`).digest('hex');
 const db=await d.db.getConnection();let locked=false;
 try{
   const [locks]=await db.execute('SELECT GET_LOCK(?, 2) AS acquired',[`staff-sms-${sender.id}-${user.id}`]);locked=Number(locks[0]?.acquired)===1;if(!locked)return true;
   const [prior]=await db.execute(`SELECT event_id FROM security_evidence WHERE action='staff_sms_assistant_requested' AND JSON_UNQUOTE(JSON_EXTRACT(details,'$.requestKey'))=? LIMIT 1`,[requestKey]);
   if(prior.length)return true;
   const [recent]=await db.execute(`SELECT event_id FROM security_evidence WHERE user_id=? AND action='staff_sms_assistant_requested' AND occurred_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE) LIMIT 6`,[user.id]);
   if(recent.length>=5)return true;
   const requestId=randomUUID(),envelope=enabled&&request.kind==='request'?d.encrypt(JSON.stringify({prompt:request.text})):null;
   const evidenceId=await d.evidence({requestId,phase:'completed',userId:user.id,method:'POST',route:'/vonage/sms',clientIp:null,ipSource:'not_collected',peerIp:null,action:'staff_sms_assistant_requested',outcome:'success',statusCode:200,details:{requestKey,agencyId:sender.agency_id,kind:request.kind,enabled,envelope}},db,{mirror:false});
   const reply=enabled&&request.kind==='request'
     ?`Your request is ready to review securely: ${base}/staff-text-assistant/${evidenceId} Sign in to view account details and confirm any changes. Nothing has been sent or scheduled. Reply STOP to opt out.`
     :`Text MENU for help. Account questions, tasks, messages and scheduling requests open securely in the app. Enable Staff text-assistant requests in Provider Update or My Account preferences, using your saved mobile number. ${base}/login Texting asks for one reply, not recurring enrollment. Msg & data rates may apply. Reply STOP to opt out or HELP for help.`;
   const capability=d.capability({from:to,to:from,body:reply,messageId});
   try{await d.send({purpose:'workforce',agencyId:sender.agency_id,from:to,to:from,body:reply,staffAssistantReply:capability});}
   catch(e){console.warn('[staffSmsAssistant] Reply not delivered:',e.code||'delivery_failed');}
   return true;
 }finally{try{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[`staff-sms-${sender.id}-${user.id}`]);}finally{db.release();}}
}
export async function getStaffSmsRequest(user,id){
 if(!/^[0-9a-f-]{36}$/i.test(String(id))||!user?.id)throw Object.assign(new Error('Request not found.'),{status:404});
 const [rows]=await pool.execute(`SELECT details,occurred_at FROM security_evidence WHERE event_id=? AND user_id=? AND action='staff_sms_assistant_requested' AND occurred_at>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 7 DAY) LIMIT 1`,[id,user.id]);
 const details=rows[0]?json(rows[0].details):null;
 if(!details?.enabled||!details.envelope)throw Object.assign(new Error('Request not found or expired.'),{status:404});
 const account=await User.findById(user.id),agencies=await User.getAgencies(user.id);
 if(!isCommunicationStaffActive(account)||!isStaffCommunicationRole(account?.role)||!agencies.some(a=>Number(a.id)===Number(details.agencyId)))throw Object.assign(new Error('Request not found.'),{status:404});
 return {id,agencyId:details.agencyId,createdAt:rows[0].occurred_at,...JSON.parse(decryptChatText(details.envelope))};
}
