/** Standardize the unreleased October pay-system setup, preserving signed terms and past payroll. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {renderAmendment} from '../content/itscoOctober2026Drafts.js';
import {STANDARD_SPANISH_DIFFERENTIAL as rates,SPANISH_DIFFERENTIAL_HANDBOOK as policy,applyStandardSpanishDifferential} from '../content/spanishDifferential.js';
const apply=process.argv.includes('--apply'),parse=v=>typeof v==='string'?JSON.parse(v):v;
const matches=value=>{const v=parse(value)||{};return [1,2,3].every(t=>Number(v[t])===rates[t]);};
const db=await pool.getConnection();
try {
 await db.beginTransaction();
 const [active]=await db.query('SELECT user_id FROM payroll_user_compensation_levels WHERE agency_id=2 AND pay_system_enabled=1 FOR UPDATE');
 if(active.length)throw Error('Active payroll requires a dated policy change; setup-only correction stopped');
 const [matrix]=await db.query('SELECT * FROM payroll_pay_system_rates WHERE agency_id=2 FOR UPDATE');
 if(matrix.length!==15)throw Error('Expected all 15 category/level combinations');
 const [drafts]=await db.query("SELECT * FROM contract_generations WHERE agency_id=2 AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE");
 const [sections]=await db.query("SELECT s.* FROM workplace_handbook_sections s JOIN workplace_handbook_versions v ON v.id=s.version_id WHERE v.agency_id=2 AND v.is_draft=1 AND s.slug='category-level-rate-schedule' FOR UPDATE");
 const [entries]=await db.query("SELECT e.* FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE d.agency_id=2 AND d.status='draft' AND e.subject='Category and level rate schedule' FOR UPDATE");
 const changes=[],documents=[],skipped=[];
 for(const row of drafts){
  const original=parse(row.token_values_json);if(matches(original.schedule?.spanishDifferentialRates))continue;
  let document=null;
  if(row.task_id||row.user_specific_document_id){
   const [[task]]=await db.execute('SELECT id,status FROM tasks WHERE id=? FOR UPDATE',[row.task_id]);
   const [signed]=await db.execute('SELECT id FROM signed_documents WHERE task_id=? FOR UPDATE',[row.task_id]);
   if(!task||task.status!=='pending'||signed.length){skipped.push(row.id);continue;}
   [[document]]=await db.execute('SELECT * FROM user_specific_documents WHERE id=? AND task_id=? FOR UPDATE',[row.user_specific_document_id,row.task_id]);
   if(!document||document.html_content!==row.rendered_html)throw Error(`Document mismatch ${row.id}`);
   documents.push(document);
  }
  const data=applyStandardSpanishDifferential(original);
  let html=renderAmendment(data);if(document)html=html.replace('<p><strong>Editable draft — not issued or signed.</strong></p>','');
  changes.push({row,data,html,document});
 }
 if(skipped.length)throw Error('Review signed agreements needing a differential change: '+skipped.join(', '));
 const changedRates=matrix.filter(r=>!matches(r.spanish_bonus_json));
 const append=body=>body.includes(policy)?body:body+policy;
 if(apply){
  if(!process.env.UPDATE_BACKUP_PATH)throw Error('Backup path required');
  fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({matrix:changedRates,drafts:changes.map(c=>c.row),documents,sections,entries}),{flag:'wx',mode:0o600});
  for(const r of changedRates)await db.execute('UPDATE payroll_pay_system_rates SET spanish_bonus_json=? WHERE id=? AND agency_id=2',[JSON.stringify(rates),r.id]);
  for(const c of changes){await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=?',[JSON.stringify(c.data),c.html,c.row.id]);if(c.document)await db.execute('UPDATE user_specific_documents SET html_content=? WHERE id=?',[c.html,c.document.id]);}
  for(const s of sections)if(append(s.body_html)!==s.body_html)await db.execute('UPDATE workplace_handbook_sections SET body_html=? WHERE id=?',[append(s.body_html),s.id]);
  for(const e of entries)if(append(e.changed_content)!==e.changed_content)await db.execute('UPDATE workplace_handbook_digest_entries SET changed_content=? WHERE id=?',[append(e.changed_content),e.id]);
  await db.commit();
 }else await db.rollback();
 console.log(JSON.stringify({apply,rateRows:changedRates.map(r=>({category:r.category,level:r.level})),amendments:changes.map(c=>({id:c.row.id,userId:c.row.candidate_user_id})),handbookChanges:sections.filter(s=>!s.body_html.includes(policy)).length,trackerChanges:entries.filter(e=>!e.changed_content.includes(policy)).length,emailsSent:0,pastPayrollChanged:false}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
process.exit(0);
