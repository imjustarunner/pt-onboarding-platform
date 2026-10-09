/** Draft-only Oct 9 refinements. No invitations, credentials, payroll or signatures. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {schoolPartnershipUpdate} from '../content/october2026UpdateRevisions.js';
import {itscoSuggestedTopicEdits} from '../content/itscoOctober2026SuggestedEdits.js';
import {spanishSummary,quickViewInstall,transitionNotice,communicationNotice} from '../content/providerUpdateOctober9Refinements.js';
import {fillSavedCompensationInputs} from '../services/compensationDraftInputs.js';
import {renderAmendment,amendmentIssues} from '../content/itscoOctober2026Drafts.js';
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const apply=process.argv.includes('--apply');
const attachments=html=>(String(html||'').match(/<figure\b[^>]*>[\s\S]*?<\/figure>|<video\b[^>]*>[\s\S]*?<\/video>|<img\b[^>]*data-training-key=[^>]*>/gi)||[]).join('');
const combineRates=html=>String(html||'').replace('<th scope="col">Probationary rate</th><th scope="col">Minimum-workload rate</th>','<th scope="col">Probationary / minimum-workload rate</th>').replace(/(<td>[^<]*<\/td>)\1(?=<\/tr>)/g,'$1');
const db=await pool.getConnection();
try{
 await db.beginTransaction();
 const [updates]=await db.execute('SELECT * FROM admin_updates WHERE id IN (1,2) FOR UPDATE');
 if(updates.length!==2||updates.some(u=>u.status!=='draft'))throw new Error('Both agency admin updates must remain drafts.');
 const [topics]=await db.execute('SELECT * FROM admin_update_topics WHERE update_id IN (1,2) FOR UPDATE');
 const [drafts]=await db.execute("SELECT * FROM contract_generations WHERE agency_id=2 AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE");
 const [assignments]=await db.execute('SELECT * FROM payroll_user_compensation_levels WHERE agency_id=2');
 const [rates]=await db.execute('SELECT * FROM payroll_pay_system_rates WHERE agency_id=2');
 const [levels]=await db.execute('SELECT * FROM payroll_compensation_levels WHERE agency_id=2');
 const [pto]=await db.execute('SELECT user_id,pto_pay_rate FROM payroll_pto_accounts WHERE agency_id=2');
 const [dates]=await db.execute("SELECT v.user_id,v.value FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id WHERE d.field_key='employment_agreement_date'");
 const [sections]=await db.execute("SELECT s.* FROM workplace_handbook_sections s JOIN workplace_handbook_versions v ON v.id=s.version_id WHERE v.is_draft=1 AND v.agency_id IN (2,6) AND s.slug IN ('spanish-language-intake','category-level-rate-schedule') FOR UPDATE");
 const [entries]=await db.execute("SELECT e.* FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE d.status='draft' AND d.agency_id IN (2,6) FOR UPDATE");
 if(apply){if(!process.env.UPDATE_BACKUP_PATH)throw new Error('Set an exclusive UPDATE_BACKUP_PATH.');fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({updates,topics,drafts,sections,entries},null,2),{mode:0o600,flag:'wx'});}
 for(const update of updates){const itsco=Number(update.agency_id)===2;const own=topics.filter(t=>t.update_id===update.id);const transitionKey=itsco?'therapynotes_transition':'library_transition';const communicationKey=itsco?'communication_rollout':'communications';
 const replacements=new Map([[transitionKey,transitionNotice({itsco})],[communicationKey,communicationNotice({itsco})],['spanish_intake',{title:'Spanish-speaking families · intake handoff',body:spanishSummary}],['notes_workspace',itscoSuggestedTopicEdits.notes_workspace]]);
 if(itsco)replacements.set('schools_since_march',{title:'School Partnerships · Colorado Springs & Denver',body:schoolPartnershipUpdate});
 const qv=own.find(t=>t.topic_key==='quick_view');if(qv&&!qv.body_html.includes('On iPhone or iPad'))replacements.set('quick_view',{title:qv.title,body:qv.body_html+quickViewInstall,preserve:true});
 const cards=own.find(t=>t.topic_key==='business_cards');if(cards)replacements.set('business_cards',itscoSuggestedTopicEdits.business_cards);
 for(const [key,t]of replacements){const old=own.find(x=>x.topic_key===key);if(!old)throw new Error(`Missing topic ${update.id}/${key}`);let body=t.body+(t.preserve?'':attachments(old.body_html));if(!itsco)body=body.replaceAll('https://app.itsco.health','https://app.nextleveluplcc.com').replaceAll('/itsco/','/nlu/').replaceAll('ITSCO is using','Your agency is using');if(apply)await db.execute('UPDATE admin_update_topics SET title=?,body_html=? WHERE id=?',[t.title,body,old.id]);}
 if(apply&&itsco)await db.execute("UPDATE admin_update_topics SET enabled=0 WHERE update_id=1 AND topic_key='google_transition'");
 const ordered=own.filter(t=>t.topic_key!==communicationKey).sort((a,b)=>a.sort_order-b.sort_order||a.id-b.id);const at=ordered.findIndex(t=>t.topic_key===transitionKey);ordered.splice(at+1,0,own.find(t=>t.topic_key===communicationKey));if(apply)for(const [i,t]of ordered.entries())await db.execute('UPDATE admin_update_topics SET sort_order=? WHERE id=?',[i,t.id]);
 }
 let enriched=0;const missing=[];
 for(const row of drafts){const original=parse(row.token_values_json),uid=Number(row.candidate_user_id);const data=fillSavedCompensationInputs(original,{assignment:assignments.find(a=>Number(a.user_id)===uid),rates,levels,ptoRate:pto.find(a=>Number(a.user_id)===uid)?.pto_pay_rate,agreementDate:dates.find(d=>Number(d.user_id)===uid)?.value});if(JSON.stringify(original)!==JSON.stringify(data))enriched++;
 const html=renderAmendment(data);if(apply)await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(data),html,row.id]);if(!data.schedule.category||!data.schedule.level)missing.push({name:data.employee.name,id:uid});
 if(process.env.AMENDMENT_REVIEW_DIR&&([465,82,480].includes(uid)))fs.writeFileSync(`${process.env.AMENDMENT_REVIEW_DIR}/${data.employee.name.replace(/[^a-zA-Z0-9]+/g,'-')}-amendment.html`,`<!doctype html><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;max-width:1100px;margin:30px auto;padding:20px;color:#173346}table{border-collapse:collapse;width:100%}th,td{padding:12px;border:1px solid #ccd6df;text-align:left}thead th{background:#173346;color:white}</style>${html}`,{mode:0o600});
 }
 const spanishDetail=itscoSuggestedTopicEdits.spanish_intake.body.replace(/Contact spanish@your-agency-domain \(espanol@ is an alias for the same group\), or use the agency’s Spanish intake channel\./,'Open Messages by Conversa and choose the Spanish / Español group.').replace(/ For ITSCO, use .*?both reach the same team\./,'');
 for(const s of sections){const html=s.slug==='spanish-language-intake'?spanishDetail+attachments(s.body_html):combineRates(s.body_html);if(apply)await db.execute('UPDATE workplace_handbook_sections SET body_html=? WHERE id=?',[html,s.id]);}
 for(const e of entries){const html=/Spanish/i.test(e.subject)?spanishDetail+attachments(e.changed_content):combineRates(e.changed_content);if(apply&&html!==e.changed_content)await db.execute('UPDATE workplace_handbook_digest_entries SET changed_content=? WHERE id=?',[html,e.id]);}
 if(apply)await db.commit();else await db.rollback();console.log(JSON.stringify({mode:apply?'applied-drafts':'dry-run',drafts:drafts.length,enriched,missingAssignments:missing,messagesSent:0,payrollActivated:false}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
