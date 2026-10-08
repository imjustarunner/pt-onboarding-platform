/** Refresh only unsent/editable ITSCO drafts. Never issue documents, send messages,
 * enroll payroll or alter signed terms. --apply requires an explicit backup path. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {conditionalLevelBonus} from '../utils/serviceCreditPolicy.js';
import {handbookSections,commonAmendmentClauses,renderAmendment,SERVICE_POLICY_VERSION} from '../content/itscoOctober2026Drafts.js';
import {octoberAdminTopics} from '../content/itscoOctober2026AdminUpdate.js';
import {renderAdminUpdateHtml} from '../services/adminUpdate.service.js';
import {staffMilestones,fillStaffMarkers} from '../services/staffMilestonePresentation.service.js';
import {itscoRevisionTopics} from '../content/october2026UpdateRevisions.js';
const parse=v=>typeof v==='string'?JSON.parse(v):v;
const apply=process.argv.includes('--apply');
async function main(){
 const db=await pool.getConnection();
 try {
  await db.beginTransaction();
  const [[update]]=await db.execute("SELECT * FROM admin_updates WHERE id=1 AND agency_id=2 FOR UPDATE");
  if(update?.status!=='draft')throw new Error('ITSCO Admin Update is no longer an editable draft.');
  const [topics]=await db.execute('SELECT * FROM admin_update_topics WHERE update_id=1 ORDER BY sort_order,id');
  const [[version]]=await db.execute('SELECT * FROM workplace_handbook_versions WHERE agency_id=2 AND is_draft=1 ORDER BY id DESC LIMIT 1 FOR UPDATE');
  if(!version)throw new Error('An editable handbook draft is required.');
  const [oldSections]=await db.execute('SELECT * FROM workplace_handbook_sections WHERE version_id=?',[version.id]);
  const [generations]=await db.execute(`SELECT * FROM contract_generations WHERE agency_id=2 AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE`);
  const [rates]=await db.execute('SELECT * FROM payroll_pay_system_rates WHERE agency_id=2');
  const [rules]=await db.execute('SELECT * FROM payroll_service_code_rules WHERE agency_id=2');
  const [[digest]]=await db.execute("SELECT * FROM workplace_handbook_digests WHERE agency_id=2 AND status='draft' AND admin_update_id=1 ORDER BY id DESC LIMIT 1 FOR UPDATE");
  if(!digest)throw new Error('Editable handbook change tracker required.');
  const [oldEntries]=await db.execute('SELECT * FROM workplace_handbook_digest_entries WHERE digest_id=?',[digest.id]);
  if(apply){
   if(!process.env.UPDATE_BACKUP_PATH)throw new Error('Set UPDATE_BACKUP_PATH before applying.');
   fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({update,topics,version,oldSections,generations,digest,oldEntries},null,2),{mode:0o600,flag:'wx'});
  }
  const staff=await staffMilestones(2);
  const revisions=itscoRevisionTopics(staff).filter(t=>['people_since_march','credentials_roles','anniversaries'].includes(t.key));
  const compensation=octoberAdminTopics().find(t=>t.key==='compensation_october');
  const intro='This Admin Update is included in your Provider Update invitation. Read or listen here, then continue through your personal update steps. Active review time is tracked and submitted for payroll review at your support activity rate when you finish.';
  update.title=update.title.replace(/\s*[—–-]?\s*together since march/ig,'').trim();update.intro_html=intro;
  update.support_title='Need help with the app?';update.support_body='Use Need help in your Provider Update to submit a Technology support ticket and attach screenshots. General ITSCO support: support@itsco.health.';update.support_email='support@itsco.health';
  for(const topic of topics){
   const replacement=[...revisions,compensation].find(t=>t.key===topic.topic_key);
   if(replacement){topic.body_html=replacement.body;topic.title=replacement.title;}
   if(['schoolcarebridge','auricwell'].includes(topic.topic_key))topic.enabled=0;
   if(topic.topic_key==='welcome_october')topic.body_html=topic.body_html.replace(/Please complete your personal Provider Update when your invitation arrives\./g,'Continue through your personal Provider Update in this same invitation.');
   topic.rendered_body_html=fillStaffMarkers(topic.body_html,staff);
   if(apply)await db.execute('UPDATE admin_update_topics SET enabled=?,title=?,body_html=? WHERE id=? AND update_id=1',[topic.enabled,topic.title,topic.body_html,topic.id]);
  }
  update.topics=topics;
  const sections=handbookSections({rates,rules});
  const draftData=[];
  for(const row of generations){
   const data=parse(row.token_values_json),s=data.schedule;
   const rate=rates.find(r=>Number(r.category)===Number(s.category)&&Number(r.level)===Number(s.level))||{};
   data.compensationPolicyVersion=SERVICE_POLICY_VERSION;
   s.tier3LevelBonus=conditionalLevelBonus(s.level);s.autoIndirectMinutes=Number(s.category)===1?0:10;s.leaveAdminRatio=0.2;
   s.creditRateProbation??=rate.credit_rate_probation??s.creditRate;
   s.hcodeRateProbation??=rate.hcode_rate_probation??s.hcodeRate;
   s.indirectRateProbation??=s.indirectRate;s.supportRateProbation??=s.supportRate;
   data.commonClausesHtml=commonAmendmentClauses('sick');data.leaveChoice='sick';
   const html=renderAmendment(data);draftData.push({id:row.id,data,html});
   if(apply)await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(data),html,row.id]);
  }
  if(apply){
   await db.execute('UPDATE admin_updates SET title=?,intro_html=?,support_title=?,support_body=?,support_email=? WHERE id=1',[update.title,intro,update.support_title,update.support_body,update.support_email]);
   for(const [index,section] of sections.entries()){
    const old=oldSections.find(s=>s.slug===section.slug);
    if(old)await db.execute('UPDATE workplace_handbook_sections SET title=?,body_html=? WHERE id=? AND version_id=?',[section.title,section.bodyHtml,old.id,version.id]);
    else await db.execute('INSERT INTO workplace_handbook_sections(version_id,agency_id,sort_order,slug,title,body_html) VALUES (?,2,?,?,?,?)',[version.id,100+index,section.slug,section.title,section.bodyHtml]);
    const oldEntry=oldEntries.find(e=>e.subject===section.title || (old&&e.subject===old.title));
    if(oldEntry)await db.execute('UPDATE workplace_handbook_digest_entries SET subject=?,rationale=?,changed_content=? WHERE id=?',[section.title,'October 8 owner clarification: revised service pay, accrual and group policies; effective prospectively on agreement.',section.bodyHtml,oldEntry.id]);
    else await db.execute('INSERT INTO workplace_handbook_digest_entries(digest_id,agency_id,sort_order,subject,rationale,changed_content) VALUES (?,2,?,?,?,?)',[digest.id,index,section.title,'October 8 policy revision for editing.',section.bodyHtml]);
   }
   await db.execute("UPDATE contract_clauses SET body_html=? WHERE agency_id=2 AND clause_key='OCT26_COMPENSATION_AMENDMENT' AND is_active=0",[commonAmendmentClauses('sick')]);
   await db.execute(`INSERT INTO provider_public_profiles(user_id,public_details_json) VALUES(496,JSON_OBJECT('agencyDisplayLabels',JSON_OBJECT('2','Counselor')))
     ON DUPLICATE KEY UPDATE public_details_json=JSON_SET(COALESCE(public_details_json,JSON_OBJECT()),'$.agencyDisplayLabels',JSON_MERGE_PATCH(COALESCE(JSON_EXTRACT(public_details_json,'$.agencyDisplayLabels'),JSON_OBJECT()),JSON_OBJECT('2','Counselor')))`);
   await db.commit();
  }else await db.rollback();
  if(process.env.UPDATE_REVIEW_OUTPUT)fs.writeFileSync(process.env.UPDATE_REVIEW_OUTPUT,renderAdminUpdateHtml(update,{name:'ITSCO'},{layout:'web'}),{mode:0o600});
  if(process.env.AMENDMENT_REVIEW_DIR)for(const draft of draftData.filter(d=>d.data.example || d.data.employee?.name?.startsWith('Aunya'))){
   const name=draft.data.employee.name.replace(/[^a-zA-Z0-9]+/g,'-');
   fs.writeFileSync(`${process.env.AMENDMENT_REVIEW_DIR}/${name}-amendment.html`,`<!doctype html><meta charset="utf-8"><style>body{font:16px/1.6 system-ui;max-width:1000px;margin:30px auto;color:#143b39}td,th{padding:8px;border:1px solid #ccc}table{border-collapse:collapse;width:100%}</style>${draft.html}`,{mode:0o600});
  }
  console.log(JSON.stringify({mode:apply?'applied-editable-drafts':'dry-run',amendments:draftData.length,handbookSections:sections.length,adminUpdateId:1,messagesSent:0,signaturesCreated:0,payrollActivationChanged:false}));
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>pool.end());
