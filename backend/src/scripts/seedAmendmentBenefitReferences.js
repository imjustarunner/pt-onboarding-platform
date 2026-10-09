/** Refresh unsigned amendments and draft handbook references; no payroll or sends. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {listSchoolAssignedProviders} from '../services/providerYearUpdate.service.js';
import {renderAmendment} from '../content/itscoOctober2026Drafts.js';
import {SCHOOL_SUPPORT_PURPOSE} from '../content/compensationHandbookClarifications.js';
const apply=process.argv.includes('--apply'),parse=v=>typeof v==='string'?JSON.parse(v):v;
const schoolIds=new Map(await Promise.all([2,6].map(async id=>[id,new Set((await listSchoolAssignedProviders(id)).map(p=>Number(p.provider_user_id)))])));
const db=await pool.getConnection();
try{
 await db.beginTransaction();
 const [drafts]=await db.execute("SELECT * FROM contract_generations WHERE agency_id IN (2,6) AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE");
 const [sections]=await db.execute("SELECT s.* FROM workplace_handbook_sections s JOIN workplace_handbook_versions v ON v.id=s.version_id WHERE v.agency_id IN (2,6) AND v.is_draft=1 AND s.slug='school-service-support-time' FOR UPDATE");
 const [entries]=await db.execute("SELECT e.* FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE d.agency_id IN (2,6) AND d.status='draft' AND e.subject='School support activity hours' FOR UPDATE");
 if(apply){if(!process.env.UPDATE_BACKUP_PATH)throw Error('UPDATE_BACKUP_PATH required');fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({drafts,sections,entries}),{mode:0o600,flag:'wx'});}
 const counts={drafts:0,schoolAssigned:0,handbook:0,tracker:0};
 for(const row of drafts){const data=parse(row.token_values_json),assigned=schoolIds.get(Number(row.agency_id))?.has(Number(row.candidate_user_id))||false;data.benefitsEligibility={...data.benefitsEligibility,schoolAssigned:assigned,source:'Active agency-affiliated provider school assignments',verifiedOn:'2026-10-09'};const html=renderAmendment(data);if(apply)await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(data),html,row.id]);counts.drafts++;if(assigned)counts.schoolAssigned++;}
 const addition='<h2>Purpose — weather disruptions and missed sessions</h2><p>'+SCHOOL_SUPPORT_PURPOSE+'</p><p>Payment is limited to earned available hours and the handbook’s request and payroll-approval requirements. It is not an automatic payment for every missed appointment and does not replace wages for work actually performed. Existing earned balances and previously approved uses remain protected.</p>';
 for(const [rows,table,column,key] of [[sections,'workplace_handbook_sections','body_html','handbook'],[entries,'workplace_handbook_digest_entries','changed_content','tracker']])for(const row of rows){if(String(row[column]).includes(SCHOOL_SUPPORT_PURPOSE))continue;const old=String(row[column]);const html=old.includes('<h2>Balance and use</h2>')?old.replace('<h2>Balance and use</h2>',addition+'<h2>Balance and use</h2>'):old+addition;if(apply)await db.execute(`UPDATE ${table} SET ${column}=? WHERE id=?`,[html,row.id]);counts[key]++;}
 if(apply)await db.commit();else await db.rollback();console.log(JSON.stringify({applied:apply,...counts,payrollChanged:false,messagesSent:0}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
process.exit(0);
