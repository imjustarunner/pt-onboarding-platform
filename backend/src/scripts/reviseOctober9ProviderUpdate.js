/** Requested edits to existing drafts only. No sends, signatures, or employee/pay changes.
 * Usage: UPDATE_BACKUP_PATH=/private/path.json node ... --apply (omit for dry run). */
import fs from 'node:fs';
import pool from '../config/database.js';
import {itscoRevisionTopics} from '../content/october2026UpdateRevisions.js';
import {itscoSuggestedTopicEdits} from '../content/itscoOctober2026SuggestedEdits.js';
import {staffMilestones} from '../services/staffMilestonePresentation.service.js';
const apply=process.argv.includes('--apply');
const staff=await staffMilestones(2);
const wanted=['people_since_march','anniversaries','schools_since_march','spanish_intake','office_kiosk','tasks_my_work','notes_workspace','supervision','quick_view'];
const revisions=new Map(itscoRevisionTopics(staff).filter(t=>wanted.includes(t.key)).map(t=>[t.key,t]));
for(const key of wanted)if(!revisions.has(key)&&itscoSuggestedTopicEdits[key])revisions.set(key,itscoSuggestedTopicEdits[key]);
const db=await pool.getConnection();
try {
 await db.beginTransaction();
 const [[update]]=await db.execute('SELECT * FROM admin_updates WHERE id=1 AND agency_id=2 FOR UPDATE');
 if(update?.status!=='draft')throw new Error('The ITSCO update is no longer a draft.');
 const [topics]=await db.execute('SELECT * FROM admin_update_topics WHERE update_id=1 FOR UPDATE');
 for(const key of wanted){const topic=topics.find(t=>t.topic_key===key);if(!topic)throw new Error(`Missing topic ${key}`);
   if(/<(?:video|iframe)\b|data-training-key/i.test(topic.body_html||''))throw new Error(`Preserve attached training media before replacing ${key}.`);
 }
 const [[version]]=await db.execute('SELECT id FROM workplace_handbook_versions WHERE agency_id=2 AND is_draft=1 ORDER BY id DESC LIMIT 1 FOR UPDATE');
 const [sections]=version?await db.execute("SELECT * FROM workplace_handbook_sections WHERE version_id=? AND slug='spanish-language-intake' FOR UPDATE",[version.id]):[[]];
 const [[digest]]=await db.execute("SELECT id FROM workplace_handbook_digests WHERE agency_id=2 AND admin_update_id=1 AND status='draft' ORDER BY id DESC LIMIT 1 FOR UPDATE");
 const [entries]=digest?await db.execute('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=? FOR UPDATE',[digest.id]):[[]];
 if(apply){
  if(!process.env.UPDATE_BACKUP_PATH)throw new Error('Set UPDATE_BACKUP_PATH before applying.');
  fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({update,topics,version,sections,digest,entries},null,2),{mode:0o600,flag:'wx'});
  for(const [key,t] of revisions)await db.execute('UPDATE admin_update_topics SET title=?,body_html=? WHERE update_id=1 AND topic_key=?',[t.title,t.body,key]);
  await db.execute("UPDATE admin_update_topics SET enabled=0 WHERE update_id=1 AND topic_key IN ('compensation_october','private_virtual_rooms')");
  const ordered=topics.filter(t=>!['therapynotes_transition','google_transition'].includes(t.topic_key)).sort((a,b)=>a.sort_order-b.sort_order);
  const spanishAt=ordered.findIndex(t=>t.topic_key==='spanish_intake');
  ordered.splice(Math.max(0,spanishAt),0,...['therapynotes_transition','google_transition'].map(key=>topics.find(t=>t.topic_key===key)).filter(Boolean));
  for(const [index,topic] of ordered.entries())await db.execute('UPDATE admin_update_topics SET sort_order=? WHERE id=?',[index,topic.id]);
  const intro=update.intro_html.replace(/(?:Your )?Active review time[^.]*\./ig,'').trim();
  await db.execute('UPDATE admin_updates SET intro_html=? WHERE id=1',[intro]);
  const welcome=topics.find(t=>t.topic_key==='welcome_october');
  if(welcome)await db.execute('UPDATE admin_update_topics SET body_html=? WHERE id=?',[welcome.body_html.replace(/Record the time spent completing required updates through the designated paid support-work process\./g,''),welcome.id]);
  for(const section of sections){
   await db.execute('UPDATE workplace_handbook_sections SET body_html=? WHERE id=? AND version_id=?',[itscoSuggestedTopicEdits.spanish_intake.body,section.id,version.id]);
   for(const entry of entries.filter(e=>e.subject===section.title))await db.execute('UPDATE workplace_handbook_digest_entries SET changed_content=? WHERE id=? AND digest_id=?',[itscoSuggestedTopicEdits.spanish_intake.body,entry.id,digest.id]);
  }
  await db.commit();
 }else await db.rollback();
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',adminUpdateId:1,topics:[...revisions.keys()],hidden:['compensation_october','private_virtual_rooms'],handbookSections:sections.length,messagesSent:0}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
