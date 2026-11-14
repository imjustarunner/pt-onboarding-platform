import PayrollPaySystemRate from '../models/PayrollPaySystemRate.model.js';
import {additionsFromRate,HANDBOOK_ADDITION_MODE} from './conditionalAdditionPolicy.service.js';
import pool from '../config/database.js';
import sanitizeHtml from 'sanitize-html';
import {amendmentIssues, renderAmendment} from '../content/itscoOctober2026Drafts.js';
import {SERVICE_CREDIT_POLICY_VERSION, conditionalLevelBonus, defaultHcodeIndirectMinutes} from '../utils/serviceCreditPolicy.js';
import {isNluAmendment} from '../content/nluCompensationAmendment.js';
import {normalizeChildcareRatesByBand} from '../content/nluCompensationPolicy.js';
import {prospectiveCompensationDate,assertEmployeeCompensationAdmin,employeeCompensationPolicyContext,assertEmployeeCompensationTarget,assertEmployeeCompensationPush,employeeCompensationHistory,assertImportableEmployeeCompensation} from './employeeCompensationDraft.service.js';
import {annotateCompensationHandbookHtml} from './contractHandbookReferences.service.js';

export const DRAFT_KIND = 'provider_update_compensation';
export function cleanDraftHtml(value) {
 return sanitizeHtml(String(value || ''), {allowedTags:sanitizeHtml.defaults.allowedTags,allowedAttributes:{a:['href','title','target'],th:['colspan','rowspan'],td:['colspan','rowspan']},allowedSchemes:['https','mailto']});
}
const parse = v => typeof v === 'string' ? JSON.parse(v) : v;
const notFound=()=>Object.assign(new Error('Compensation draft not found.'),{status:404});
const auditDraft=(db,action,userId,agencyId,metadata)=>db.execute('INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES (?,?,?,?)',[action,userId,agencyId,JSON.stringify(metadata)]);
async function lockDraftEmployee(db,agencyId,id){
 const [[owner]]=await db.execute('SELECT candidate_user_id FROM contract_generations WHERE id=? AND agency_id=? LIMIT 1',[id,agencyId]);
 const employeeId=Number(owner?.candidate_user_id);if(!Number.isSafeInteger(employeeId)||employeeId<1)throw notFound();
 const key=`employee-compensation:${Number(agencyId)}:${employeeId}`;
 const [[lock]]=await db.execute('SELECT GET_LOCK(?,5) AS acquired',[key]);
 if(!Number(lock?.acquired))throw Object.assign(new Error('Another compensation edit is in progress. Try again.'),{status:409});
 return {key,employeeId};
}
async function releaseDraftConnection(db,lock){
 try{if(lock)await db.execute('SELECT RELEASE_LOCK(?)',[lock.key]);}catch{if(typeof db.destroy==='function'){db.destroy();return;}}
 db.release();
}

