/** Explicit draft-only seeding. Does not publish, change rates or enable services. */
import fs from 'node:fs';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import {planTestingReferenceSeed,testingSeedHash} from '../services/testingReferenceSeed.service.js';
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const apply=process.argv.includes('--apply');
dotenv.config({path:option('env')||new URL('../../.env',import.meta.url),quiet:true});
const ids=(option('agencies')||'2,6,377,453,454').split(',').map(Number);
if(ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length)throw Error('Provide distinct valid agency IDs.');
const db=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,timezone:'Z'});
try {
 await db.query(apply?'START TRANSACTION':'START TRANSACTION READ ONLY');
 const lock=apply?' FOR UPDATE':'',snapshots=[];
 for(const agencyId of ids) {
  const [[agency]]=await db.query(`SELECT id,slug,name FROM agencies WHERE id=?${lock}`,[agencyId]);
  if(!agency)throw Error(`Agency ${agencyId} was not found.`);
  const [[document]]=await db.query(`SELECT * FROM workplace_handbook_documents WHERE agency_id=?${lock}`,[agencyId]);
  const [versions]=document?await db.query(`SELECT * FROM workplace_handbook_versions WHERE document_id=? ORDER BY version_number${lock}`,[document.id]):[[]];
  const drafts=versions.filter(v=>Number(v.is_draft)===1);
  if(drafts.length>1)throw Error(`Agency ${agencyId} has multiple editable drafts.`);
  const version=drafts[0]||null;
  // A missing draft can be cloned without changing its published base.
  const baseVersionId=version?.id||document?.published_version_id;
  const [sections]=baseVersionId?await db.query(`SELECT * FROM workplace_handbook_sections WHERE version_id=? ORDER BY sort_order,id${lock}`,[baseVersionId]):[[]];
  const [digests]=await db.query(`SELECT * FROM workplace_handbook_digests WHERE agency_id=? AND period_label='November 2026' AND status='draft'${lock}`,[agencyId]);
  if(digests.length>1)throw Error(`Agency ${agencyId} has multiple November drafts.`);
  const digest=digests[0]||null;
  const [entries]=digest?await db.query(`SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=? ORDER BY sort_order,id${lock}`,[digest.id]):[[]];
  snapshots.push({agency,document:document||null,versions,version,baseVersionId:baseVersionId||null,sections,digest,entries});
 }
 const stateHash=testingSeedHash(snapshots),plans=snapshots.map(planTestingReferenceSeed);
 const report={mode:apply?'applied':'dry-run',stateHash,agencies:plans.map((plan,i)=>({agencyId:plan.agency.id,slug:plan.agency.slug,createDocument:!snapshots[i].document,createDraft:!snapshots[i].version,createNovemberDraft:!snapshots[i].digest,sectionWrites:plan.sectionWrites.map(s=>s.slug),catalogCodes:plan.metadataAfter.testingReference.codes.map(d=>({code:d.code,bucket:d.bucket})),catalogChanged:plan.metadataChanged,digestWrite:plan.digestWrite,consolidatedDraftEntries:plan.removeDuplicateEntryIds.length})),publishedVersionsChanged:0,publishedDigestsChanged:0,payrollRulesChanged:0,ratesChanged:0,serviceGrantsChanged:0,messagesSent:0};
 if(apply) {
  if(option('expected-state')!==stateHash)throw Error('Draft state changed; review a fresh dry run before applying.');
  const actor=Number(option('actor'));
  if(!Number.isSafeInteger(actor)||actor<1)throw Error('An active accountable superadmin actor is required.');
  const [[owner]]=await db.query("SELECT id FROM users WHERE id=? AND role='super_admin' AND is_active=1",[actor]);
  if(!owner)throw Error('An active accountable superadmin actor is required.');
  if(!option('backup'))throw Error('A new private backup path is required.');
  fs.writeFileSync(option('backup'),JSON.stringify(snapshots,null,2),{mode:0o600,flag:'wx'});
  for(const [index,plan] of plans.entries()) {
   const snapshot=snapshots[index],agencyId=plan.agency.id;
   let documentId=snapshot.document?.id,versionId=snapshot.version?.id;
   if(!documentId){const [created]=await db.query('INSERT INTO workplace_handbook_documents(agency_id,title,draft_notes) VALUES(?,?,?)',[agencyId,`${plan.agency.name} Workplace Handbook`,'Testing reference draft; review before publication.']);documentId=created.insertId;}
   if(!versionId){
    const [created]=await db.query('INSERT INTO workplace_handbook_versions(document_id,agency_id,version_number,is_draft,changelog,metadata_json) VALUES(?,?,?,1,?,?)',[documentId,agencyId,Math.max(0,...snapshot.versions.map(v=>Number(v.version_number)))+1,'Owner-requested Testing references; draft only',JSON.stringify(plan.metadataAfter)]);versionId=created.insertId;
    // Copy all existing base content before targeted edits; published rows stay intact.
    if(snapshot.baseVersionId)await db.query('INSERT INTO workplace_handbook_sections(version_id,agency_id,sort_order,slug,title,body_html,parent_slug,content_status,source_page) SELECT ?,agency_id,sort_order,slug,title,body_html,parent_slug,content_status,source_page FROM workplace_handbook_sections WHERE version_id=?',[versionId,snapshot.baseVersionId]);
   }
   let order=Math.max(0,...snapshot.sections.map(s=>Number(s.sort_order)||0));
   for(const section of plan.sectionWrites) {
    const [[before]]=await db.query('SELECT id FROM workplace_handbook_sections WHERE version_id=? AND slug=?',[versionId,section.slug]);
    if(before)await db.query('UPDATE workplace_handbook_sections SET title=?,body_html=?,parent_slug=?,content_status=? WHERE id=? AND version_id=?',[section.title,section.bodyHtml,section.parentSlug,section.status,before.id,versionId]);
    else await db.query('INSERT INTO workplace_handbook_sections(version_id,agency_id,sort_order,slug,title,body_html,parent_slug,content_status) VALUES(?,?,?,?,?,?,?,?)',[versionId,agencyId,++order,section.slug,section.title,section.bodyHtml,section.parentSlug,section.status]);
   }
   if(plan.metadataChanged&&snapshot.version)await db.query('UPDATE workplace_handbook_versions SET metadata_json=? WHERE id=? AND is_draft=1',[JSON.stringify(plan.metadataAfter),versionId]);
   let digestId=snapshot.digest?.id;
   if(!digestId){const [created]=await db.query("INSERT INTO workplace_handbook_digests(agency_id,title,period_label,status,notes) VALUES(?,'November 2026 Workplace Handbook Updates','November 2026','draft','Owner-requested Testing reference; review before publication.')",[agencyId]);digestId=created.insertId;}
   if(plan.digestWrite) {
    const entry=plan.digestEntry;
    if(plan.digestEntryId)await db.query('UPDATE workplace_handbook_digest_entries SET subject=?,rationale=?,changed_content=?,handbook_section_slug=?,handbook_version_id=?,previous_content=? WHERE id=? AND digest_id=?',[entry.subject,entry.rationale,entry.changed_content,entry.handbook_section_slug,versionId,plan.previousTestingContent,plan.digestEntryId,digestId]);
    else await db.query('INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,sort_order,subject,rationale,changed_content,handbook_section_slug,handbook_version_id,change_kind,previous_content) VALUES(?,?,?,?,?,?,?,?,?,?)',[digestId,agencyId,Math.max(0,...snapshot.entries.map(e=>Number(e.sort_order)||0))+1,entry.subject,entry.rationale,entry.changed_content,entry.handbook_section_slug,versionId,'added',plan.previousTestingContent]);
    for(const entryId of plan.removeDuplicateEntryIds)await db.query('DELETE FROM workplace_handbook_digest_entries WHERE id=? AND digest_id=?',[entryId,digestId]);
   }
   if(!snapshot.version||plan.sectionWrites.length||plan.digestWrite||plan.metadataChanged)await db.query("INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES('workplace_handbook_updated',?,?,?)",[actor,agencyId,JSON.stringify({referenceVersion:plan.referenceVersion,versionId,digestId,sectionWrites:plan.sectionWrites.map(s=>s.slug),draftOnly:true,payrollActivated:false,ratesChanged:0,messagesSent:0})]);
   Object.assign(report.agencies[index],{versionId,digestId});
  }
  await db.commit();
 } else await db.rollback();
 console.log(JSON.stringify(report,null,2));
}catch(error){await db.rollback();console.error(error.message);process.exitCode=1;}finally{await db.end();}
