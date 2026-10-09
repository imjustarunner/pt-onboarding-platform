import pool from '../config/database.js';
import User from '../models/User.model.js';
import Agency from '../models/Agency.model.js';
import {passwordRecoverySsoState} from './passwordRecoveryPolicy.service.js';
import {buildPublicAppUrl} from '../utils/publicPortalUrl.js';
import {sendEmailFromIdentity} from './unifiedEmail/unifiedEmailSender.service.js';
import {resolveProviderUpdateSender} from './providerUpdateEmailSender.service.js';

const norm=value=>String(value||'').trim().toLowerCase();
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function personalNoticeRecipient(user,agencies,workEmail=user?.email||user?.work_email) {
 if(!user||Number(user.is_demo)||Number(user.is_archived)||Number(user.is_active)===0||String(user.status).toUpperCase()!=='ACTIVE_EMPLOYEE')return null;
 if(passwordRecoverySsoState(user,agencies).ssoRequired)return null;
 const personal=norm(user.personal_email),work=norm(workEmail);
 return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(personal)&&personal!==work?personal:null;
}
export function buildPersonalUpdateNotice(agency) {
 const link=buildPublicAppUrl(agency,'login');
 const message='You have been sent your Provider Update at your work email. Please log in to the app to complete it. Some guide videos will be uploaded this weekend—please look out for those. If you notice any issues, please do not hesitate to reply to People Operations or use Need help in your update.';
 return {subject:'Your Provider Update is waiting — please log in',text:`${message}\n\nSign in: ${link}`,
 html:`<div style="font:16px/1.6 Arial;color:#243f4d;max-width:600px;padding:28px"><h1 style="font-size:24px">Your Provider Update is waiting</h1><p>${message}</p><p><a href="${escape(link)}" style="display:inline-block;padding:12px 20px;background:#234f6b;color:white;text-decoration:none;border-radius:8px">Sign in to complete your update →</a></p><p>${escape(agency?.name||'People Operations')}</p></div>`};
}
// Only explicitly sent invitations enter this queue; deploying cannot notify old recipients.
export async function queuePersonalUpdateNotice({workSendId,agencyId,userId,workEmail}) {
 const user=await User.findById(userId),agencies=await User.getAgencies(userId);
 if(!agencies.some(a=>Number(a.id)===Number(agencyId))||!personalNoticeRecipient(user,agencies,workEmail))return {status:'not_applicable'};
 await pool.execute('INSERT IGNORE INTO provider_update_personal_notices (work_send_id,agency_id,user_id) VALUES (?,?,?)',[workSendId,agencyId,userId]);
 return {status:'queued'};
}
export async function processPersonalUpdateNotices() {
 // A queued/failed work invitation must never trigger "you have been sent".
 const [rows]=await pool.execute(`SELECT n.*,s.to_email AS work_email FROM provider_update_personal_notices n
 JOIN provider_update_sends s ON s.id=n.work_send_id AND s.provider_user_id=n.user_id
 JOIN provider_update_pushes p ON p.id=s.push_id AND p.agency_id=n.agency_id AND p.status='sent'
 LEFT JOIN user_communications c ON c.id=s.communication_id AND c.user_id=n.user_id AND c.agency_id=n.agency_id
 WHERE n.status='queued' AND
 (CASE WHEN c.delivery_status IN ('sent','delivered','failed','bounced') THEN c.delivery_status ELSE s.delivery_status END) IN ('sent','delivered') ORDER BY n.id LIMIT 100`);
 for(const row of rows){
  const [claimed]=await pool.execute("UPDATE provider_update_personal_notices SET status='sending' WHERE id=? AND status='queued'",[row.id]);
  if(!claimed.affectedRows)continue;
  let status='failed',error=null,communicationId=null;
  try{
   const user=await User.findById(row.user_id),agencies=await User.getAgencies(row.user_id);
   const to=agencies.some(a=>Number(a.id)===Number(row.agency_id))?personalNoticeRecipient(user,agencies,row.work_email):null;
   if(!to){status='skipped';error='No eligible non-SSO personal email.';}
   else {
    const agency=await Agency.findById(row.agency_id);
    const sender=await resolveProviderUpdateSender(row.agency_id);
    if(!sender?.identity?.id)throw Error('No People Operations sender configured.');
    const result=await sendEmailFromIdentity({senderIdentityId:sender.identity.id,to,...buildPersonalUpdateNotice(agency),source:'auto',agencyId:row.agency_id,userId:row.user_id,templateType:'provider_update_personal_notice',replyToOverride:sender.replyTo});
    status=result?.queued?'pending':result?.skipped||result?.blocked?'failed':'sent';communicationId=result?.communicationId||null;error=result?.reason||null;
   }
  }catch(e){error=String(e.message||e).slice(0,500);}
  await pool.execute('UPDATE provider_update_personal_notices SET status=?,communication_id=?,error_message=? WHERE id=?',[status,communicationId,error,row.id]);
 }
}
