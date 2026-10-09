/** Explicit owner-supplied Oct 9 assignments. Saves setup; never enables payroll or sends agreements. */
import fs from 'node:fs';
import pool from '../config/database.js';
import {staffMilestones} from '../services/staffMilestonePresentation.service.js';
import {fillSavedCompensationInputs} from '../services/compensationDraftInputs.js';
import {renderAmendment,commonAmendmentClauses,SEED_KEY,EFFECTIVE_DATE,SERVICE_POLICY_VERSION,amendmentIssues} from '../content/itscoOctober2026Drafts.js';
const approved=[
 [8,'Czepiel',2,5],[465,'Albinana',2,2],[529,'Klaer',3,4],[528,'Suvari',3,4],[82,'Sears',2,2],[457,'Blackwood',2,2],
 [474,'Campos-Krumholz',3,3],[776,'Alter',1,1],[476,'Fyulep',2,2],[477,'Roberts',2,3],[478,'Boese',2,2],[479,'Regenbogen',2,2],
 [480,'Hiebert',3,4],[482,'Williamson',2,3],[522,'Franco-Diaz',2,2],[597,'Gonzalez-Huizar',2,2],[483,'Terrones',1,1],[521,'Colchin',3,4],
 [567,'Brimm',2,2],[485,'Fernandez',1,5],[486,'Littrell',1,5],[488,'Frisbie',1,3],[791,'Archuleta-Trujillo',2,2],[785,'Kastens-Moylan',3,4],
 [979,'Finch',1,1],[493,'Byers',2,2],[527,'Quartullo',1,3],[494,'Duran',2,2],[500,'Lim',1,3],[505,'Porter',2,2],[554,'Peres',1,1],
 [525,'Menegatti',3,4],[524,'Hughes',2,2],[515,'Reyes',2,3]
];
const apply=process.argv.includes('--apply'),parse=v=>typeof v==='string'?JSON.parse(v):v;
const staff=await staffMilestones(2);const db=await pool.getConnection();
try{
 await db.beginTransaction();
 const [assignments]=await db.execute('SELECT * FROM payroll_user_compensation_levels WHERE agency_id=2 FOR UPDATE');
 const [rates]=await db.execute('SELECT * FROM payroll_pay_system_rates WHERE agency_id=2');
 const [pto]=await db.execute('SELECT * FROM payroll_pto_accounts WHERE agency_id=2 FOR UPDATE');
 const [people]=await db.execute('SELECT u.id,u.first_name,u.last_name,u.credential,u.title,u.languages_spoken FROM users u JOIN user_agencies a ON a.user_id=u.id AND a.agency_id=2 AND a.is_active=1 WHERE u.is_active=1');
 const [profiles]=await db.execute('SELECT user_id,public_details_json FROM provider_public_profiles');
 const [languageFields]=await db.execute("SELECT v.user_id,v.value FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id WHERE d.field_key='languages_spoken'");
 const [dates]=await db.execute("SELECT v.user_id,v.value FROM user_info_values v JOIN user_info_field_definitions d ON d.id=v.field_definition_id WHERE d.field_key='employment_agreement_date'");
 const [drafts]=await db.execute("SELECT * FROM contract_generations WHERE agency_id=2 AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))='provider_update_compensation' FOR UPDATE");
 const [salary]=await db.execute('SELECT * FROM payroll_salary_positions WHERE agency_id=2 AND user_id=496');
 const plans=[];
 for(const [id,last,category,level] of approved){
  const u=people.find(u=>u.id===id);if(!u||u.last_name!==last)throw new Error(`Identity mismatch for ${id}`);
  const prior=assignments.find(a=>a.user_id===id);if(prior?.pay_system_enabled)throw new Error(`Active pay system requires an effective-date review for ${id}`);
  const r=rates.find(r=>r.category===category&&r.level===level);if(!r)throw new Error(`Missing rate matrix for ${id}`);
  const details=parse(profiles.find(p=>p.user_id===id)?.public_details_json)||{};
  const proficiency=details.languageProficiencies;
  const languageText=[u.languages_spoken,...languageFields.filter(x=>x.user_id===id).map(x=>x.value),...(details.languages||[])].filter(Boolean).join(' ');
  const spanish=Array.isArray(proficiency)?proficiency.some(x=>/^(Spanish|Español)$/i.test(x.language)&&x.canConductSessions===true&&['professional','fluent','native'].includes(x.proficiency)):/\bSpanish\b|Español/i.test(languageText)&&!/not been|not proficient|beginner|learning|limited/i.test(languageText);
  const person=staff.find(s=>s.id===id);const location=(person?.bases||[]).length?person.bases.join(' / '):person?.work_location||'';const denver=/Denver/i.test(location);
  const assignment={...prior,user_id:id,category,level,spanish_bonus_eligible:spanish?1:Number(prior?.spanish_bonus_eligible||0),location_bonus_eligible:denver?1:Number(prior?.location_bonus_eligible||0)};
  const existing=drafts.filter(d=>d.candidate_user_id===id).sort((a,b)=>b.id-a.id)[0];if(existing?.task_id||existing?.user_specific_document_id)throw new Error(`Issued agreement must not be replaced for ${id}`);
  let data=existing?parse(existing.token_values_json):{draftKind:'provider_update_compensation',seedKey:SEED_KEY,pushId:2,effectiveDate:EFFECTIVE_DATE,compensationPolicyVersion:SERVICE_POLICY_VERSION,leaveChoice:'sick',employee:{userId:id,name:`${u.first_name} ${u.last_name}`,title:u.title,credential:u.credential},schedule:{},commonClausesHtml:commonAmendmentClauses('sick'),countersignerUserId:3,countersignerName:'Haley Inyart'};
  // This list expressly replaces prior category/level and matrix base rates in unsigned drafts.
  data.compensationBasis='service_credit';
  data.schedule={...data.schedule,category,level};for(const key of ['creditRate','hcodeRate','indirectRate','supportRate','creditRateProbation','hcodeRateProbation','indirectRateProbation','supportRateProbation'])data.schedule[key]=null;
  data.schedule.levelDescription=`Level ${level} within Category ${category}. The individual base rates below apply to this assignment. Continued level standing is reviewed one to two times per year using the handbook’s paid indirect-work commitment, timely notes, attendance and clinician cancellations, outreach participation, school and staff feedback, client connection and treatment-goal progress, terminations, and school/client action items. Advancement is not automatic; approved changes are prospective.`;
  if(id===465)data.schedule.ptoRate=44;
  data=fillSavedCompensationInputs(data,{assignment,rates,ptoRate:id===465?44:pto.find(p=>p.user_id===id)?.pto_pay_rate,agreementDate:dates.find(d=>d.user_id===id)?.value});
  data.source={...data.source,assignment,rateProfile:r,ownerConfirmedOn:'2026-10-09',eligibilitySource:{languages:spanish?'Saved clinical-language or onboarding fields':null,location}};
  plans.push({id,assignment,data,draftId:existing?.id,html:renderAmendment(data)});
 }
 const megan=drafts.find(d=>d.candidate_user_id===496&&!d.task_id&&!d.user_specific_document_id);let salaryDraft;
 if(megan){salaryDraft=parse(megan.token_values_json);salaryDraft.employee.employmentType='salaried';salaryDraft.compensationBasis='salary';salaryDraft.salary=salary[0]||null;}
 if(apply){if(!process.env.UPDATE_BACKUP_PATH)throw new Error('Set an exclusive backup path.');fs.writeFileSync(process.env.UPDATE_BACKUP_PATH,JSON.stringify({assignments,pto,drafts,salary},null,2),{mode:0o600,flag:'wx'});
  for(const plan of plans){const a=plan.assignment;await db.execute(`INSERT INTO payroll_user_compensation_levels(agency_id,user_id,category,level,bypass,pay_system_enabled,spanish_bonus_eligible,location_bonus_eligible,assigned_by_user_id) VALUES (2,?,?,?,0,0,?,?,501) ON DUPLICATE KEY UPDATE category=VALUES(category),level=VALUES(level),spanish_bonus_eligible=VALUES(spanish_bonus_eligible),location_bonus_eligible=VALUES(location_bonus_eligible),assigned_by_user_id=501,updated_at=CURRENT_TIMESTAMP`,[plan.id,a.category,a.level,a.spanish_bonus_eligible,a.location_bonus_eligible]);
   if(plan.draftId)await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(plan.data),plan.html,plan.draftId]);else await db.execute('INSERT INTO contract_generations(agency_id,candidate_user_id,token_values_json,rendered_html,created_by_user_id) VALUES (2,?,?,?,501)',[plan.id,JSON.stringify(plan.data),plan.html]);
  }
  const [changed]=await db.execute('UPDATE payroll_pto_accounts SET pto_pay_rate=44 WHERE agency_id=2 AND user_id=465 AND pto_pay_rate IS NULL');
  if(!changed.affectedRows&&Number(pto.find(p=>p.user_id===465)?.pto_pay_rate)!==44)throw new Error('Aunya leave rate changed since review.');
  if(salaryDraft)await db.execute('UPDATE contract_generations SET token_values_json=?,rendered_html=? WHERE id=? AND task_id IS NULL AND user_specific_document_id IS NULL',[JSON.stringify(salaryDraft),renderAmendment(salaryDraft),megan.id]);
  await db.commit();
 }else await db.rollback();
 const report={mode:apply?'saved':'dry-run',confirmedAssignments:plans.length,spanish:plans.filter(p=>p.assignment.spanish_bonus_eligible).map(p=>p.data.employee.name),denver:plans.filter(p=>p.assignment.location_bonus_eligible).map(p=>p.data.employee.name),salaryPreserved:!!salaryDraft,notAssigned:['Elizabeth Rosas: no category/level supplied'],remainingDraftIssues:plans.filter(p=>amendmentIssues(p.data).length).map(p=>({name:p.data.employee.name,issues:amendmentIssues(p.data)})),payrollEnabled:false,messagesSent:0};
 if(process.env.REPORT_PATH)fs.writeFileSync(process.env.REPORT_PATH,JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify(report));
}catch(e){await db.rollback();throw e;}finally{db.release();await pool.end();}
