/** Presentation-only rename of unsigned drafts. No sends, payroll or signed-document edits. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {renamePayRateLabels,PAY_RATE_SCOPE} from '../content/payRateLabels.js';
import {renderAmendment,handbookSections} from '../content/itscoOctober2026Drafts.js';
const apply=process.argv.includes('--apply'),parse=v=>typeof v==='string'?JSON.parse(v):v;
const db=await pool.getConnection();
try{
 await db.beginTransaction();
 const [drafts]=await db.execute("SELECT * FROM contract_generations WHERE agency_id IN (2,6) AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE");
 const [sections]=await db.execute('SELECT s.* FROM workplace_handbook_sections s JOIN workplace_handbook_versions v ON v.id=s.version_id WHERE v.agency_id IN (2,6) AND v.is_draft=1 FOR UPDATE');
 const [entries]=await db.execute("SELECT e.* FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE d.agency_id IN (2,6) AND d.status='draft' FOR UPDATE");
 const [clauses]=await db.execute("SELECT * FROM contract_clauses WHERE agency_id IN (2,6) AND clause_key='OCT26_COMPENSATION_AMENDMENT' AND is_active=0 FOR UPDATE");
 const [rules]=await db.execute('SELECT * FROM payroll_service_code_rules WHERE agency_id IN (2,6)');
 if(apply){if(!process.env.UPDATE_BACKUP_PATH)throw Error('UPDATE_BACKUP_PATH required');fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({drafts,sections,entries,clauses}),{mode:0o600,flag:'wx'});}
 const counts={drafts:0,sections:0,tracker:0,clauses:0};
 for(const row of drafts){const data=parse(row.token_values_json);if(data.commonClausesHtml)data.commonClausesHtml=renamePayRateLabels(data.commonClausesHtml);if(data.additionalTerms)data.additionalTerms=renamePayRateLabels(data.additionalTerms);const html=renderAmendment(data);if(html===row.rendered_html)continue;if(apply)await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(data),html,row.id]);counts.drafts++;}
 const inventory=/<h2>Saved code inventory<\/h2><table>[\s\S]*?<\/table>/;
 for(const [rows,table,body,title,key] of [[sections,'workplace_handbook_sections','body_html','title','sections'],[entries,'workplace_handbook_digest_entries','changed_content','subject','tracker'],[clauses,'contract_clauses','body_html',null,'clauses']])for(const row of rows){
  let html=renamePayRateLabels(row[body]),heading=title?renamePayRateLabels(row[title]):null;
  const reference=['colorado-billing-compensation-appendix','service-code-approval-and-credit-reference'].includes(row.slug)||['Colorado Billing & Compensation Appendix','Service codes: Clinical Session Rate and Direct Care Rate'].includes(heading);
  if(reference&&!html.includes(PAY_RATE_SCOPE))html='<p>'+PAY_RATE_SCOPE+'</p>'+html;
  if(reference&&inventory.test(html)){
   const fresh=handbookSections({rules:rules.filter(r=>Number(r.agency_id)===Number(row.agency_id))}).find(s=>s.slug==='colorado-billing-compensation-appendix').bodyHtml;
   html=html.replace(inventory,fresh.match(inventory)[0]);
  }
  if(html===row[body]&&(!title||heading===row[title]))continue;
  if(apply)await db.execute(`UPDATE ${table} SET ${body}=?${title?`,${title}=?`:''} WHERE id=?`,title?[html,heading,row.id]:[html,row.id]);counts[key]++;
 }
 if(apply)await db.commit();else await db.rollback();console.log(JSON.stringify({applied:apply,...counts,payrollChanged:false,messagesSent:0}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
process.exit(0);
