/** Refresh unsigned ITSCO drafts only; never activate payroll or issue an agreement. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {renderAmendment} from '../content/itscoOctober2026Drafts.js';
import {replaceHcodeHandbookSection} from '../content/hcodeCompensationPolicy.js';
const apply=process.argv.includes('--apply'),parse=v=>typeof v==='string'?JSON.parse(v):v;
const db=await pool.getConnection();
try {
 await db.beginTransaction();
 const [drafts]=await db.execute("SELECT * FROM contract_generations WHERE agency_id=2 AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE");
 const [sections]=await db.execute("SELECT s.* FROM workplace_handbook_sections s JOIN workplace_handbook_versions v ON v.id=s.version_id WHERE v.agency_id=2 AND v.is_draft=1 AND s.slug='colorado-billing-compensation-appendix' FOR UPDATE");
 const [entries]=await db.execute("SELECT e.* FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE d.agency_id=2 AND d.status='draft' AND e.subject='Colorado Billing & Compensation Appendix' FOR UPDATE");
 if(!sections.length||!entries.length)throw Error('Expected draft appendix and update tracker were not found.');
 const updatedSections=sections.map(row=>({...row,body_html:replaceHcodeHandbookSection(row.body_html)}));
 const updatedEntries=entries.map(row=>({...row,changed_content:replaceHcodeHandbookSection(row.changed_content)}));
 const updatedDrafts=drafts.map(row=>({...row,rendered_html:renderAmendment(parse(row.token_values_json))}));
 const changes=rows=>rows.filter(row=>row.rendered_html!==drafts.find(d=>d.id===row.id)?.rendered_html).length;
 if(apply){
  if(!process.env.UPDATE_BACKUP_PATH)throw Error('UPDATE_BACKUP_PATH is required.');
  fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({drafts,sections,entries}),{flag:'wx',mode:0o600});
  for(const row of updatedSections)await db.execute('UPDATE workplace_handbook_sections SET body_html=? WHERE id=?',[row.body_html,row.id]);
  for(const row of updatedEntries)await db.execute('UPDATE workplace_handbook_digest_entries SET changed_content=? WHERE id=?',[row.changed_content,row.id]);
  for(const row of updatedDrafts)await db.execute('UPDATE contract_generations SET rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[row.rendered_html,row.id]);
  await db.commit();
 }else await db.rollback();
 console.log(JSON.stringify({mode:apply?'saved-drafts':'dry-run',amendmentsChanged:changes(updatedDrafts),handbookSections:sections.length,trackerEntries:entries.length,payrollChanged:false,messagesSent:0}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
