import crypto from 'crypto';
import pool from '../config/database.js';
import {sanitizeSectionTraining} from './providerUpdateTraining.service.js';
import {getSectionMeta} from '../constants/providerUpdateSections.js';
import {sendEmailFromIdentity} from './unifiedEmail/unifiedEmailSender.service.js';
import {resolveSenderIdentityForSend} from './emailSenderIdentityResolver.service.js';
import {recipientSeesSection} from './providerUpdate.service.js';

const parse = value => typeof value === 'string' ? JSON.parse(value) : value || {};
const escape = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function trainingRevision(guides) {
 // MySQL JSON can reorder object keys; hash an explicit canonical shape.
 return crypto.createHash('sha256').update(JSON.stringify(guides.map(g=>({id:g.id,title:g.title,html:g.html})))).digest('hex');
}
export function changedTrainingGuides(previous, next) {
 return next.filter(g=>!previous.some(p=>p.id===g.id&&p.html===g.html&&p.title===g.title));
}
export function trainingNoticeEmail({firstName,section,guideTitles,link}) {
 const subject='New instructions added to your Provider Update';
 const message=`Instructions have been added to the ${section.title} section of your Provider Update.`;
 const detail=section.description||'';
 const footer='You can view these instructions even if you have already completed your update. Your completed sections stay complete. Sign in to view the video or photos.';
 return {subject,text:`Hello ${firstName},\n\n${message}\n${detail}\n\n${guideTitles.join('\n')}\n\nWatch / view instructions: ${link}\n\n${footer}`,
 html:`<div style="background:#f1f5f7;padding:28px;font:16px/1.6 Arial;color:#203c48"><div style="max-width:620px;margin:auto;background:white;border-radius:18px;overflow:hidden"><div style="background:#214f60;color:white;padding:26px 32px"><p style="margin:0">PROVIDER UPDATE · NEW INSTRUCTIONS</p><h1 style="font-size:26px;margin:10px 0 0">${escape(section.title)}</h1></div><div style="padding:28px 32px"><p>Hello ${escape(firstName)},</p><p>${escape(message)}</p><p>${escape(detail)}</p><ul>${guideTitles.map(t=>`<li>${escape(t)}</li>`).join('')}</ul><p style="margin:28px 0"><a href="${escape(link)}" style="background:#214f60;color:white;text-decoration:none;padding:14px 22px;border-radius:9px;display:inline-block">Watch / view instructions →</a></p><p>${escape(footer)}</p></div></div></div>`};
}

