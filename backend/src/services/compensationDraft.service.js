import pool from '../config/database.js';
import sanitizeHtml from 'sanitize-html';
import {amendmentIssues, renderAmendment} from '../content/itscoOctober2026Drafts.js';
import {SERVICE_CREDIT_POLICY_VERSION, conditionalLevelBonus, defaultHcodeIndirectMinutes} from '../utils/serviceCreditPolicy.js';

export const DRAFT_KIND = 'provider_update_compensation';
export function cleanDraftHtml(value) {
 return sanitizeHtml(String(value || ''), {allowedTags:sanitizeHtml.defaults.allowedTags,allowedAttributes:{a:['href','title','target'],th:['colspan','rowspan'],td:['colspan','rowspan']},allowedSchemes:['https','mailto']});
}
const parse = v => typeof v === 'string' ? JSON.parse(v) : v;
const notFound=()=>Object.assign(new Error('Compensation draft not found.'),{status:404});

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
export function editCompensationDraft(existing,patch,userId) {
 const result=structuredClone(existing);
 for(const key of ['category','level','creditRate','hcodeRate','indirectRate','supportRate','ptoRate','creditRateProbation','hcodeRateProbation','indirectRateProbation','supportRateProbation']) {
  if(!Object.hasOwn(patch.schedule || {},key))continue;
  const raw=patch.schedule[key];
  const v=raw===''||raw==null?null:Number(raw);
  if(v!==null&&(!Number.isFinite(v)||v<0||v>100000))throw Object.assign(new Error(`Invalid ${key}.`),{status:400});
  if(key==='category'&&v!==null&&![1,2,3].includes(v))throw Object.assign(new Error('Invalid category.'),{status:400});
  if(key==='level'&&v!==null&&![1,2,3,4,5].includes(v))throw Object.assign(new Error('Invalid level.'),{status:400});
  result.schedule[key]=v;
 }
 if(patch.schedule?.levelDescription!==undefined)result.schedule.levelDescription=String(patch.schedule.levelDescription).slice(0,2000);
 if(patch.originalAgreementDate!==undefined)result.employee.originalAgreementDate=String(patch.originalAgreementDate).slice(0,300);
 if(patch.additionalTerms!==undefined)result.additionalTerms=String(patch.additionalTerms).slice(0,6000);
 if(patch.commonClausesHtml!==undefined)result.commonClausesHtml=cleanDraftHtml(patch.commonClausesHtml).slice(0,100000);
 result.editedByUserId=userId;result.editedAt=new Date().toISOString();
 if(result.compensationPolicyVersion===SERVICE_CREDIT_POLICY_VERSION){
  result.schedule.tier3LevelBonus=conditionalLevelBonus(result.schedule.level);
  result.schedule.autoIndirectMinutes=defaultHcodeIndirectMinutes(result.schedule.category);
 }
 return result;
}
export async function saveCompensationDraft(agencyId,id,patch,userId) {
 const prior=await getCompensationDraft(agencyId,id);
 const data=editCompensationDraft(prior.data,patch,userId);
 const html=renderAmendment(data);
 const [updated]=await pool.execute(`UPDATE contract_generations SET token_values_json=?,rendered_html=?
  WHERE id=? AND agency_id=? AND task_id IS NULL AND user_specific_document_id IS NULL
  AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))=?`,[JSON.stringify(data),html,id,agencyId,DRAFT_KIND]);
 if(!updated.affectedRows)throw notFound();
 return {id,data,html,issues:amendmentIssues(data)};
}

