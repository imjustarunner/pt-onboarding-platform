/** Owner-requested revisions. Drafts only; no invitations, signatures, messages or payroll activation. */
import fs from 'node:fs';
import crypto from 'node:crypto';
import pool from '../config/database.js';
import {itscoRevisionTopics,nextLevelUpTopics,UPDATE_PALETTE,spanishIntakeProcedure,businessCards,kioskTopic} from '../content/october2026UpdateRevisions.js';
import {createProviderUpdatePreviewLink} from '../services/providerUpdatePreviewLink.service.js';
import {defaultSectionConfig} from '../constants/providerUpdateSections.js';
const author=501;
const read=async(sql,p=[])=>JSON.parse(JSON.stringify((await pool.execute(sql,p))[0]));
async function main(){
 const staff=await read(`SELECT u.id,u.first_name,u.last_name,u.title,u.credential,u.status FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=2`);
 const nlu=await read(`SELECT u.id,u.first_name,u.last_name,u.status,u.terminated_at FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=6 AND COALESCE(u.is_demo,0)=0 AND COALESCE(u.created_via_dev_fill,0)=0 AND u.role NOT IN ('school_staff','client_guardian','kiosk')`);
 const revisions=itscoRevisionTopics(staff);
 const nluTopics=nextLevelUpTopics({departures:nlu.filter(u=>u.terminated_at&&String(u.terminated_at).slice(0,10)>='2026-04-01'&&!['ACTIVE_EMPLOYEE','PROSPECTIVE','PENDING_SETUP'].includes(u.status))});
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'dry-run',itscoTopics:revisions.length,nluTopics:nluTopics.length}));return;}
 const db=await pool.getConnection();let nluUpdateId,nluPushId;
 const backup={};
 async function topic(updateId,t,index){const [[existing]]=await db.execute('SELECT id FROM admin_update_topics WHERE update_id=? AND topic_key=?',[updateId,t.key]);if(existing){await db.execute('UPDATE admin_update_topics SET title=?,body_html=?,icon_key=?,enabled=1 WHERE id=?',[t.title,t.body,t.icon,existing.id]);}else await db.execute(`INSERT INTO admin_update_topics(update_id,topic_key,enabled,title,description,icon_key,color,sort_order,body_html,is_builtin) VALUES (?,?,1,?,'',?,?,?,?,0)`,[updateId,t.key,t.title,t.icon,UPDATE_PALETTE[index%UPDATE_PALETTE.length],index,t.body]);}
 try{
  await db.beginTransaction();
  const [[itsco]]=await db.execute('SELECT * FROM admin_updates WHERE id=1 AND agency_id=2 FOR UPDATE');
  if(itsco?.status!=='draft')throw new Error('ITSCO update is no longer a draft.');
  backup.itsco=itsco;backup.topics=(await db.execute('SELECT * FROM admin_update_topics WHERE update_id=1'))[0];
  for(const [i,t] of revisions.entries())await topic(1,t,20+i);
  for(const [key,path,label] of [['auricwell','/assets/auricwell-session-logo.png','AuricWell'],['schoolcarebridge','/assets/schoolcarebridge/logo.png','SchoolCareBridge']]){
   const [[t]]=await db.execute('SELECT id,body_html FROM admin_update_topics WHERE update_id=1 AND topic_key=?',[key]);
   if(t&&!t.body_html.includes(path))await db.execute('UPDATE admin_update_topics SET body_html=? WHERE id=?',[`<p><img src="https://app.itsco.health${path}" alt="${label}" width="230" /></p>${t.body_html}`,t.id]);
  }
  const order=['welcome_october','people_since_march','credentials_roles','anniversaries','schools_since_march','spanish_intake','compensation_october','schoolcarebridge','auricwell','office_kiosk','tasks_my_work','notes_workspace','supervision','availability_profiles','business_cards','communication_rollout','private_virtual_rooms','therapynotes_transition','google_transition','quick_view','terms_links'];
  for(const [i,key] of order.entries())await db.execute('UPDATE admin_update_topics SET sort_order=?,color=? WHERE update_id=1 AND topic_key=?',[i,UPDATE_PALETTE[i%UPDATE_PALETTE.length],key]);
  // Snapshot lists are intentionally tenant-curated; do not append global-status departures automatically.
  await db.execute("UPDATE admin_update_topics SET enabled=0 WHERE update_id=1 AND topic_key IN ('staffing','departures')");
  let [[update]]=await db.execute("SELECT id,status FROM admin_updates WHERE agency_id=6 AND title='Next Level Up · October 2026 — Our next chapter' FOR UPDATE");
  if(update&&update.status!=='draft')throw new Error('NLU update is no longer a draft.');
  if(!update){const [ins]=await db.execute(`INSERT INTO admin_updates(agency_id,created_by_user_id,title,subtitle,greeting,intro_html,status,public_token,delivery_mode,push_splash) VALUES (6,?,'Next Level Up · October 2026 — Our next chapter',?,'Hello NLU team,',?,'draft',?,'html',0)`,[author,'Your people, programs and work tools.','Welcome to NLU’s October roundup. Review the changes below and complete the remaining steps in this same staff update invitation.',crypto.randomBytes(24).toString('hex')]);update={id:ins.insertId};}
  nluUpdateId=update.id;for(const [i,t]of nluTopics.entries())await topic(nluUpdateId,t,i);
  const config=defaultSectionConfig();config.spanish_intake=true;
  const nluConfig={...config,license:false,supervision_hours:false,school_availability:false,client_fall_update:false,amendments:false};
  let [[push]]=await db.execute("SELECT id FROM provider_update_pushes WHERE agency_id=6 AND title='NLU Staff Update — October 2026' AND status='draft' FOR UPDATE");
  if(!push){const [ins]=await db.execute(`INSERT INTO provider_update_pushes(agency_id,title,status,section_config_json,notes,created_by_user_id,attached_admin_update_id) VALUES(6,'NLU Staff Update — October 2026','draft',?,?,?,?)`,[JSON.stringify(nluConfig),'Private editable draft. NLU pay levels/rates and individualized amendments require completion; ITSCO compensation terms are not copied.',author,nluUpdateId]);push={id:ins.insertId};}
  nluPushId=push.id;
  await db.execute("UPDATE provider_update_pushes SET section_config_json=JSON_SET(section_config_json,'$.spanish_intake',true) WHERE agency_id=2 AND id IN (1,2) AND status='draft'");
  for(const [aid,updateId,pushId]of [[2,1,2],[6,nluUpdateId,nluPushId]]){
   let [[doc]]=await db.execute('SELECT * FROM workplace_handbook_documents WHERE agency_id=?',[aid]);
   if(!doc){const [ins]=await db.execute('INSERT INTO workplace_handbook_documents(agency_id,title) VALUES (?,?)',[aid,aid===2?'ITSCO Workplace Handbook':'NLU Workplace Handbook']);doc={id:ins.insertId};}
   let [[version]]=await db.execute('SELECT id FROM workplace_handbook_versions WHERE document_id=? AND is_draft=1 ORDER BY version_number DESC LIMIT 1',[doc.id]);
   if(!version){const [[v]]=await db.execute('SELECT COALESCE(MAX(version_number),0)+1 AS n FROM workplace_handbook_versions WHERE document_id=?',[doc.id]);const [ins]=await db.execute('INSERT INTO workplace_handbook_versions(document_id,agency_id,version_number,is_draft,changelog) VALUES (?,?,?,1,?)',[doc.id,aid,v.n,'October intake, profile and kiosk procedures']);version={id:ins.insertId};}
   let [[digest]]=await db.execute("SELECT id FROM workplace_handbook_digests WHERE agency_id=? AND admin_update_id=? AND status='draft' ORDER BY id DESC LIMIT 1",[aid,updateId]);
   if(!digest){const [ins]=await db.execute(`INSERT INTO workplace_handbook_digests(agency_id,title,period_label,admin_update_id,provider_update_push_id,status,notes) VALUES (?,?,'October 2026',?,?,'draft',?)`,[aid,'October 2026 · Workplace procedures',updateId,pushId,'Editable draft; confirm NLU-specific pay terms before issuing a separate amendment.']);digest={id:ins.insertId};}
   const sections=[['spanish-language-intake','Spanish-language intake and handoff',spanishIntakeProcedure],['business-cards-and-public-profiles','Business cards and public profiles',aid===2?revisions.find(t=>t.key==='business_cards').body:businessCards],['office-kiosk-procedures','Office kiosk and client arrivals',aid===6?kioskTopic.body.replace('/itsco/kiosk','/nlu/kiosk'):kioskTopic.body]];
   for(const [i,[slug,title,body]]of sections.entries()){
    const [[section]]=await db.execute('SELECT id FROM workplace_handbook_sections WHERE version_id=? AND slug=?',[version.id,slug]);
    if(section)await db.execute('UPDATE workplace_handbook_sections SET body_html=? WHERE id=?',[body,section.id]);else await db.execute('INSERT INTO workplace_handbook_sections(version_id,agency_id,sort_order,slug,title,body_html) VALUES (?,?,?,?,?,?)',[version.id,aid,150+i,slug,title,body]);
    const [[entry]]=await db.execute('SELECT id FROM workplace_handbook_digest_entries WHERE digest_id=? AND subject=?',[digest.id,title]);
    if(entry)await db.execute('UPDATE workplace_handbook_digest_entries SET changed_content=? WHERE id=?',[body,entry.id]);else await db.execute('INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,sort_order,subject,rationale,changed_content) VALUES (?,?,?,?,?,?)',[digest.id,aid,50+i,title,'Give staff a clear shared procedure in the app and handbook.',body]);
   }
  }
  await db.execute(`UPDATE contract_generations SET token_values_json=JSON_SET(token_values_json,'$.countersignerUserId',3,'$.countersignerName','Haley Inyart') WHERE agency_id=2 AND task_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation'`);
  fs.writeFileSync('/tmp/pt-october-revision-backup.json',JSON.stringify(backup,null,2),{mode:0o600});
  await db.commit();
 }catch(e){await db.rollback();throw e;}finally{db.release();}
 let [existing]=await pool.execute("SELECT token,expires_at FROM provider_update_recipients WHERE agency_id=6 AND provider_user_id=532 AND LEFT(token,8)='preview_' AND expires_at>NOW() ORDER BY id DESC LIMIT 1");
 let preview=existing[0];
 if(!preview)preview=await createProviderUpdatePreviewLink({agencyId:6,providerUserId:532,createdByUserId:author,title:'NLU October 2026 · Kimi review',sectionConfig:{...defaultSectionConfig(),spanish_intake:true,license:false,supervision_hours:false,school_availability:false,client_fall_update:false,amendments:false},attachedAdminUpdateId:nluUpdateId});
 fs.writeFileSync('/tmp/nlu-kimi-provider-update-preview.json',JSON.stringify({...preview,url:`https://app.itsco.health/nlu/provider-update/${preview.token}`},null,2),{mode:0o600});
 console.log(JSON.stringify({mode:'drafts-only',itscoUpdateId:1,nluUpdateId,nluPushId,kimiPreviewSaved:true,messagesSent:0,signatureTasksCreated:0,payrollChanged:false}));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
