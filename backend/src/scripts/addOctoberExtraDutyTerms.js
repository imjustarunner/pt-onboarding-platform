/** Add owner-authorized extra-duty terms only to unsigned compensation documents. No sending. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {updateAmendmentExecutionTerms} from '../content/amendmentExecution.js';
const apply=process.argv.includes('--apply'),parse=value=>typeof value==='string'?JSON.parse(value):value;
const db=await pool.getConnection();
try {
 await db.beginTransaction();
 const [drafts]=await db.query("SELECT * FROM contract_generations WHERE agency_id IN(2,6) AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE");
 const [clauses]=await db.query("SELECT * FROM contract_clauses WHERE agency_id IN(2,6) AND clause_key='OCT26_COMPENSATION_AMENDMENT' AND is_active=0 FOR UPDATE");
 const changes=[],skipped=[];
 for(const row of drafts) {
  let document=null;
  if(row.task_id||row.user_specific_document_id) {
   const [[task]]=await db.execute('SELECT * FROM tasks WHERE id=? FOR UPDATE',[row.task_id]);
   const [signing]=await db.execute('SELECT id FROM signed_documents WHERE task_id=? FOR UPDATE',[row.task_id]);
   if(!task||task.status!=='pending'||signing.length){skipped.push(row.id);continue;}
   [[document]]=await db.execute('SELECT * FROM user_specific_documents WHERE id=? AND task_id=? FOR UPDATE',[row.user_specific_document_id,row.task_id]);
   if(!document||document.html_content!==row.rendered_html)throw Error(`Review document mismatch for generation ${row.id}`);
  }
  const data=parse(row.token_values_json),html=updateAmendmentExecutionTerms(row.rendered_html);
  if(data.commonClausesHtml)data.commonClausesHtml=updateAmendmentExecutionTerms(data.commonClausesHtml);
  if(html!==row.rendered_html)changes.push({row,data,html,document});
 }
 const clauseChanges=clauses.map(row=>({row,html:updateAmendmentExecutionTerms(row.body_html)})).filter(c=>c.html!==c.row.body_html);
 if(apply&&(changes.length||clauseChanges.length)){
  if(!process.env.UPDATE_BACKUP_PATH)throw Error('Backup path required');
  fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({drafts:changes.map(c=>c.row),documents:changes.map(c=>c.document).filter(Boolean),clauses:clauseChanges.map(c=>c.row)}),{flag:'wx',mode:0o600});
  for(const c of changes){
   await db.execute('UPDATE contract_generations SET rendered_html=?,token_values_json=? WHERE id=?',[c.html,JSON.stringify(c.data),c.row.id]);
   if(c.document)await db.execute('UPDATE user_specific_documents SET html_content=? WHERE id=?',[c.html,c.document.id]);
  }
  for(const c of clauseChanges)await db.execute('UPDATE contract_clauses SET body_html=? WHERE id=? AND is_active=0',[c.html,c.row.id]);
  await db.commit();
 }else await db.rollback();
 console.log(JSON.stringify({apply,drafts:changes.length,releasedUnsigned:changes.filter(c=>c.document).length,clauses:clauseChanges.length,skippedSignedOrStarted:skipped,emailsSent:0}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
process.exit(0);
