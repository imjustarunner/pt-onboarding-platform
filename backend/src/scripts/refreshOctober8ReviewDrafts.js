/** Requested Oct 8 revisions. Draft-only, transactional, backup required to apply. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {handbookSections,commonAmendmentClauses,renderAmendment,SERVICE_POLICY_VERSION,amendmentIssues} from '../content/itscoOctober2026Drafts.js';
import {conditionalLevelBonus,defaultHcodeIndirectMinutes} from '../utils/serviceCreditPolicy.js';
import {itscoRevisionTopics} from '../content/october2026UpdateRevisions.js';
import {staffMilestones} from '../services/staffMilestonePresentation.service.js';
const apply=process.argv.includes('--apply'), parse=v=>typeof v==='string'?JSON.parse(v):v;
const media=html=>(String(html||'').match(/<figure\b[^>]*>[\s\S]*?<\/figure>|<video\b[^>]*>[\s\S]*?<\/video>|<img\b[^>]*data-training-key=[^>]*>/gi)||[]).join('');
async function main(){
 const db=await pool.getConnection();
 try{await db.beginTransaction();
  const [[update]]=await db.execute('SELECT * FROM admin_updates WHERE id=1 AND agency_id=2 FOR UPDATE');
  const [[digest]]=await db.execute('SELECT * FROM workplace_handbook_digests WHERE id=1 AND agency_id=2 FOR UPDATE');
  const [[version]]=await db.execute('SELECT * FROM workplace_handbook_versions WHERE agency_id=2 AND is_draft=1 ORDER BY id DESC LIMIT 1 FOR UPDATE');
  if(update?.status!=='draft'||digest?.status!=='draft'||!version)throw new Error('Only editable October drafts can be refreshed.');
  const [topics]=await db.execute('SELECT * FROM admin_update_topics WHERE update_id=1 ORDER BY sort_order,id FOR UPDATE');
  const [entries]=await db.execute('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=1 ORDER BY sort_order,id FOR UPDATE');
  const [sections]=await db.execute('SELECT * FROM workplace_handbook_sections WHERE version_id=? ORDER BY sort_order,id FOR UPDATE',[version.id]);
  const [drafts]=await db.execute("SELECT * FROM contract_generations WHERE agency_id=2 AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE");
  const [rates]=await db.execute('SELECT * FROM payroll_pay_system_rates WHERE agency_id=2');
  const [rules]=await db.execute('SELECT * FROM payroll_service_code_rules WHERE agency_id=2');
  const [levels]=await db.execute('SELECT * FROM payroll_compensation_levels WHERE agency_id=2');
  const [clauses]=await db.execute("SELECT * FROM contract_clauses WHERE agency_id=2 AND clause_key='OCT26_COMPENSATION_AMENDMENT' AND is_active=0");
  if(apply){if(!process.env.UPDATE_BACKUP_PATH)throw new Error('An exclusive backup path is required.');fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({update,digest,version,topics,entries,sections,drafts,clauses},null,2),{mode:0o600,flag:'wx'});}
  const replacements=itscoRevisionTopics(await staffMilestones(2)).filter(t=>['people_since_march','anniversaries','schools_since_march'].includes(t.key));
  const proposed=handbookSections({rates,rules,levels});
  const updates=[];
  for(const row of drafts){const data=parse(row.token_values_json);
   data.compensationPolicyVersion=SERVICE_POLICY_VERSION;
   data.schedule.autoIndirectMinutes=defaultHcodeIndirectMinutes(data.schedule.category);
   data.schedule.tier3LevelBonus=conditionalLevelBonus(data.schedule.level);
   data.schedule.leaveAdminRatio=.2;
   data.commonClausesHtml=commonAmendmentClauses('sick');
   updates.push({id:row.id,data,html:renderAmendment(data),issues:amendmentIssues(data)});
  }
  if(apply){
   for(const t of replacements){const old=topics.find(o=>o.topic_key===t.key);if(old)await db.execute('UPDATE admin_update_topics SET title=?,body_html=? WHERE id=? AND update_id=1',[t.title,t.body+media(old.body_html),old.id]);}
   // Remove only the duplicate overview requested as item 1. Other owner edits
   // and training media remain intact unless that section is explicitly revised.
   const duplicate=entries.find(e=>e.subject==='Compensation: service credits, H-code time and individual rates');
   if(duplicate)await db.execute('DELETE FROM workplace_handbook_digest_entries WHERE id=? AND digest_id=1',[duplicate.id]);
   const duplicateSection=sections.find(s=>s.title==='Compensation: service credits, H-code time and individual rates');
   if(duplicateSection)await db.execute('DELETE FROM workplace_handbook_sections WHERE id=? AND version_id=?',[duplicateSection.id,version.id]);
   for(const s of proposed.filter(s=>['colorado-billing-compensation-appendix','category-level-rate-schedule','paid-time-off-and-colorado-sick-leave','october-2026-editor-change-map'].includes(s.slug))){
    const old=sections.find(o=>o.slug===s.slug), entry=entries.find(e=>e.subject===s.title || (old&&e.subject===old.title));
    const body=s.bodyHtml+media(old?.body_html);
    if(old)await db.execute('UPDATE workplace_handbook_sections SET title=?,body_html=? WHERE id=? AND version_id=?',[s.title,body,old.id,version.id]);
    else await db.execute('INSERT INTO workplace_handbook_sections(version_id,agency_id,sort_order,slug,title,body_html) VALUES (?,2,2,?,?,?)',[version.id,s.slug,s.title,body]);
    const rationale='Clarify service pay, separate conditional Tier 3 additions, and distinguish clinical-credit sick-leave accrual from the ten-minute H-code indirect allowance.';
    if(entry)await db.execute('UPDATE workplace_handbook_digest_entries SET subject=?,rationale=?,changed_content=? WHERE id=? AND digest_id=1',[s.title,rationale,s.bodyHtml+media(entry.changed_content),entry.id]);
    else await db.execute('INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,sort_order,subject,rationale,changed_content) VALUES (1,2,2,?,?,?)',[s.title,rationale,s.bodyHtml]);
   }
   await db.execute("UPDATE workplace_handbook_digests SET title='Handbook Updates',period_label='As of October 2026' WHERE id=1 AND status='draft'");
   const [fresh]=await db.execute('SELECT id,subject,rationale FROM workplace_handbook_digest_entries WHERE digest_id=1 ORDER BY sort_order,id');
   const schedule=fresh.find(e=>e.subject==='Category and level rate schedule');
   const ordered=fresh.filter(e=>e!==schedule);if(schedule)ordered.splice(1,0,schedule);
   for(const [i,e]of ordered.entries())await db.execute('UPDATE workplace_handbook_digest_entries SET sort_order=?,rationale=? WHERE id=?',[i,String(e.rationale||'').replace(/^October 8 owner clarification:\s*/i,'').replace(/^October 8 policy revision for editing\.?$/i,'Clarify the group-service policy and exception process.'),e.id]);
   for(const d of updates)await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(d.data),d.html,d.id]);
   await db.execute("UPDATE contract_clauses SET body_html=? WHERE agency_id=2 AND clause_key='OCT26_COMPENSATION_AMENDMENT' AND is_active=0",[commonAmendmentClauses('sick')]);
   await db.commit();
  }else await db.rollback();
  if(process.env.AMENDMENT_REVIEW_DIR)for(const d of updates.filter(d=>d.data.example||[465,496].includes(Number(d.data.employee.userId))))fs.writeFileSync(`${process.env.AMENDMENT_REVIEW_DIR}/${d.data.employee.name.replace(/[^a-zA-Z0-9]+/g,'-')}-amendment.html`,`<!doctype html><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;max-width:1080px;margin:30px auto;color:#173346}table{border-collapse:collapse;width:100%}th,td{padding:12px;text-align:left;border:1px solid #ccd6df}thead th{background:#173346;color:white}h2{margin-top:32px}</style>${d.html}`,{mode:0o600});
  console.log(JSON.stringify({mode:apply?'applied-drafts':'dry-run',amendments:updates.length,readyForRelease:updates.filter(d=>!d.issues.length).length,adminTopics:replacements.length,messagesSent:0,payrollActivated:false}));
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
