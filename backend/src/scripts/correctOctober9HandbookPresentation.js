/** Narrow, backed-up edits to draft handbooks and update trackers. No sending or payroll changes. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {correctHandbookPresentation} from '../content/handbookPresentationCorrections.js';
import {HANDBOOK_APP_TRANSITION} from '../content/handbookCodePresentation.js';
const apply=process.argv.includes('--apply'),db=await pool.getConnection();
try {
 await db.beginTransaction();
 const [sections]=await db.query('SELECT s.* FROM workplace_handbook_sections s JOIN workplace_handbook_versions v ON v.id=s.version_id WHERE v.agency_id IN(2,6) AND v.is_draft=1 FOR UPDATE');
 const [entries]=await db.query("SELECT e.* FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE d.agency_id IN(2,6) AND d.status='draft' FOR UPDATE");
 const [rules]=await db.query('SELECT * FROM payroll_service_code_rules WHERE agency_id IN(2,6) ORDER BY service_code');
 const changes=[];
 for(const section of sections) {
  const agencyRules=rules.filter(r=>Number(r.agency_id)===Number(section.agency_id));
  const body=correctHandbookPresentation(section.slug,section.body_html,agencyRules);
  const transition=section.slug===HANDBOOK_APP_TRANSITION.slug;
  const title=transition?HANDBOOK_APP_TRANSITION.title:section.title;
  if(body!==section.body_html||title!==section.title)changes.push({table:'workplace_handbook_sections',id:section.id,title,body,old:section});
  for(const entry of entries.filter(e=>e.agency_id===section.agency_id&&[section.title,title].includes(e.subject))) {
   const updated=correctHandbookPresentation(section.slug,entry.changed_content,agencyRules);
   const rationale=transition?'Keep the current handbook and its communicated changes accessible together in the app.':entry.rationale;
   if(updated!==entry.changed_content||title!==entry.subject||rationale!==entry.rationale)changes.push({table:'workplace_handbook_digest_entries',id:entry.id,title,body:updated,rationale,old:entry});
  }
 }
 if(apply&&changes.length){
  if(!process.env.UPDATE_BACKUP_PATH)throw Error('UPDATE_BACKUP_PATH required');
  fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify(changes.map(({table,old})=>({table,row:old})),null,2),{flag:'wx',mode:0o600});
  for(const c of changes)if(c.table==='workplace_handbook_sections')await db.execute('UPDATE workplace_handbook_sections SET title=?,body_html=? WHERE id=?',[c.title,c.body,c.id]);else await db.execute('UPDATE workplace_handbook_digest_entries SET subject=?,changed_content=?,rationale=? WHERE id=?',[c.title,c.body,c.rationale,c.id]);
  await db.commit();
 }else await db.rollback();
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',changes:changes.map(({table,id,title})=>({table,id,title})),notificationsSent:0,payrollChanged:false}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
process.exit(0);
