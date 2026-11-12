/** Owner-requested draft edits. Never publishes, issues contracts, or activates payroll. */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import {applyProviderRolesNovemberPolicy,PROVIDER_ROLES_RELEASE} from '../content/providerRolesNovember2026.js';
import {validateHandbookSections,cleanHandbookHtml} from '../services/workplaceHandbookContent.js';
import {handbookTenant} from '../services/handbookTenant.js';

dotenv.config({path:new URL('../../.env',import.meta.url),quiet:true});
const option=name=>process.argv.find(arg=>arg.startsWith(`--${name}=`))?.slice(name.length+3);
const apply=process.argv.includes('--apply');
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const db=await mysql.createConnection({host:process.env.DB_HOST||'127.0.0.1',port:Number(process.env.DB_PORT||3307),user:process.env.DB_USER,password:process.env.DB_PASSWORD,database:process.env.DB_NAME,timezone:'Z'});
try {
 await db.beginTransaction();
 const [agencies]=await db.query("SELECT id,slug,name FROM agencies WHERE slug IN ('itsco','nlu','tisi') ORDER BY id");
 if(agencies.length!==3)throw Error('Expected the three explicit target agencies.');
 const snapshots=[];
 for(const agency of agencies) {
  const [[document]]=await db.query('SELECT * FROM workplace_handbook_documents WHERE agency_id=? FOR UPDATE',[agency.id]);
  const [versions]=await db.query('SELECT * FROM workplace_handbook_versions WHERE document_id=? AND is_draft=1 FOR UPDATE',[document.id]);
  if(versions.length!==1)throw Error(`Expected one editable handbook draft for ${agency.slug}.`);
  const version=versions[0];
  const [sections]=await db.query('SELECT * FROM workplace_handbook_sections WHERE version_id=? ORDER BY sort_order,id FOR UPDATE',[version.id]);
  const [digests]=await db.query("SELECT * FROM workplace_handbook_digests WHERE agency_id=? AND period_label='November 2026' AND status='draft' FOR UPDATE",[agency.id]);
  if(digests.length>1)throw Error(`Multiple November drafts for ${agency.slug} require reconciliation.`);
  const digest=digests[0]||null;
  const [entries]=digest?await db.query('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=? ORDER BY sort_order,id FOR UPDATE',[digest.id]):[[]];
  snapshots.push({agency,document,version,sections,digest,entries});
 }
 const stateHash=hash(snapshots);
 const plans=snapshots.map(snapshot=>{
  const {agency,sections,entries}=snapshot;
  const source={sections:sections.map(row=>({databaseId:row.id,slug:row.slug,title:row.title,bodyHtml:row.body_html,status:row.content_status,parentSlug:row.parent_slug,sourcePage:row.source_page}))};
  const {updates}=applyProviderRolesNovemberPolicy(source,[],handbookTenant(agency));
  const prepared=source.sections.map((s,index)=>({...s,bodyHtml:cleanHandbookHtml(s.bodyHtml),sortOrder:index}));
  validateHandbookSections(prepared.map(s=>({slug:s.slug,title:s.title,parent_slug:s.parentSlug})));
  const changes=prepared.filter(s=>{
   const before=sections.find(row=>row.id===s.databaseId);
   return !before||before.slug!==s.slug||before.title!==s.title||before.body_html!==s.bodyHtml||(before.parent_slug||null)!==(s.parentSlug||null);
  });
  const digestChanges=updates.filter(update=>{
   const matches=entries.filter(row=>row.handbook_section_slug===update.handbook_section_slug);
   if(matches.length>1)throw Error(`Duplicate November section entry: ${agency.slug}/${update.handbook_section_slug}`);
   const before=matches[0];
   return !before||before.subject!==update.subject||before.rationale!==update.rationale||before.changed_content!==cleanHandbookHtml(update.changed_content);
  });
  return {...snapshot,changes,digestChanges};
 });
 const report={mode:apply?'applied':'dry-run',release:PROVIDER_ROLES_RELEASE,stateHash,agencies:plans.map(plan=>({agencyId:plan.agency.id,slug:plan.agency.slug,versionId:plan.version.id,sectionChanges:plan.changes.map(s=>({id:s.databaseId||null,slug:s.slug,title:s.title})),digestId:plan.digest?.id||null,createNovemberDraft:!plan.digest,digestChanges:plan.digestChanges.map(u=>u.subject)})),messagesSent:0,contractsIssued:0,payrollActivated:false};
 if(apply) {
  if(option('expected-state')!==stateHash)throw Error('Handbook/digest state changed; inspect a fresh dry run.');
  if(!option('backup'))throw Error('A new private backup path is required.');
  const actor=Number(option('actor'));
  if(!Number.isSafeInteger(actor)||actor<=0)throw Error('An accountable actor is required.');
  fs.writeFileSync(option('backup'),JSON.stringify(snapshots,null,2),{mode:0o600,flag:'wx'});
  for(const plan of plans) {
   const {agency,version,sections,entries}=plan;
   let sectionOrder=Math.max(0,...sections.map(s=>Number(s.sort_order)||0));
   const orderedChanges=[...plan.changes].sort((a,b)=>{
    const x=Number(a.slug.match(/^compensation-rate-category-(\d)$/)?.[1]||0),y=Number(b.slug.match(/^compensation-rate-category-(\d)$/)?.[1]||0);
    return y-x;
   });
   for(const s of orderedChanges) {
    if(s.databaseId)await db.query('UPDATE workplace_handbook_sections SET slug=?,title=?,body_html=?,parent_slug=?,content_status=? WHERE id=? AND version_id=?',[s.slug,s.title,s.bodyHtml,s.parentSlug||null,s.status||'ready',s.databaseId,version.id]);
    else await db.query('INSERT INTO workplace_handbook_sections(version_id,agency_id,sort_order,slug,title,body_html,parent_slug,content_status) VALUES(?,?,?,?,?,?,?,?)',[version.id,agency.id,++sectionOrder,s.slug,s.title,s.bodyHtml,s.parentSlug||null,s.status||'ready']);
   }
   let digestId=plan.digest?.id;
   if(!digestId) {
    const [inserted]=await db.query("INSERT INTO workplace_handbook_digests(agency_id,title,period_label,status,notes) VALUES(?,'November 2026 Workplace Handbook Updates','November 2026','draft',?)",[agency.id,'Owner-requested provider-role and compensation changes. Review before publication or individual adoption.']);
    digestId=inserted.insertId;
   }
   let entryOrder=Math.max(0,...entries.map(e=>Number(e.sort_order)||0));
   for(const update of plan.digestChanges) {
    const before=entries.find(e=>e.handbook_section_slug===update.handbook_section_slug);
    const previous=plan.changes.filter(s=>s.slug===update.handbook_section_slug).map(s=>sections.find(row=>row.id===s.databaseId)?.body_html||'').join('\n');
    if(before)await db.query('UPDATE workplace_handbook_digest_entries SET subject=?,rationale=?,changed_content=? WHERE id=? AND digest_id=?',[update.subject,update.rationale,cleanHandbookHtml(update.changed_content),before.id,digestId]);
    else await db.query('INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,sort_order,subject,rationale,changed_content,handbook_section_slug,change_kind,previous_content) VALUES(?,?,?,?,?,?,?,?,?)',[digestId,agency.id,++entryOrder,update.subject,update.rationale,cleanHandbookHtml(update.changed_content),update.handbook_section_slug,previous?'updated':'added',previous]);
   }
   if(plan.changes.length||plan.digestChanges.length)await db.query("INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES('workplace_handbook_updated',?,?,?)",[actor,agency.id,JSON.stringify({release:PROVIDER_ROLES_RELEASE,versionId:version.id,digestId,sectionChanges:plan.changes.map(s=>s.slug),messagesSent:0,contractsIssued:0,payrollActivated:false})]);
   report.agencies.find(row=>row.agencyId===agency.id).digestId=digestId;
  }
  await db.commit();
 } else await db.rollback();
 console.log(JSON.stringify(report,null,2));
} catch(error) {await db.rollback();console.error(error.message);process.exitCode=1;}
finally {await db.end();}