export async function listCompensationDrafts(agencyId) {
 const [rows]=await pool.execute(`SELECT id,candidate_user_id,token_values_json,created_at FROM contract_generations
  WHERE agency_id=? AND task_id IS NULL AND user_specific_document_id IS NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))=? ORDER BY id`,[agencyId,DRAFT_KIND]);
 return rows.map(row=>{const d=parse(row.token_values_json);return {id:row.id,userId:row.candidate_user_id,name:d.employee.name,category:d.schedule.category,level:d.schedule.level,issues:amendmentIssues(d),example:!!d.example,pushId:d.pushId};});
}
export async function getCompensationDraft(agencyId,id,db=pool) {
 const [rows]=await db.execute(`SELECT id,token_values_json,rendered_html FROM contract_generations
  WHERE id=? AND agency_id=? AND task_id IS NULL AND user_specific_document_id IS NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))=? LIMIT 1`,[id,agencyId,DRAFT_KIND]);
 if(!rows[0])throw notFound();
 const data=parse(rows[0].token_values_json);
 return {id:rows[0].id,data,html:rows[0].rendered_html,issues:amendmentIssues(data)};
}
export function editCompensationDraft(existing,patch,userId,{now=new Date()}={}) {
 const result=structuredClone(existing);
 for(const key of ['category','level','creditRate','hcodeRate','indirectRate','supportRate','ptoRate','creditRateProbation','hcodeRateProbation','indirectRateProbation','supportRateProbation',...(isNluAmendment(result)?['childcareLevel','tutoringLevel','childcareHourlyRate','tutoringHourlyRate','homeworkHelpRate','testingEvaluationRate']:[])]) {
  if(!Object.hasOwn(patch.schedule || {},key))continue;
  const raw=patch.schedule[key];
  const v=raw===''||raw==null?null:Number(raw);
  if(v!==null&&(!Number.isFinite(v)||v<0||v>100000))throw Object.assign(new Error(`Invalid ${key}.`),{status:400});
  if(key==='category'&&v!==null&&!(isNluAmendment(result)?[1,2,3,4]:[1,2,3]).includes(v))throw Object.assign(new Error('Invalid category.'),{status:400});
  if(key==='level'&&v!==null&&![1,2,3,4,5].includes(v))throw Object.assign(new Error('Invalid level.'),{status:400});
  result.schedule[key]=v;
 }
 if(patch.schedule?.levelDescription!==undefined)result.schedule.levelDescription=String(patch.schedule.levelDescription).slice(0,2000);
 if(patch.originalAgreementDate!==undefined){
  if(result.source?.priorAgreement&&String(patch.originalAgreementDate)!==String(existing.employee.originalAgreementDate))throw Object.assign(new Error('The signed source agreement reference is immutable. Preserve its identity and history.'),{status:409});
  if(!result.initialAgreement&&!result.source?.priorAgreement)result.employee.originalAgreementDate=String(patch.originalAgreementDate).slice(0,300);
 }
 if(patch.additionalTerms!==undefined)result.additionalTerms=String(patch.additionalTerms).slice(0,6000);
 if(patch.commonClausesHtml!==undefined)result.commonClausesHtml=cleanDraftHtml(patch.commonClausesHtml).slice(0,100000);
 if(isNluAmendment(result)) {
  if(patch.schedule && Object.hasOwn(patch.schedule,'childcareRatesByBand'))result.schedule.childcareRatesByBand=normalizeChildcareRatesByBand(patch.schedule.childcareRatesByBand);
  if(result.createdVia==='employee_compensation_ui'&&result.schedule.childcareLevel)result.schedule.serviceRoles=[...new Set([...(result.schedule.serviceRoles||result.CONTRACT_SERVICE_ROLES||[]),'childcare'])];
  if(patch.effectiveDate!==undefined) {
   if(!/^\d{4}-\d{2}-\d{2}$/.test(String(patch.effectiveDate)))throw Object.assign(new Error('Invalid prospective date.'),{status:400});
   result.effectiveDate=patch.effectiveDate;
  }
  if(patch.schedule?.testingAuthorized!==undefined)result.schedule.testingAuthorized=patch.schedule.testingAuthorized===true;
  if(patch.schedule?.testingAuthorizationReference!==undefined)result.schedule.testingAuthorizationReference=String(patch.schedule.testingAuthorizationReference).slice(0,2000);
  const childcareChanged=['childcareLevel','childcareHourlyRate','childcareRatesByBand'].some(key=>JSON.stringify(result.schedule[key]??null)!==JSON.stringify(existing.schedule?.[key]??null));
  if(childcareChanged) {
   const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
   const effective=String(result.effectiveDate||'');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(effective)||!Number.isFinite(Date.parse(`${effective}T12:00:00Z`))||new Date(`${effective}T12:00:00Z`).toISOString().slice(0,10)!==effective||effective<today)throw Object.assign(new Error('Choose a prospective effective date for the changed childcare rate schedule. Preserve previously authorized and earned pay.'),{status:400});
  }
 }
 result.editedByUserId=userId;result.editedAt=new Date().toISOString();
 const preservesPriorSchedule=result.createdVia==='employee_compensation_ui'&&!!result.source?.priorAgreement;
 if(result.compensationPolicyVersion===SERVICE_CREDIT_POLICY_VERSION&&!preservesPriorSchedule){
  if(result.conditionalAdditionMode!==HANDBOOK_ADDITION_MODE)result.schedule.tier3LevelBonus=conditionalLevelBonus(result.schedule.level);
  result.schedule.autoIndirectMinutes=isNluAmendment(result)?(Number(result.schedule.category)>1?10:0):defaultHcodeIndirectMinutes(result.schedule.category);
 }
 return result;
}
export async function saveCompensationDraft(agencyId,id,patch,userId) {
 const db=await pool.getConnection();
 let lock=null;
 try{
  lock=await lockDraftEmployee(db,agencyId,id);
  await db.beginTransaction();
  await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[lock.employeeId]);
  const [[row]]=await db.execute(`SELECT id,token_values_json,rendered_html FROM contract_generations WHERE id=? AND agency_id=? AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))=? FOR UPDATE`,[id,agencyId,DRAFT_KIND]);
  if(!row)throw notFound();
  const prior=parse(row.token_values_json);
  if(patch.expectedHtml!==undefined&&patch.expectedHtml!==row.rendered_html)throw Object.assign(new Error('The saved agreement changed. Reopen it before editing.'),{status:409});
  if(prior.createdVia==='employee_compensation_ui'){
   await assertEmployeeCompensationAdmin(agencyId,userId,db);
   if(patch.expectedHtml===undefined)throw Object.assign(new Error('Reopen the saved agreement before editing.'),{status:409});
  }
  const data=editCompensationDraft(prior,patch,userId);
  if(data.createdVia==='employee_compensation_ui'){
   prospectiveCompensationDate(data.effectiveDate);
   if(data.effectiveDate<String(data.source?.policyEffectiveOn||''))throw Object.assign(new Error('Preserve the organization’s approved prospective policy date.'),{status:409});
  }
  if(data.conditionalAdditionMode===HANDBOOK_ADDITION_MODE&&!(data.createdVia==='employee_compensation_ui'&&data.source?.priorAgreement)){const rate=await PayrollPaySystemRate.get(agencyId,data.schedule.category,data.schedule.level);if(rate)data.schedule.tier3LevelBonus=additionsFromRate(rate).clinical;}
  const annotated=await annotateCompensationHandbookHtml(renderAmendment(data),{agencyId,db,serviceRoles:data.schedule?.serviceRoles||data.CONTRACT_SERVICE_ROLES});
  const html=annotated.html;
  if(annotated.reference)data.handbookReference=annotated.reference;
  const [updated]=await db.execute(`UPDATE contract_generations SET token_values_json=?,rendered_html=?
   WHERE id=? AND agency_id=? AND task_id IS NULL AND user_specific_document_id IS NULL
   AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))=?`,[JSON.stringify(data),html,id,agencyId,DRAFT_KIND]);
  if(!updated.affectedRows)throw notFound();
  const [audit]=await auditDraft(db,'employee_compensation_draft_saved',userId,agencyId,{generationId:id,employeeUserId:data.employee.userId,effectiveDate:data.effectiveDate,payrollChanged:false});
  await db.commit();return {id,data,html,issues:amendmentIssues(data),auditRowId:audit.insertId};
 }catch(error){await db.rollback();throw error;}finally{await releaseDraftConnection(db,lock);}
}

