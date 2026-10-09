/** Refresh only NLU drafts. Never schedules/sends invitations or changes pay. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {nluRefreshSections,nluRefreshAudience,nluRefreshTopics,nluRolloutNote} from '../content/nluProviderUpdateRefresh.js';
import {UPDATE_PALETTE} from '../content/october2026UpdateRevisions.js';
const apply=process.argv.includes('--apply'),db=await pool.getConnection();
try{
 await db.beginTransaction();
 const [[update]]=await db.execute("SELECT * FROM admin_updates WHERE agency_id=6 AND id=2 FOR UPDATE");
 if(update?.status!=='draft')throw new Error('NLU administrative update must still be a draft.');
 const [topics]=await db.execute('SELECT * FROM admin_update_topics WHERE update_id=? FOR UPDATE',[update.id]);
 const [pushes]=await db.execute('SELECT * FROM provider_update_pushes WHERE agency_id=6 AND attached_admin_update_id=? FOR UPDATE',[update.id]);
 if(pushes.some(p=>p.status!=='draft'))throw new Error('A linked NLU update has already been issued; preserve it.');
 const [recipients]=await db.execute('SELECT r.* FROM provider_update_recipients r JOIN provider_update_pushes p ON p.id=r.push_id WHERE p.agency_id=6 AND p.attached_admin_update_id=?',[update.id]);
 if(recipients.some(r=>!String(r.token).startsWith('preview_')))throw new Error('A real invitation already exists; preserve its configuration.');
 const [[version]]=await db.execute('SELECT id FROM workplace_handbook_versions WHERE agency_id=6 AND is_draft=1 ORDER BY id DESC LIMIT 1 FOR UPDATE');
 const [sections]=version?await db.execute('SELECT * FROM workplace_handbook_sections WHERE version_id=? FOR UPDATE',[version.id]):[[]];
 const [[digest]]=await db.execute("SELECT id FROM workplace_handbook_digests WHERE agency_id=6 AND admin_update_id=? AND status='draft' ORDER BY id DESC LIMIT 1 FOR UPDATE",[update.id]);
 const [entries]=digest?await db.execute('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=? FOR UPDATE',[digest.id]):[[]];
 const changes=nluRefreshTopics();
 for(const t of topics.filter(t=>changes.some(c=>c.key===t.topic_key)))if(/<(?:video|iframe)\b|data-training-key/i.test(t.body_html||''))throw new Error('Preserve attached training media before replacing '+t.topic_key);
 if(apply){
  if(!process.env.UPDATE_BACKUP_PATH)throw new Error('Set a new backup path.');
  fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({update,topics,pushes,recipients,version,sections,digest,entries},null,2),{mode:0o600,flag:'wx'});
  for(const [index,t]of changes.entries()){
   const old=topics.find(x=>x.topic_key===t.key);
   if(old)await db.execute('UPDATE admin_update_topics SET title=?,body_html=?,enabled=1 WHERE id=? AND update_id=?',[t.title,t.body,old.id,update.id]);
   else await db.execute(`INSERT INTO admin_update_topics(update_id,topic_key,enabled,title,description,icon_key,color,sort_order,body_html,is_builtin) VALUES (?,?,1,?,'',?,?,?,?,0)`,[update.id,t.key,t.title,t.icon,UPDATE_PALETTE[index%UPDATE_PALETTE.length],index,t.body]);
  }
  await db.execute("UPDATE admin_update_topics SET enabled=0 WHERE update_id=? AND topic_key IN ('compensation','compensation_october','private_virtual_rooms','schoolcarebridge','auricwell')",[update.id]);
  const order=['welcome','people','programs','profile','availability_profiles','business_cards','office_kiosk','tasks_my_work','notes_workspace','supervision','quick_view','communications','library_transition','spanish_intake','school_assignments','terms'];
  for(const [i,key]of order.entries())await db.execute('UPDATE admin_update_topics SET sort_order=?,color=? WHERE update_id=? AND topic_key=?',[i,UPDATE_PALETTE[i%UPDATE_PALETTE.length],update.id,key]);
  for(const push of pushes){
   const config={...nluRefreshSections()};
   await db.execute('UPDATE provider_update_pushes SET section_config_json=?,section_audience_json=?,notes=? WHERE id=? AND agency_id=6 AND status=\'draft\'',[JSON.stringify(config),JSON.stringify(nluRefreshAudience),`${push.title.startsWith('[PREVIEW]')?'Read-only preview. No invitation sent. ':''}${nluRolloutNote}`,push.id]);
  }
  for(const [i,t]of changes.filter(t=>['spanish_intake','business_cards','office_kiosk','communications','availability_profiles','quick_view','tasks_my_work'].includes(t.key)).entries())if(version){
   const slug={spanish_intake:'spanish-language-intake',business_cards:'business-cards-and-public-profiles',office_kiosk:'office-kiosk-procedures'}[t.key]||`provider-update-${t.key.replaceAll('_','-')}`;
   const old=sections.find(s=>s.slug===slug);
   if(old)await db.execute('UPDATE workplace_handbook_sections SET body_html=? WHERE id=? AND version_id=?',[t.body,old.id,version.id]);
   else await db.execute('INSERT INTO workplace_handbook_sections(version_id,agency_id,sort_order,slug,title,body_html) VALUES (?,6,?,?,?,?)',[version.id,180+i,slug,t.title,t.body]);
   if(digest){const prior=entries.find(e=>e.subject===(old?.title||t.title));
    if(prior)await db.execute('UPDATE workplace_handbook_digest_entries SET changed_content=?,rationale=? WHERE id=? AND digest_id=?',[t.body,'Align staff procedures with the current provider update.',prior.id,digest.id]);
    else await db.execute('INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,sort_order,subject,rationale,changed_content) VALUES (?,6,?,?,?,?)',[digest.id,180+i,old?.title||t.title,'Align staff procedures with the current provider update.',t.body]);
   }
  }
  await db.commit();
 }else await db.rollback();
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',agencyId:6,adminUpdateId:update.id,pushIds:pushes.map(p=>p.id),topics:changes.map(t=>t.key),handbookDraft:version?.id,rollout:'Draft held; possible two-week delay, date unconfirmed',invitationsSent:0,payChanges:0}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
