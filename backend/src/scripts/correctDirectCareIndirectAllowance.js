/** Owner-requested correction. Preview first; apply only the reviewed state.
 * Updates editable handbook/digest/amendment drafts and zero rate settings.
 * Preserves issued/signed documents, posted payroll and employee submissions.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import {applyDirectCareIndirectCorrection,correctDirectCareIndirectText,DIRECT_CARE_INDIRECT_CORRECTION_SLUG,DIRECT_CARE_INDIRECT_CORRECTION_HTML} from '../content/directCareIndirectCorrection.js';
import {renderAmendment} from '../content/itscoOctober2026Drafts.js';
import {directCareIndirectMinutes} from '../utils/serviceCreditPolicy.js';
dotenv.config({path:new URL('../../.env',import.meta.url),quiet:true});
const apply=process.argv.includes('--apply'),hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const parse=v=>typeof v==='string'?JSON.parse(v):v||{};
const db=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME});
try {
 await db.beginTransaction();
 const [versions]=await db.query('SELECT * FROM workplace_handbook_versions WHERE agency_id IN (2,6,377) AND is_draft=1 FOR UPDATE');
 if(versions.length!==3)throw Error('Expected one editable handbook for each of the three agencies.');
 const [sections]=await db.query('SELECT s.* FROM workplace_handbook_sections s JOIN workplace_handbook_versions v ON v.id=s.version_id WHERE v.agency_id IN (2,6,377) AND v.is_draft=1 ORDER BY s.id FOR UPDATE');
 const [digests]=await db.query("SELECT * FROM workplace_handbook_digests WHERE agency_id IN (2,6,377) AND status='draft' ORDER BY id DESC FOR UPDATE");
 const [entries]=await db.query("SELECT e.* FROM workplace_handbook_digest_entries e JOIN workplace_handbook_digests d ON d.id=e.digest_id WHERE d.agency_id IN (2,6,377) AND d.status='draft' ORDER BY e.id FOR UPDATE");
 const [rates]=await db.query('SELECT * FROM payroll_pay_system_rates WHERE (agency_id IN (2,6,377) OR category=1) AND auto_indirect_minutes_per_hour<10 FOR UPDATE');
 const [drafts]=await db.query("SELECT * FROM contract_generations WHERE agency_id IN (2,6,377) AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' ORDER BY id FOR UPDATE");
 const snapshot={versions,sections,digests,entries,rates,drafts},stateHash=hash(snapshot),changes=[];
 for(const version of versions){
  const before=sections.filter(s=>s.version_id===version.id);
  const source={sections:before.map(s=>({slug:s.slug,title:s.title,bodyHtml:s.body_html,status:s.content_status,parentSlug:s.parent_slug,sourcePage:s.source_page}))};
  applyDirectCareIndirectCorrection(source);
  for(const section of source.sections){const old=before.find(s=>s.slug===section.slug);if(!old||section.bodyHtml!==old.body_html||section.title!==old.title)changes.push({version,old,section});}
 }
 const entryChanges=entries.map(e=>({...e,changed_content:correctDirectCareIndirectText(e.changed_content)})).filter(e=>e.changed_content!==entries.find(old=>old.id===e.id).changed_content);
 const draftChanges=drafts.map(d=>{const data=parse(d.token_values_json);if(data.schedule)data.schedule.autoIndirectMinutes=directCareIndirectMinutes(data.schedule.autoIndirectMinutes);return {id:d.id,data,html:renderAmendment(data)};}).filter(d=>d.html!==drafts.find(old=>old.id===d.id).rendered_html||JSON.stringify(d.data)!==JSON.stringify(parse(drafts.find(old=>old.id===d.id).token_values_json)));
 const additions=versions.map(v=>{const digest=digests.find(d=>d.agency_id===v.agency_id);if(!digest)throw Error(`No editable digest for agency ${v.agency_id}.`);return {digest,entry:entries.find(e=>e.digest_id===digest.id&&e.handbook_section_slug===DIRECT_CARE_INDIRECT_CORRECTION_SLUG)};});
 const report={mode:apply?'applied':'dry-run',stateHash,sections:changes.map(c=>({agencyId:c.version.agency_id,versionId:c.version.id,slug:c.section.slug})),rateRows:rates.map(r=>({agencyId:r.agency_id,category:r.category,level:r.level,before:r.auto_indirect_minutes_per_hour,after:10})),unissuedDraftIds:draftChanges.map(d=>d.id),digestEntriesChanged:entryChanges.length,correctionDigestIds:additions.map(a=>a.digest.id),issuedDocumentsChanged:0,postedPayrollChanged:0,messagesSent:0};
 if(apply){
  if(process.env.EXPECTED_STATE_HASH!==stateHash)throw Error('Database state changed; review a fresh dry run.');
  if(!process.env.UPDATE_BACKUP_PATH)throw Error('Provide an exclusive private backup path.');
  fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify(snapshot,null,2),{mode:0o600,flag:'wx'});
  for(const {version,old,section} of changes){
   if(old)await db.execute('UPDATE workplace_handbook_sections SET body_html=?,title=? WHERE id=? AND version_id=?',[section.bodyHtml,section.title,old.id,version.id]);
   else await db.execute("INSERT INTO workplace_handbook_sections(version_id,agency_id,sort_order,slug,title,body_html,parent_slug,content_status) VALUES(?,?,?,?,?,?,NULL,'ready')",[version.id,version.agency_id,Math.max(0,...sections.filter(s=>s.version_id===version.id).map(s=>Number(s.sort_order)||0))+1,section.slug,section.title,section.bodyHtml]);
  }
  for(const r of rates)await db.execute('UPDATE payroll_pay_system_rates SET auto_indirect_minutes_per_hour=10 WHERE agency_id=? AND category=? AND level=?',[r.agency_id,r.category,r.level]);
  for(const e of entryChanges)await db.execute('UPDATE workplace_handbook_digest_entries SET changed_content=? WHERE id=? AND digest_id=?',[e.changed_content,e.id,e.digest_id]);
  for(const {digest,entry} of additions){
   const title='Automatic indirect pay for all approved Direct Care services';
   const rationale='Correct the unintended Category 1 exclusion. All compensation categories receive 10 automatic indirect minutes per approved Direct Care hour equivalent, with prior-period reconciliation and individual payroll notice; no employee resubmission is required.';
   if(entry)await db.execute('UPDATE workplace_handbook_digest_entries SET subject=?,rationale=?,changed_content=? WHERE id=?',[title,rationale,DIRECT_CARE_INDIRECT_CORRECTION_HTML,entry.id]);
   else await db.execute("INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,sort_order,subject,rationale,changed_content,handbook_section_slug,change_kind,previous_content) VALUES(?,?,?,?,?,?,?,'added',?)",[digest.id,digest.agency_id,Math.max(0,...entries.filter(e=>e.digest_id===digest.id).map(e=>Number(e.sort_order)||0))+1,title,rationale,DIRECT_CARE_INDIRECT_CORRECTION_HTML,DIRECT_CARE_INDIRECT_CORRECTION_SLUG,changes.filter(c=>c.version.agency_id===digest.agency_id&&c.old).map(c=>`<h3>${c.old.title}</h3>${c.old.body_html}`).join('\n')]);
  }
  for(const d of draftChanges)await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(d.data),d.html,d.id]);
  await db.commit();
 }else await db.rollback();
 console.log(JSON.stringify(report,null,2));
}catch(error){await db.rollback();throw error;}finally{await db.end();}