/** Explicit admin release after reviewing a complete draft. No email/SMS or payroll writes. */
export async function releaseCompensationDraft(agencyId,id,{expectedHtml,pushId},userId){
 const db=await pool.getConnection();
 try{await db.beginTransaction();
  const [[row]]=await db.execute('SELECT * FROM contract_generations WHERE id=? AND agency_id=? FOR UPDATE',[id,agencyId]);
  if(!row||row.task_id||row.user_specific_document_id||parse(row.token_values_json)?.draftKind!==DRAFT_KIND)throw notFound();
  const data=parse(row.token_values_json),issues=amendmentIssues(data);
  if(issues.length)throw Object.assign(new Error(`Complete this draft before releasing: ${issues.join(' ')}`),{status:409});
  if(!expectedHtml||expectedHtml!==row.rendered_html)throw Object.assign(new Error('The amendment changed. Review its saved preview before releasing it.'),{status:409});
  const pid=Number(pushId||data.pushId);
  const [[push]]=await db.execute("SELECT id FROM provider_update_pushes WHERE id=? AND agency_id=? AND status IN ('draft','sent','active')",[pid,agencyId]);
  const [[preview]]=await db.execute("SELECT id FROM provider_update_recipients WHERE push_id=? AND LEFT(token,8)='preview_' LIMIT 1",[pid]);
  if(!push||preview)throw Object.assign(new Error('Choose the employee update, not a private preview.'),{status:409});
  const counter=Number(data.countersignerUserId||3);
  const [[signer]]=await db.execute("SELECT u.id FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND u.role IN ('admin','super_admin','support')",[counter,agencyId]);
  const [[employee]]=await db.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=? AND is_active=1',[row.candidate_user_id,agencyId]);
  if(!signer||!employee)throw Object.assign(new Error('The employee and countersigner must be active agency members.'),{status:409});
  const releasedHtml=row.rendered_html.replace('<p><strong>Editable draft — not issued or signed.</strong></p>','');
  const title=`Compensation Amendment — ${data.employee.name}`;
  const [doc]=await db.execute(`INSERT INTO user_specific_documents(user_id,name,description,template_type,html_content,document_action_type,field_definitions,created_by_user_id)
    VALUES (?,?,?,'html',?,'signature',?,?)`,[row.candidate_user_id,title,'Provider Update compensation amendment',releasedHtml,JSON.stringify([{type:'signature',label:'Employee signature',required:true}]),userId]);
  const metadata={source:'provider_update',pushId:pid,amendmentMode:'compensation',contractGeneration:true,portalPhase:'ongoing',requiredCountersignerUserId:counter,generationId:id,effectiveDate:data.effectiveDate,compensationPolicyVersion:data.compensationPolicyVersion};
  const [task]=await db.execute(`INSERT INTO tasks(task_type,document_action_type,title,description,assigned_to_user_id,assigned_to_agency_id,assigned_by_user_id,reference_id,metadata,status,is_required)
    VALUES ('document','signature',?,?,?,?,?,?,?,'pending',1)`,[title,'Review and electronically sign your amendment in the Provider Update.',row.candidate_user_id,agencyId,userId,doc.insertId,JSON.stringify(metadata)]);
  await db.execute('UPDATE user_specific_documents SET task_id=? WHERE id=?',[task.insertId,doc.insertId]);
  await db.execute(`INSERT INTO tasks(task_type,document_action_type,title,description,assigned_to_user_id,assigned_to_agency_id,assigned_by_user_id,reference_id,countersign_signer_user_id,metadata,status,is_required)
    VALUES ('document','countersignature',?,?,?,?,?,?,?,?,'pending',1)`,[`Countersign — ${title}`,'Countersign after the employee signs. The signed copy remains in the employee profile.',counter,agencyId,userId,task.insertId,counter,JSON.stringify({source:'provider_update',pushId:pid,originalDocumentTaskId:task.insertId})]);
  data.pushId=pid;data.releasedByUserId=userId;data.releasedAt=new Date().toISOString();data.countersignerUserId=counter;
  await db.execute('UPDATE contract_generations SET task_id=?,user_specific_document_id=?,token_values_json=?,rendered_html=? WHERE id=?',[task.insertId,doc.insertId,JSON.stringify(data),releasedHtml,id]);
  await db.execute("UPDATE provider_update_pushes SET amendment_plan_json=? WHERE id=? AND agency_id=?",[JSON.stringify({mode:'compensation',title:'Compensation amendment',effectiveDate:data.effectiveDate,countersignerUserId:counter}),pid,agencyId]);
  await db.commit();return {taskId:task.insertId,countersignerUserId:counter,messagesSent:0};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
