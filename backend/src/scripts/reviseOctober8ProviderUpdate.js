/** Dry-run by default. --apply updates only the named drafts and Megan's public
 * display label, never her job title, sends, invitations, signatures or payroll. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {staffMilestones,fillStaffMarkers} from '../services/staffMilestonePresentation.service.js';
import {itscoRevisionTopics} from '../content/october2026UpdateRevisions.js';
import {renderAdminUpdateHtml} from '../services/adminUpdate.service.js';
async function main(){
 const staff=await staffMilestones(2);
 const emmi=staff.filter(s=>s.first_name==='Emmi'&&s.last_name==='Regenbogen');
 if(emmi.length!==1)throw new Error('Emmi Regenbogen must resolve to exactly one ITSCO staff record. No draft changes were made.');
 const keys=['people_since_march','credentials_roles','anniversaries'];
 const revisions=itscoRevisionTopics(staff).filter(t=>keys.includes(t.key));
 const [[update]]=await pool.execute("SELECT * FROM admin_updates WHERE id=1 AND agency_id=2 AND status='draft'");
 if(!update)throw new Error('ITSCO update is not an editable draft.');
 const [topics]=await pool.execute('SELECT * FROM admin_update_topics WHERE update_id=1 ORDER BY sort_order,id');
 const intro='Your Admin Update is included in this Provider Update invitation. Review the news here, then continue through your personal update steps. Your active review time is tracked and submitted for payroll review at your support activity rate when you finish.';
 for(const topic of topics){const replacement=revisions.find(t=>t.key===topic.topic_key);if(replacement){topic.body_html=replacement.body;topic.title=replacement.title;}topic.rendered_body_html=fillStaffMarkers(topic.body_html,staff);}
 const reviewed={...update,intro_html:intro,support_title:'Need help with the app?',support_body:'Use Need help in your Provider Update to submit a Technology support ticket. You may attach screenshots. General ITSCO support: support@itsco.health.',support_email:'support@itsco.health',topics};
 const output=process.env.UPDATE_REVIEW_OUTPUT;
 if(output)fs.writeFileSync(output,renderAdminUpdateHtml(reviewed,{name:'ITSCO'},{layout:'web'}),{mode:0o600});
 if(!process.argv.includes('--apply')){console.log(JSON.stringify({mode:'dry-run',topics:keys,emmiUserId:emmi[0].id,staffPhotos:staff.filter(s=>s.profile_photo_path).length,previewSaved:!!output,liveWrites:0}));return;}
 const db=await pool.getConnection();
 try{
  await db.beginTransaction();
  const [[locked]]=await db.execute("SELECT status FROM admin_updates WHERE id=1 AND agency_id=2 FOR UPDATE");
  if(locked?.status!=='draft')throw new Error('ITSCO update is no longer a draft.');
  for(const t of revisions)await db.execute('UPDATE admin_update_topics SET title=?,body_html=? WHERE update_id=1 AND topic_key=?',[t.title,t.body,t.key]);
  await db.execute('UPDATE admin_updates SET intro_html=?,support_title=?,support_body=?,support_email=? WHERE id=1',[intro,reviewed.support_title,reviewed.support_body,reviewed.support_email]);
  await db.execute("UPDATE admin_updates SET intro_html=REPLACE(intro_html,'complete your own staff update when invited.','complete the remaining steps in this same staff update invitation.') WHERE agency_id=6 AND id=2 AND status='draft'");
  await db.execute(`INSERT INTO provider_public_profiles(user_id,public_details_json) VALUES(496,JSON_OBJECT('agencyDisplayLabels',JSON_OBJECT('2','Counselor')))
    ON DUPLICATE KEY UPDATE public_details_json=JSON_SET(COALESCE(public_details_json,JSON_OBJECT()),'$.agencyDisplayLabels',JSON_MERGE_PATCH(COALESCE(JSON_EXTRACT(public_details_json,'$.agencyDisplayLabels'),JSON_OBJECT()),JSON_OBJECT('2','Counselor')))`);
  await db.commit();console.log(JSON.stringify({mode:'applied-drafts',messagesSent:0,payrollChanged:false}));
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
