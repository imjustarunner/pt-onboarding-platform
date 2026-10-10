/** Owner corrections October 9: future invitation BCC is handled in providerUpdateAuditCopy. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {correctIndividualAmendment,correctSpanishLanguages,correctSpanishProfile} from '../content/octoberIndividualCorrections.js';
import {renderAmendment} from '../content/itscoOctober2026Drafts.js';
import {fillSavedCompensationInputs} from '../services/compensationDraftInputs.js';
const apply=process.argv.includes('--apply'),parse=v=>typeof v==='string'?JSON.parse(v):v;
const db=await pool.getConnection();
try {
 await db.beginTransaction();
 const [people]=await db.query('SELECT id,first_name,last_name,languages_spoken FROM users WHERE id IN(482,485,494) FOR UPDATE');
 for(const [id,last] of [[482,'Williamson'],[485,'Fernandez'],[494,'Duran']])if(!people.some(p=>p.id===id&&p.last_name===last))throw Error(`Confirm employee identity ${id}`);
 const [assignments]=await db.query('SELECT * FROM payroll_user_compensation_levels WHERE agency_id=2 AND user_id IN(482,485) FOR UPDATE');
 if(assignments.length!==2||assignments.some(a=>Number(a.pay_system_enabled)))throw Error('Review active/missing payroll assignments before changing language eligibility');
 const [rates]=await db.query('SELECT * FROM payroll_pay_system_rates WHERE agency_id=2');
 const [profiles]=await db.query('SELECT * FROM provider_public_profiles WHERE user_id IN(482,485) FOR UPDATE');
 const [fields]=await db.query("SELECT v.*,d.field_key FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id WHERE v.user_id IN(482,485) AND d.field_key IN('languages_spoken','provider_languages_spoken') FOR UPDATE");
 const languagesFor=uid=>{
  const person=people.find(p=>p.id===uid),details=parse(profiles.find(p=>p.user_id===uid)?.public_details_json)||{};
  return correctSpanishLanguages([person.languages_spoken,...(details.languages||[]),...fields.filter(f=>f.user_id===uid).flatMap(f=>{try{return parse(f.value)}catch{return f.value}})],uid===485);
 };
 const [progress]=await db.query("SELECT p.*,r.provider_user_id FROM provider_update_section_progress p JOIN provider_update_recipients r ON r.id=p.recipient_id WHERE r.agency_id=2 AND r.provider_user_id IN(482,485) AND p.section_key='credential_display' FOR UPDATE");
 const [drafts]=await db.query("SELECT * FROM contract_generations WHERE agency_id=2 AND candidate_user_id IN(482,485,494) AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE");
 if(new Set(drafts.map(d=>d.candidate_user_id)).size!==3)throw Error('Expected all three amendments');
 const documents=[],plans=[];
 for(const row of drafts){
  let doc=null;
  if(row.task_id||row.user_specific_document_id){
   const [[task]]=await db.execute('SELECT id,status FROM tasks WHERE id=? FOR UPDATE',[row.task_id]);
   const [signatures]=await db.execute('SELECT id FROM signed_documents WHERE task_id=? FOR UPDATE',[row.task_id]);
   if(!task||task.status!=='pending'||signatures.length)throw Error(`Preserve signed/started amendment ${row.id}; prepare a separate correction for review`);
   [[doc]]=await db.execute('SELECT * FROM user_specific_documents WHERE id=? AND task_id=? FOR UPDATE',[row.user_specific_document_id,row.task_id]);
   if(!doc||doc.html_content!==row.rendered_html)throw Error(`Review issued document mismatch ${row.id}`);
   documents.push(doc);
  }
  const uid=Number(row.candidate_user_id);
  let data=correctIndividualAmendment(parse(row.token_values_json),uid);
  if(uid!==494){const assignment={...assignments.find(a=>a.user_id===uid),spanish_bonus_eligible:uid===485?1:0};data=fillSavedCompensationInputs(data,{assignment,rates});}
  let html=renderAmendment(data);if(doc)html=html.replace('<p><strong>Editable draft — not issued or signed.</strong></p>','');
  plans.push({row,data,html,doc});
 }
 const [sends]=await db.query("SELECT user_id,delivery_status,generated_at FROM user_communications WHERE user_id IN(485,494) AND template_type='provider_update_invite' ORDER BY id DESC LIMIT 6");
 if(apply){
  if(!process.env.UPDATE_BACKUP_PATH)throw Error('Backup path required');
  fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({people,assignments,profiles,fields,progress,drafts,documents}),{flag:'wx',mode:0o600});
  for(const uid of [482,485]){
   const eligible=uid===485,person=people.find(p=>p.id===uid);
   const profile=profiles.find(p=>p.user_id===uid),existingDetails=parse(profile?.public_details_json)||{};
   const languages=languagesFor(uid);
   await db.execute('UPDATE users SET languages_spoken=? WHERE id=?',[languages.join(', '),uid]);
   await db.execute('UPDATE payroll_user_compensation_levels SET spanish_bonus_eligible=? WHERE agency_id=2 AND user_id=?',[eligible?1:0,uid]);
   const details=correctSpanishProfile({...existingDetails,languages},eligible);
   if(profile)await db.execute('UPDATE provider_public_profiles SET public_details_json=? WHERE user_id=?',[JSON.stringify(details),uid]);
   else await db.execute('INSERT INTO provider_public_profiles(user_id,public_details_json) VALUES(?,?)',[uid,JSON.stringify(details)]);
   for(const field of fields.filter(f=>f.user_id===uid)){
    let raw=field.value;try{raw=parse(raw)}catch{}
    const corrected=correctSpanishLanguages(raw,eligible);
    await db.execute('UPDATE user_info_values SET value=? WHERE id=?',[Array.isArray(raw)?JSON.stringify(corrected):corrected.join(', '),field.id]);
   }
   for(const row of progress.filter(p=>p.provider_user_id===uid)){
    const data=parse(row.data_json)||{};
    if(Array.isArray(data.sessionLanguages)){
     data.sessionLanguages=correctSpanishProfile({languageProficiencies:data.sessionLanguages},eligible).languageProficiencies;
     await db.execute('UPDATE provider_update_section_progress SET data_json=? WHERE id=?',[JSON.stringify(data),row.id]);
    }
   }
  }
  for(const p of plans){await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=?',[JSON.stringify(p.data),p.html,p.row.id]);if(p.doc)await db.execute('UPDATE user_specific_documents SET html_content=? WHERE id=?',[p.html,p.doc.id]);}
  await db.commit();
 }else await db.rollback();
 console.log(JSON.stringify({apply,languageCorrections:people.filter(p=>p.id!==494).map(p=>({id:p.id,before:p.languages_spoken,after:languagesFor(p.id).join(', ')})),amendments:plans.map(p=>({id:p.row.id,userId:p.row.candidate_user_id,spanish:p.data.schedule.spanishDifferentialEligible,issuedUnsigned:!!p.doc})),priorInvitations:sends,emailsSent:0}));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
process.exit(0);