/** Explicit admin release after reviewing a complete draft. No email/SMS or payroll writes. */
export async function releaseCompensationDraft(agencyId,id,{expectedHtml,pushId},userId){
 const db=await pool.getConnection();
 let lock=null;
 try{lock=await lockDraftEmployee(db,agencyId,id);await db.beginTransaction();
  await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE',[lock.employeeId]);
  const [[row]]=await db.execute('SELECT * FROM contract_generations WHERE id=? AND agency_id=? FOR UPDATE',[id,agencyId]);
  if(!row||parse(row.token_values_json)?.draftKind!==DRAFT_KIND)throw notFound();
  const data=parse(row.token_values_json),issues=amendmentIssues(data);
  if(row.task_id||row.user_specific_document_id){
   if(data.createdVia==='employee_compensation_ui'&&row.task_id&&data.releasedAt&&expectedHtml?.replace('<p><strong>Editable draft — not issued or signed.</strong></p>','')===row.rendered_html){
    await assertEmployeeCompensationAdmin(agencyId,userId,db);await db.commit();return {taskId:row.task_id,countersignerUserId:data.countersignerUserId,messagesSent:0,reused:true};
   }
   throw notFound();
  }
  if(data.createdVia==='employee_compensation_ui'){
   await assertEmployeeCompensationAdmin(agencyId,userId,db);
   prospectiveCompensationDate(data.effectiveDate);
   if(data.effectiveDate<String(data.source?.policyEffectiveOn||''))throw Object.assign(new Error('Preserve the organization’s approved prospective policy date.'),{status:409});
   const {agency,policy,enabled}=await employeeCompensationPolicyContext(agencyId,db);
   if(!enabled||data.effectiveDate<policy.nluCompensationEffectiveOn)throw Object.assign(new Error('The organization’s active compensation policy changed. Keep the draft for review.'),{status:409});
   await assertEmployeeCompensationTarget(agencyId,row.candidate_user_id,agency,db);
   if(Number(data.countersignerUserId)===Number(row.candidate_user_id))throw Object.assign(new Error('The employee cannot countersign their own agreement.'),{status:409});
   await assertEmployeeCompensationTarget(agencyId,data.countersignerUserId,agency,db,{lock:false});
   const {agreements,prior}=await employeeCompensationHistory(agencyId,row.candidate_user_id,data.effectiveDate,db);
   assertImportableEmployeeCompensation(prior);
   const source=data.source?.priorAgreement;
   if((data.initialAgreement&&agreements.length)||Number(source?.id||0)!==Number(prior?.id||0)||String(source?.effectiveOn||'')!==String(prior?.effectiveOn||'')||(prior&&JSON.stringify(data.source?.priorSchedule)!==JSON.stringify(prior.data.schedule)))throw Object.assign(new Error('The employee’s signed or authorized compensation history changed. Preserve this draft and review the current agreement before issuing another.'),{status:409});
  }
  if(issues.length)throw Object.assign(new Error(`Complete this draft before releasing: ${issues.join(' ')}`),{status:409});
  if(!expectedHtml||expectedHtml!==row.rendered_html)throw Object.assign(new Error('The amendment changed. Review its saved preview before releasing it.'),{status:409});
  const pid=Number(pushId||data.pushId);
  if(data.createdVia==='employee_compensation_ui'){
   if(pid!==Number(data.pushId))throw Object.assign(new Error('Use the employee update reviewed with this draft. A different update requires a separately reviewed draft.'),{status:409});
   await assertEmployeeCompensationPush(agencyId,pid,db);
  }
  const [[push]]=await db.execute("SELECT id FROM provider_update_pushes WHERE id=? AND agency_id=? AND status IN ('draft','sent','active')",[pid,agencyId]);
  const [[preview]]=await db.execute("SELECT id FROM provider_update_recipients WHERE push_id=? AND LEFT(token,8)='preview_' LIMIT 1",[pid]);
  if(!push||preview)throw Object.assign(new Error('Choose the employee update, not a private preview.'),{status:409});
  const counter=Number(data.countersignerUserId||3);
  if(data.createdVia==='employee_compensation_ui')await assertEmployeeCompensationAdmin(agencyId,counter,db);
  const [[signer]]=await db.execute("SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND UPPER(u.status) IN ('ACTIVE','ACTIVE_EMPLOYEE','COMPLETED') AND u.role IN ('admin','super_admin','support')",[counter,agencyId]);
  const [[employee]]=await db.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[row.candidate_user_id,agencyId]);
  if(!signer||!employee)throw Object.assign(new Error('The employee and countersigner must be active agency members.'),{status:409});
  const releasedHtml=row.rendered_html.replace('<p><strong>Editable draft — not issued or signed.</strong></p>','');
  const title=`${data.initialAgreement?'Initial Compensation Agreement':'Compensation Amendment'} — ${data.employee.name}`;
  const [doc]=await db.execute(`INSERT INTO user_specific_documents(user_id,name,description,template_type,html_content,document_action_type,field_definitions,created_by_user_id)
    VALUES (?,?,?,'html',?,'signature',?,?)`,[row.candidate_user_id,title,'Provider Update compensation amendment',releasedHtml,JSON.stringify([{type:'signature',label:'Employee signature',required:true}]),userId]);
  const metadata={source:'provider_update',pushId:pid,amendmentMode:'compensation',contractGeneration:true,portalPhase:'ongoing',requiredCountersignerUserId:counter,generationId:id,effectiveDate:data.effectiveDate,compensationPolicyVersion:data.compensationPolicyVersion,...(data.createdVia==='employee_compensation_ui'?{createdVia:data.createdVia,employeeCompensationDraft:true}:{})};
  const [task]=await db.execute(`INSERT INTO tasks(task_type,document_action_type,title,description,assigned_to_user_id,assigned_to_agency_id,assigned_by_user_id,reference_id,metadata,status,is_required)
    VALUES ('document','signature',?,?,?,?,?,?,?,'pending',1)`,[title,'Review and electronically sign your amendment in the Provider Update.',row.candidate_user_id,agencyId,userId,doc.insertId,JSON.stringify(metadata)]);
  await db.execute('UPDATE user_specific_documents SET task_id=? WHERE id=?',[task.insertId,doc.insertId]);
  await db.execute(`INSERT INTO tasks(task_type,document_action_type,title,description,assigned_to_user_id,assigned_to_agency_id,assigned_by_user_id,reference_id,countersign_signer_user_id,metadata,status,is_required)
    VALUES ('document','countersignature',?,?,?,?,?,?,?,?,'pending',1)`,[`Countersign — ${title}`,'Countersign after the employee signs. The signed copy remains in the employee profile.',counter,agencyId,userId,task.insertId,counter,JSON.stringify({source:'provider_update',pushId:pid,originalDocumentTaskId:task.insertId})]);
  data.pushId=pid;data.releasedByUserId=userId;data.releasedAt=new Date().toISOString();data.countersignerUserId=counter;
  await db.execute('UPDATE contract_generations SET task_id=?,user_specific_document_id=?,token_values_json=?,rendered_html=? WHERE id=?',[task.insertId,doc.insertId,JSON.stringify(data),releasedHtml,id]);
  await db.execute("UPDATE provider_update_pushes SET amendment_plan_json=? WHERE id=? AND agency_id=?",[JSON.stringify({mode:'compensation',title:'Compensation amendment',effectiveDate:data.effectiveDate,countersignerUserId:counter}),pid,agencyId]);
  const [audit]=await auditDraft(db,'employee_compensation_draft_released',userId,agencyId,{generationId:id,employeeUserId:row.candidate_user_id,pushId:pid,taskId:task.insertId,countersignerUserId:counter,payrollChanged:false,messagesSent:0});
  await db.commit();return {taskId:task.insertId,countersignerUserId:counter,messagesSent:0,auditRowId:audit.insertId};
 }catch(e){await db.rollback();throw e;}finally{await releaseDraftConnection(db,lock);}
}
