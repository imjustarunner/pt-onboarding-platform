/** Draft-only handbook and unsigned amendment refresh. No benefit/payroll activation. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {SUPERVISORY_REVIEW_CONSIDERATION} from '../content/compensationHandbookClarifications.js';
import {handbookSections,renderAmendment} from '../content/itscoOctober2026Drafts.js';
const apply=process.argv.includes('--apply'),parse=v=>typeof v==='string'?JSON.parse(v):v;
const slugs=new Set(['minimum-workload-rates-and-tracking','service-code-approval-and-credit-reference','school-mileage-reimbursement','training-leave-benefit','school-service-support-time','groups-moratorium-and-approval','compensation-level-expectations-and-review']);
const db=await pool.getConnection();
try{
 await db.beginTransaction();
 const [[version]]=await db.execute('SELECT * FROM workplace_handbook_versions WHERE agency_id=2 AND is_draft=1 ORDER BY id DESC LIMIT 1 FOR UPDATE');
 const [[digest]]=await db.execute("SELECT * FROM workplace_handbook_digests WHERE agency_id=2 AND status='draft' ORDER BY id DESC LIMIT 1 FOR UPDATE");
 if(!version||!digest)throw Error('Expected editable handbook and update tracker.');
 const [sections]=await db.execute('SELECT * FROM workplace_handbook_sections WHERE version_id=? FOR UPDATE',[version.id]);
 const [entries]=await db.execute('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=? FOR UPDATE',[digest.id]);
 const [drafts]=await db.execute("SELECT * FROM contract_generations WHERE agency_id=2 AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE");
 const [rates]=await db.execute('SELECT * FROM payroll_pay_system_rates WHERE agency_id=2');
 const [rules]=await db.execute('SELECT * FROM payroll_service_code_rules WHERE agency_id=2');
 const [[agency]]=await db.execute('SELECT tier_thresholds_json FROM agencies WHERE id=2');
 const refreshed=handbookSections({rates,rules,thresholds:parse(agency.tier_thresholds_json)||{}}).filter(s=>slugs.has(s.slug));
 if(apply){if(!process.env.UPDATE_BACKUP_PATH)throw Error('Backup path required');fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({sections,entries,drafts}),{mode:0o600,flag:'wx'});}
 let order=Math.max(0,...sections.map(s=>Number(s.sort_order)||0))+1;
 for(const s of refreshed){
  const existing=sections.find(row=>row.slug===s.slug),entry=entries.find(row=>row.subject===s.title);
  const reviewMarker='<!-- supervisory-review-consideration -->';
  const preserveReviews=html=>String(html).includes(reviewMarker)?String(html):String(html)+reviewMarker+'<h2>Supervisory review and evaluations</h2><p>'+SUPERVISORY_REVIEW_CONSIDERATION+'</p>';
  const sectionHtml=s.slug==='compensation-level-expectations-and-review'&&existing?preserveReviews(existing.body_html):s.bodyHtml;
  const entryHtml=s.slug==='compensation-level-expectations-and-review'&&entry?preserveReviews(entry.changed_content):s.bodyHtml;
  const rationale=s.slug==='school-service-support-time'?'Create a separate proposed school benefit; finalize eligible uses and accrual scope before activation.':s.slug==='training-leave-benefit'?'Document the 0.25-per-30 training benefit for all employees, with separate eligibility and carryover rules.':'Make compensation, service approval and benefit rules easy to find and understand.';
  if(apply){
   if(existing)await db.execute('UPDATE workplace_handbook_sections SET body_html=? WHERE id=?',[sectionHtml,existing.id]);
   else await db.execute('INSERT INTO workplace_handbook_sections(version_id,agency_id,slug,title,body_html,sort_order) VALUES(?,2,?,?,?,?)',[version.id,s.slug,s.title,s.bodyHtml,order]);
   if(entry)await db.execute('UPDATE workplace_handbook_digest_entries SET changed_content=?,rationale=? WHERE id=?',[entryHtml,rationale,entry.id]);
   else await db.execute('INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,sort_order,subject,rationale,changed_content) VALUES(?,?,?,?,?,?)',[digest.id,2,order,s.title,rationale,s.bodyHtml]);
  }order++;
 }
 let changed=0;
 for(const row of drafts){const data=parse(row.token_values_json),html=renderAmendment(data);if(html!==row.rendered_html){changed++;if(apply)await db.execute('UPDATE contract_generations SET rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[html,row.id]);}}
 if(apply)await db.commit();else await db.rollback();
 console.log(JSON.stringify({mode:apply?'saved-drafts':'dry-run',sections:refreshed.map(s=>s.title),amendmentsChanged:changed,benefitActivated:false,payrollChanged:false,messagesSent:0}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