export async function saveTrainingAndNotify({pushId,agencyId,sectionKey,guides,notify=true}) {
 const section=getSectionMeta(sectionKey);
 if(!section)throw Object.assign(Error('Unknown section.'),{status:400});
 if(!Array.isArray(guides))throw Object.assign(Error('Guides must be a list.'),{status:400});
 const next=sanitizeSectionTraining({[sectionKey]:guides},agencyId,[sectionKey])[sectionKey]||[];
 const db=await pool.getConnection();
 let saved;
 try {
  await db.beginTransaction();
  const [[push]]=await db.execute('SELECT * FROM provider_update_pushes WHERE id=? AND agency_id=? FOR UPDATE',[pushId,agencyId]);
  if(!push||String(push.title).startsWith('[PREVIEW]'))throw Object.assign(Error('Update not found.'),{status:404});
  const config=parse(push.section_config_json), audience=parse(push.section_audience_json);
  const changed=changedTrainingGuides(config._training?.[sectionKey]||[],next);
  config._training={...config._training,[sectionKey]:next};
  await db.execute('UPDATE provider_update_pushes SET section_config_json=? WHERE id=? AND agency_id=?',[JSON.stringify(config),pushId,agencyId]);
  if(notify&&changed.length&&config[sectionKey]&&push.status!=='draft') {
   const revision=trainingRevision(next);
   const [recipients]=await db.execute(`SELECT r.* FROM provider_update_recipients r JOIN users u ON u.id=r.provider_user_id
    WHERE r.push_id=? AND r.agency_id=? AND LEFT(r.token,8)<>'preview_'
    AND COALESCE(r.is_demo_snapshot,0)=0 AND COALESCE(u.is_demo,0)=0 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(u.status)='ACTIVE_EMPLOYEE'
    AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=r.agency_id AND COALESCE(ua.is_active,1)=1)
    AND EXISTS(SELECT 1 FROM provider_update_section_progress sp WHERE sp.recipient_id=r.id AND sp.section_key=?)
    AND (r.last_viewed_at IS NOT NULL OR r.status='finalized' OR EXISTS(SELECT 1 FROM provider_update_sends s WHERE s.recipient_id=r.id AND s.delivery_status IN ('sent','pending','delivered')))`,[pushId,agencyId,sectionKey]);
   for(const r of recipients)if(recipientSeesSection(sectionKey,audience,r.provider_user_id))await db.execute(`INSERT IGNORE INTO provider_update_training_notices (push_id,recipient_id,agency_id,section_key,revision_hash,guide_titles_json) VALUES (?,?,?,?,?,?)`,[pushId,r.id,agencyId,sectionKey,revision,JSON.stringify(changed.map(g=>g.title))]);
  }
  await db.commit();saved={...push,section_config_json:config,section_audience_json:audience,amendment_plan_json:push.amendment_plan_json?parse(push.amendment_plan_json):null};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
 let delivery=null;
 if(notify){
  // Retry explicit failures when the administrator saves again. Delivery is
  // handled by the durable worker, so a large roster cannot time out this save.
  await pool.execute("UPDATE provider_update_training_notices SET status='queued' WHERE push_id=? AND agency_id=? AND section_key=? AND status='failed'",[pushId,agencyId,sectionKey]);
  const [[counts]]=await pool.execute(`SELECT COALESCE(SUM(status='sent'),0) AS sent, COALESCE(SUM(status IN ('queued','sending','pending')),0) AS pending, COALESCE(SUM(status='failed'),0) AS failed FROM provider_update_training_notices WHERE push_id=? AND agency_id=? AND section_key=?`,[pushId,agencyId,sectionKey]);
  delivery={sent:Number(counts.sent),pending:Number(counts.pending),failed:Number(counts.failed)};
 }
 return {push:saved,delivery};
}
export async function dispatchTrainingNotices({pushId,agencyId,sectionKey,retryFailed=true}) {
 const [rows]=await pool.execute(`SELECT n.*,r.provider_user_id,u.first_name,u.work_email,p.section_config_json,p.section_audience_json FROM provider_update_training_notices n
 JOIN provider_update_recipients r ON r.id=n.recipient_id JOIN users u ON u.id=r.provider_user_id JOIN provider_update_pushes p ON p.id=n.push_id
 WHERE n.push_id=? AND n.agency_id=? AND n.section_key=? AND n.status IN (${retryFailed ? "'queued','failed'" : "'queued'"}) AND p.status<>'draft'
 AND COALESCE(u.is_demo,0)=0 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(u.status)='ACTIVE_EMPLOYEE'
 AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=n.agency_id AND COALESCE(ua.is_active,1)=1)`,[pushId,agencyId,sectionKey]);
 const result={sent:0,pending:0,failed:0};
 if(!rows.length)return result;
 const sender=await resolveSenderIdentityForSend({agencyId,templateType:'provider_update_training',preferredKeys:['people_operations','people_ops','notifications']}).catch(()=>null);
 const origin=String(process.env.PUBLIC_APP_URL||process.env.FRONTEND_URL||'https://app.itsco.health').replace(/\/$/,'');
 for(const row of rows) {
  const config=parse(row.section_config_json),audience=parse(row.section_audience_json);
  const currentRevision=trainingRevision(config._training?.[sectionKey]||[]);
  if(!config[sectionKey]||currentRevision!==row.revision_hash||!recipientSeesSection(sectionKey,audience,row.provider_user_id)){
   await pool.execute("UPDATE provider_update_training_notices SET status='cancelled' WHERE id=? AND status IN ('queued','failed')",[row.id]);continue;
  }
  const [claim]=await pool.execute("UPDATE provider_update_training_notices SET status='sending',error_message=NULL WHERE id=? AND status IN ('queued','failed')",[row.id]);
  if(!claim.affectedRows)continue;
  let status='failed',error=null,communicationId=null;
  try {
   if(!sender?.identity?.id)throw Error('No People Operations email sender is configured.');
   if(!row.work_email?.includes('@'))throw Error('No work email is saved.');
   const email=trainingNoticeEmail({firstName:row.first_name,section:getSectionMeta(sectionKey),guideTitles:parse(row.guide_titles_json),link:`${origin}/provider-update-instructions/${pushId}/${sectionKey}`});
   const sent=await sendEmailFromIdentity({senderIdentityId:sender.identity.id,to:row.work_email,...email,source:'auto',agencyId,userId:row.provider_user_id,templateType:'provider_update_training'});
   communicationId=sent?.communicationId||null;
   status=sent?.queued?'pending':sent?.skipped||sent?.blocked?'failed':'sent';error=sent?.reason||null;
  }catch(e){error=String(e.message||e).slice(0,500);}
  await pool.execute('UPDATE provider_update_training_notices SET status=?,communication_id=?,error_message=? WHERE id=?',[status,communicationId,error,row.id]);result[status]++;
 }
 return result;
}

// Recover saved notices after a request disconnect or instance restart. Atomic claims
// prevent two instances from sending the same notice. Ambiguous 'sending' records
// are not retried automatically, because the email may already have been accepted.
export async function processQueuedTrainingNotices() {
 const [groups]=await pool.execute("SELECT DISTINCT push_id,agency_id,section_key FROM provider_update_training_notices WHERE status='queued' LIMIT 20");
 for(const row of groups)await dispatchTrainingNotices({pushId:row.push_id,agencyId:row.agency_id,sectionKey:row.section_key,retryFailed:false});
}
