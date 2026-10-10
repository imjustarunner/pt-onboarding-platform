import crypto from 'node:crypto';
import pool from '../config/database.js';
import {getSectionMeta} from '../constants/providerUpdateSections.js';
import {recipientSeesSection} from './providerUpdate.service.js';
import {resolveProviderUpdateRecipients} from './providerUpdateRecipient.service.js';
import {resolveProviderUpdateSender} from './providerUpdateEmailSender.service.js';
import {sendEmailFromIdentity} from './unifiedEmail/unifiedEmailSender.service.js';
const parse=v=>typeof v==='string'?JSON.parse(v):v||{};
const array=v=>{const parsed=parse(v);return Array.isArray(parsed)?parsed:[];};
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const TRAINING_BATCH_KEY='__batch__';
export function trainingBatchSnapshot(config,audience,userId,assignedKeys){
 return Object.keys(config._training||{}).sort().filter(key=>config[key]&&getSectionMeta(key)&&(assignedKeys||[]).includes(key)&&recipientSeesSection(key,audience,userId)).map(sectionKey=>({sectionKey,guides:(config._training[sectionKey]||[]).map(g=>({id:g.id,title:g.title,revision:crypto.createHash('sha256').update(g.html||'').digest('hex')}))})).filter(s=>s.guides.length);
}
export function trainingBatchEmail({firstName,sections,pushId,origin}){
 const links=sections.flatMap(s=>s.guides.map(g=>({title:g.title,section:getSectionMeta(s.sectionKey).title,url:`${origin}/provider-update-instructions/${pushId}/${encodeURIComponent(s.sectionKey)}?guide=${encodeURIComponent(g.id)}`})));
 const intro='Your Provider Update instruction videos and photos are ready. Use the links below to open each guide. They also remain available in their sections, including after you complete your update.';
 return {subject:'Your Provider Update guides are ready',text:`Hello ${firstName},\n\n${intro}\n\n${links.map(l=>`${l.section}: ${l.title}\n${l.url}`).join('\n\n')}\n\nPeople Operations`,html:`<div style="font:16px/1.6 Arial;color:#203c48;max-width:680px;margin:auto;padding:24px"><h1 style="font-size:26px">Your Provider Update guides are ready</h1><p>Hello ${escape(firstName)},</p><p>${intro}</p><ul>${links.map(l=>`<li style="margin:16px 0"><strong>${escape(l.section)}</strong><br><a href="${escape(l.url)}">${escape(l.title)} →</a></li>`).join('')}</ul><p>People Operations</p></div>`};
}
export async function queueTrainingBatch({pushId,agencyId}){
 const db=await pool.getConnection();let queued=0,unchanged=0;
 try{await db.beginTransaction();
 const [[push]]=await db.execute('SELECT * FROM provider_update_pushes WHERE id=? AND agency_id=? FOR UPDATE',[pushId,agencyId]);
 if(!push||push.status==='draft'||String(push.title).startsWith('[PREVIEW]'))throw Object.assign(Error('Send the Provider Update invitations before pushing guides.'),{status:409});
 const config=parse(push.section_config_json),audience=parse(push.section_audience_json);
 const [recipients]=await db.execute(`SELECT r.*, (SELECT JSON_ARRAYAGG(sp.section_key) FROM provider_update_section_progress sp WHERE sp.recipient_id=r.id) assigned_keys FROM provider_update_recipients r JOIN users u ON u.id=r.provider_user_id
 WHERE r.push_id=? AND r.agency_id=? AND LEFT(r.token,8)<>'preview_' AND COALESCE(r.is_demo_snapshot,0)=0
 AND COALESCE(u.is_demo,0)=0 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(u.status)='ACTIVE_EMPLOYEE'
 AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=r.agency_id AND COALESCE(ua.is_active,1)=1)
 AND (r.last_viewed_at IS NOT NULL OR r.status='finalized' OR EXISTS(SELECT 1 FROM provider_update_sends s WHERE s.recipient_id=r.id AND s.delivery_status IN ('sent','pending','delivered')))`,[pushId,agencyId]);
 for(const r of recipients){const sections=trainingBatchSnapshot(config,audience,r.provider_user_id,array(r.assigned_keys));if(!sections.length)continue;
 const hash=crypto.createHash('sha256').update(JSON.stringify(sections)).digest('hex');
 // Supersede unsent earlier batches; never resend ambiguous or accepted sends.
 await db.execute("UPDATE provider_update_training_notices SET status='cancelled' WHERE recipient_id=? AND section_key=? AND revision_hash<>? AND status IN ('queued','failed')",[r.id,TRAINING_BATCH_KEY,hash]);
 const [ins]=await db.execute('INSERT IGNORE INTO provider_update_training_notices (push_id,recipient_id,agency_id,section_key,revision_hash,guide_titles_json) VALUES (?,?,?,?,?,?)',[pushId,r.id,agencyId,TRAINING_BATCH_KEY,hash,JSON.stringify(sections)]);
 if(ins.affectedRows)queued++;else{const [retry]=await db.execute("UPDATE provider_update_training_notices SET status='queued',error_message=NULL WHERE recipient_id=? AND section_key=? AND revision_hash=? AND status IN ('failed','cancelled')",[r.id,TRAINING_BATCH_KEY,hash]);if(retry.affectedRows)queued++;else unchanged++;}
 }
 await db.commit();return {queued,unchanged};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function dispatchTrainingBatch({pushId,agencyId}){
 const [rows]=await pool.execute(`SELECT n.*,r.provider_user_id,u.first_name,u.email,u.work_email,p.section_config_json,p.section_audience_json,
 (SELECT JSON_ARRAYAGG(sp.section_key) FROM provider_update_section_progress sp WHERE sp.recipient_id=r.id) assigned_keys
 FROM provider_update_training_notices n JOIN provider_update_recipients r ON r.id=n.recipient_id JOIN users u ON u.id=r.provider_user_id JOIN provider_update_pushes p ON p.id=n.push_id
 WHERE n.push_id=? AND n.agency_id=? AND n.section_key=? AND n.status='queued' AND p.status<>'draft'
 AND COALESCE(u.is_demo,0)=0 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(u.status)='ACTIVE_EMPLOYEE'
 AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=n.agency_id AND COALESCE(ua.is_active,1)=1)`,[pushId,agencyId,TRAINING_BATCH_KEY]);
 if(!rows.length)return;
 const sender=await resolveProviderUpdateSender(agencyId).catch(()=>null),origin=String(process.env.PUBLIC_APP_URL||process.env.FRONTEND_URL||'https://app.itsco.health').replace(/\/$/,'');
 for(const row of rows){
 const current=trainingBatchSnapshot(parse(row.section_config_json),parse(row.section_audience_json),row.provider_user_id,array(row.assigned_keys));
 // Never announce guides changed or removed since the explicit push.
 const sections=array(row.guide_titles_json).map(s=>({...s,guides:s.guides.filter(g=>current.some(c=>c.sectionKey===s.sectionKey&&c.guides.some(cg=>cg.id===g.id&&cg.revision===g.revision&&cg.title===g.title)))})).filter(s=>s.guides.length);
 if(!sections.length){await pool.execute("UPDATE provider_update_training_notices SET status='cancelled' WHERE id=? AND status='queued'",[row.id]);continue;}
 const [claim]=await pool.execute("UPDATE provider_update_training_notices SET status='sending' WHERE id=? AND status='queued'",[row.id]);if(!claim.affectedRows)continue;
 let status='failed',error=null,communicationId=null;
 try{if(!sender?.identity?.id)throw Error('No People Operations sender is configured.');const [recipient]=await resolveProviderUpdateRecipients(agencyId,[row]);if(!recipient.work_email?.includes('@'))throw Error('No work email is saved.');
 const sent=await sendEmailFromIdentity({senderIdentityId:sender.identity.id,to:recipient.work_email,...trainingBatchEmail({firstName:row.first_name,sections,pushId,origin}),source:'auto',agencyId,userId:row.provider_user_id,templateType:'provider_update_training',replyToOverride:sender.replyTo});
 communicationId=sent?.communicationId||null;status=sent?.queued?'pending':sent?.blocked||sent?.skipped?'failed':'sent';error=sent?.reason||null;
 }catch(e){error=String(e.message||e).slice(0,500);}
 await pool.execute('UPDATE provider_update_training_notices SET status=?,communication_id=?,error_message=? WHERE id=?',[status,communicationId,error,row.id]);
 }
}
