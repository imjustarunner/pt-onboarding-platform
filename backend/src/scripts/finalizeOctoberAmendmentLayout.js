/** Owner-requested execution and clause placement in unsigned drafts only. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {renderAmendment} from '../content/itscoOctober2026Drafts.js';
import {updateAmendmentExecutionTerms} from '../content/amendmentExecution.js';
const apply=process.argv.includes('--apply'),parse=v=>typeof v==='string'?JSON.parse(v):v;
const db=await pool.getConnection();
try{
 await db.beginTransaction();
 const [drafts]=await db.execute("SELECT * FROM contract_generations WHERE agency_id IN (2,6) AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE");
 const [clauses]=await db.execute("SELECT * FROM contract_clauses WHERE agency_id IN (2,6) AND clause_key='OCT26_COMPENSATION_AMENDMENT' AND is_active=0 FOR UPDATE");
 if(apply){if(!process.env.UPDATE_BACKUP_PATH)throw Error('UPDATE_BACKUP_PATH required');fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({drafts,clauses}),{flag:'wx',mode:0o600});}
 let count=0;
 for(const row of drafts){const data=parse(row.token_values_json);if(data.commonClausesHtml)data.commonClausesHtml=updateAmendmentExecutionTerms(data.commonClausesHtml);const html=renderAmendment(data);
  const headings=[...html.matchAll(/<h3>(.*?)<\/h3>/g)].map(m=>m[1]);
  if(!headings.at(-1)?.includes('acknowledgment and signatures')||html.includes('____________________')||!html.includes('replaces all financial, compensation and employee-benefit terms')||!html.includes('countersigns electronically'))throw Error(`Review custom execution terms in draft ${row.id}`);
  if(apply)await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(data),html,row.id]);count++;
 }
 for(const row of clauses){const html=updateAmendmentExecutionTerms(row.body_html);if(apply)await db.execute('UPDATE contract_clauses SET body_html=? WHERE id=? AND is_active=0',[html,row.id]);}
 if(apply)await db.commit();else await db.rollback();console.log(JSON.stringify({applied:apply,drafts:count,clauses:clauses.length,payrollChanged:false,messagesSent:0}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
process.exit(0);
