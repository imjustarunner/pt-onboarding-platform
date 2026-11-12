import pool from '../config/database.js';
import PayrollCompensationLevel from '../models/PayrollCompensationLevel.model.js';
import PayrollPaySystemRate from '../models/PayrollPaySystemRate.model.js';
import {readAgencyAccess} from './agencyAccessProfiles.service.js';
import {compensationAgencyPolicy,isNluChildcareAgency} from './compensationCategories.service.js';
import {isNluTutoringQaAgency} from '../utils/nluTutoringQaPolicy.js';
import {isStaffAccount} from '../utils/staffEligibility.js';
import {executedEmploymentAgreements} from './employmentAgreementPolicy.service.js';
import {authorizedCompensationSchedules} from './payrollCompensationAuthorization.service.js';
import {amendmentIssues,renderAmendment} from '../content/itscoOctober2026Drafts.js';
import {NLU_COMPENSATION_POLICY_VERSION} from '../content/nluCompensationPolicy.js';
import {SERVICE_CREDIT_POLICY_VERSION,isServiceCreditPolicy} from '../utils/serviceCreditPolicy.js';
import {enabledSectionKeys} from '../constants/providerUpdateSections.js';

const KIND='provider_update_compensation';
const parse=value=>{try{return typeof value==='string'?JSON.parse(value):value||{};}catch{return {};}};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const positive=value=>Number.isSafeInteger(Number(value))&&Number(value)>0;
const today=(now=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const name=user=>`${user.first_name||''} ${user.last_name||''}`.trim();
const active=user=>isStaffAccount(user)&&Number(user.is_active)===1&&!Number(user.is_archived)&&!user.terminated_at&&String(user.status).toUpperCase()==='ACTIVE_EMPLOYEE';
const eligible=(user,agency)=>active(user)&&(!Number(user.is_demo)||isNluTutoringQaAgency(agency));

export function prospectiveCompensationDate(value,{now=new Date()}={}){
 const date=String(value||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(`${date}T12:00:00Z`))||new Date(`${date}T12:00:00Z`).toISOString().slice(0,10)!==date||date<today(now))throw fail('Choose an actual prospective effective date, today or later in America/Denver.');
 return date;
}

export async function assertEmployeeCompensationAdmin(agencyId,actorUserId,db=pool){
 if(!positive(agencyId)||!positive(actorUserId))throw fail('Organization and authenticated administrator are required.');
 const [[actor]]=await db.execute(`SELECT u.id,u.role,u.status,u.is_active,u.is_archived,u.is_assistant_account,u.terminated_at FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1`,[actorUserId,agencyId]);
 if(!actor||!isStaffAccount(actor)||Number(actor.is_active)!==1||Number(actor.is_archived)||actor.terminated_at||!['ACTIVE','ACTIVE_EMPLOYEE','COMPLETED'].includes(String(actor.status).toUpperCase()))throw fail('An active administrator in this exact organization is required.',403);
 const access=await readAgencyAccess(Number(actorUserId),Number(agencyId),db);
 if(!access||!['admin','super_admin'].includes(access.role))throw fail('Compensation administration for this exact organization is required.',403);
}

export async function employeeCompensationPolicyContext(agencyId,db=pool){
 const [[agency]]=await db.execute('SELECT id,slug,name,is_active,is_archived,feature_flags FROM agencies WHERE id=?',[agencyId]);
 if(!agency||!Number(agency.is_active)||Number(agency.is_archived)||!isNluChildcareAgency(agency))throw fail('This organization does not have an active NLU compensation workflow.',403);
 if([453,454].includes(Number(agencyId))&&(!isNluTutoringQaAgency(agency)||Number(parse(agency.feature_flags).qaSandbox?.sourceAgencyId)!==6))throw fail('The retained NLU QA organization markers must be intact before preparing synthetic employee compensation.',403);
 const policy=await compensationAgencyPolicy(agencyId,db);
 return {agency,policy,enabled:policy.nluCompensationPolicyVersion===NLU_COMPENSATION_POLICY_VERSION&&/^\d{4}-\d{2}-\d{2}$/.test(String(policy.nluCompensationEffectiveOn||''))};
}

export async function assertEmployeeCompensationTarget(agencyId,userId,agency,db=pool,{lock=true}={}){
 const [[employee]]=await db.execute(`SELECT u.* FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1${lock?' FOR UPDATE':''}`,[userId,agencyId]);
 if(!employee||!eligible(employee,agency))throw fail('Choose an active employee in this exact organization. Pending hires must finish their ordinary onboarding.',409);
 return employee;
}

export async function assertEmployeeCompensationPush(agencyId,pushId,db=pool){
 const [[push]]=await db.execute(`SELECT p.* FROM provider_update_pushes p WHERE p.id=? AND p.agency_id=? AND p.status IN ('draft','sent','active') AND p.title NOT LIKE '[PREVIEW]%' AND NOT EXISTS(SELECT 1 FROM provider_update_recipients r WHERE r.push_id=p.id AND LEFT(r.token,8)='preview_')`,[pushId,agencyId]);
 if(!push||!enabledSectionKeys(parse(push.section_config_json)).includes('amendments')||(push.amendment_plan_json&&parse(push.amendment_plan_json).mode!=='compensation'))throw fail('Choose an ordinary employee update with compensation amendments enabled; private previews cannot issue documents.',409);
 return push;
}

export async function employeeCompensationHistory(agencyId,userId,effectiveDate,db=pool){
 const executed=await executedEmploymentAgreements({agencyId,userId},db);
 const approved=await authorizedCompensationSchedules({agencyId,userId},db);
 const approvedIds=new Set(approved.map(agreement=>agreement.id));
 const executedById=new Map(executed.map(agreement=>[agreement.id,agreement]));
 const agreements=[...executed.filter(agreement=>!approvedIds.has(agreement.id)).map(agreement=>({...agreement,executed:true})),...approved.map(agreement=>({...agreement,executed:executedById.has(agreement.id),payrollAuthorized:true,agreementDate:executedById.get(agreement.id)?.agreementDate||agreement.agreementDate}))];
 if(agreements.some(agreement=>agreement.effectiveOn>effectiveDate))throw fail('A signed or explicitly authorized future compensation schedule already exists. Review that cutover and choose a date that preserves its terms before creating another agreement.',409);
 const prior=agreements.sort((a,b)=>b.effectiveOn.localeCompare(a.effectiveOn)||b.id-a.id)[0]||null;
 return {agreements,prior};
}

export function assertImportableEmployeeCompensation(prior){
 if(prior?.payrollAuthorized&&!prior.executed)throw fail('Existing payroll-authorized terms have no executed employee agreement. Preserve that authorization and complete an explicit migration review; this editor cannot represent it as a signed prior agreement.',409);
 if(prior&&(!isServiceCreditPolicy(prior.data?.compensationPolicyVersion)||prior.data?.schedule?.nluCompensationPolicyVersion!==NLU_COMPENSATION_POLICY_VERSION))throw fail('The existing signed or authorized compensation schedule needs an explicit migration review before this editor can preserve its terms. Keep that agreement intact; do not substitute an initial agreement.',409);
}

export async function employeeCompensationDraftOptions(agencyId,actorUserId,{db=pool,now=new Date()}={}){
 await assertEmployeeCompensationAdmin(agencyId,actorUserId,db);
 const {agency,policy,enabled}=await employeeCompensationPolicyContext(agencyId,db);
 if(!enabled)return {enabled:false,reason:'Configure and review this organization’s prospective NLU compensation policy before creating employee agreements.',employees:[],countersigners:[],pushes:[],minimumEffectiveDate:today(now),categories:policy.categories,serviceCompensation:policy.serviceCompensation};
 const [people]=await db.execute(`SELECT u.id,u.first_name,u.last_name,u.role,u.status,u.is_active,u.is_archived,u.is_demo,u.is_assistant_account,u.terminated_at,
 EXISTS(SELECT 1 FROM contract_generations g JOIN signed_documents s ON s.task_id=g.task_id WHERE g.agency_id=? AND g.candidate_user_id=u.id AND s.signed_pdf_path IS NOT NULL AND NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.audit_trail,'$.adminCountersign.signedAt')),'null'),'') IS NOT NULL) AS has_signed_agreement
 FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE ua.agency_id=? AND ua.is_active=1 ORDER BY u.last_name,u.first_name,u.id`,[agencyId,agencyId]);
 const employees=people.filter(user=>eligible(user,agency)).map(user=>({id:user.id,name:name(user),role:user.role,hasSignedAgreement:!!Number(user.has_signed_agreement)}));
 const countersigners=[];
 for(const user of people.filter(user=>eligible(user,agency)&&['admin','super_admin'].includes(user.role))){const access=await readAgencyAccess(user.id,agencyId,db);if(['admin','super_admin'].includes(access?.role))countersigners.push({id:user.id,name:name(user),role:access.role});}
 const [updates]=await db.execute(`SELECT p.id,p.title,p.section_config_json,p.amendment_plan_json FROM provider_update_pushes p WHERE p.agency_id=? AND p.status IN ('draft','sent','active') AND p.title NOT LIKE '[PREVIEW]%' AND NOT EXISTS(SELECT 1 FROM provider_update_recipients r WHERE r.push_id=p.id AND LEFT(r.token,8)='preview_') ORDER BY p.id DESC`,[agencyId]);
 const pushes=updates.filter(push=>enabledSectionKeys(parse(push.section_config_json)).includes('amendments')&&(!push.amendment_plan_json||parse(push.amendment_plan_json).mode==='compensation')).map(push=>({id:push.id,title:push.title}));
 return {enabled:true,employees,countersigners,pushes,minimumEffectiveDate:[today(now),policy.nluCompensationEffectiveOn].sort().at(-1),categories:policy.categories,serviceCompensation:policy.serviceCompensation};
}

export async function createEmployeeCompensationDraft(agencyId,input,actorUserId,{db=pool,now=new Date()}={}){
 const userId=Number(input.userId),pushId=Number(input.pushId),counterId=Number(input.countersignerUserId);
 if(![userId,pushId,counterId].every(positive))throw fail('Choose an employee, employee update and authorized countersigner.');
 if(userId===counterId)throw fail('Choose another authorized employer countersigner. An employee cannot countersign their own compensation agreement.');
 if(input.initialAgreement!==undefined&&typeof input.initialAgreement!=='boolean')throw fail('Choose whether this is an initial compensation agreement.');
 const effectiveDate=prospectiveCompensationDate(input.effectiveDate,{now}),initialAgreement=input.initialAgreement===true;
 const reference=String(input.priorAgreementReference||'').trim().slice(0,300);
 await assertEmployeeCompensationAdmin(agencyId,actorUserId,db);
 const connection=await db.getConnection(),lock=`employee-compensation:${Number(agencyId)}:${userId}`;
 let held=false;
 try{
  const [[locked]]=await connection.execute('SELECT GET_LOCK(?,5) AS acquired',[lock]);held=!!Number(locked?.acquired);if(!held)throw fail('Another compensation edit is in progress. Try again.',409);
  await connection.beginTransaction();
  await assertEmployeeCompensationAdmin(agencyId,actorUserId,connection);
  const {agency,policy,enabled}=await employeeCompensationPolicyContext(agencyId,connection);if(!enabled)throw fail('Review and configure the organization’s prospective NLU compensation policy first.',409);
  if(effectiveDate<policy.nluCompensationEffectiveOn)throw fail('The proposed date precedes this organization’s approved prospective policy date. Preserve its existing terms.',409);
  const employee=await assertEmployeeCompensationTarget(agencyId,userId,agency,connection);
  const [[counter]]=await connection.execute(`SELECT u.* FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1`,[counterId,agencyId]);
  if(!counter||!eligible(counter,agency)||!['admin','super_admin'].includes((await readAgencyAccess(counterId,agencyId,connection))?.role))throw fail('Choose an active authorized employer countersigner in this organization.',409);
  await assertEmployeeCompensationPush(agencyId,pushId,connection);
  const [[existing]]=await connection.execute(`SELECT id,token_values_json,rendered_html FROM contract_generations WHERE agency_id=? AND candidate_user_id=? AND task_id IS NULL AND user_specific_document_id IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(token_values_json,'$.draftKind'))=? ORDER BY id DESC LIMIT 1 FOR UPDATE`,[agencyId,userId,KIND]);
  if(existing){const data=parse(existing.token_values_json);await connection.commit();return {id:existing.id,data,html:existing.rendered_html,issues:amendmentIssues(data),reused:true};}
  const [[pending]]=await connection.execute(`SELECT g.id FROM contract_generations g JOIN tasks t ON t.id=g.task_id LEFT JOIN signed_documents s ON s.task_id=t.id WHERE g.agency_id=? AND g.candidate_user_id=? AND t.status NOT IN ('archived','overridden','deleted') AND (JSON_UNQUOTE(JSON_EXTRACT(g.token_values_json,'$.draftKind'))=? OR JSON_EXTRACT(g.token_values_json,'$.COMPENSATION_SCHEDULE') IS NOT NULL) AND (s.signed_pdf_path IS NULL OR NULLIF(NULLIF(JSON_UNQUOTE(JSON_EXTRACT(s.audit_trail,'$.adminCountersign.signedAt')),'null'),'') IS NULL) LIMIT 1`,[agencyId,userId,KIND]);
  if(pending)throw fail('Complete or formally withdraw the already issued compensation agreement before preparing another.',409);
  const {agreements,prior}=await employeeCompensationHistory(agencyId,userId,effectiveDate,connection);
  if(initialAgreement&&agreements.length)throw fail('Existing approved compensation terms are present. Prepare an amendment so their history and unaffected service terms are retained.',409);
  assertImportableEmployeeCompensation(prior);
  if(!initialAgreement&&!prior&&!reference)throw fail('Identify the actual prior agreement, or explicitly choose an initial compensation agreement when none exists.',409);
  const assignment=await PayrollCompensationLevel.getForUser(agencyId,userId);
  const savedRate=assignment?.category&&assignment?.level?await PayrollPaySystemRate.get(agencyId,assignment.category,assignment.level):null;
  const priorData=prior?.data||{};
  const schedule=prior?structuredClone(priorData.schedule||{}):{category:null,level:null,creditRate:null,creditRateProbation:null,hcodeRate:null,hcodeRateProbation:null,indirectRate:savedRate?.indirectRate??null,supportRate:savedRate?.supportActivityRate??null,clinicalEligible:false,serviceRoles:['childcare'],childcareLevel:null,childcareRatesByBand:null,autoIndirectMinutes:0};
  if(!Array.isArray(schedule.serviceRoles)&&Array.isArray(priorData.CONTRACT_SERVICE_ROLES))schedule.serviceRoles=structuredClone(priorData.CONTRACT_SERVICE_ROLES);
  schedule.nluCompensationPolicyVersion=NLU_COMPENSATION_POLICY_VERSION;
  const data={...structuredClone(priorData),draftKind:KIND,createdVia:'employee_compensation_ui',initialAgreement,agencyName:agency.name,pushId,effectiveDate,compensationPolicyVersion:SERVICE_CREDIT_POLICY_VERSION,nluCompensationPolicyVersion:NLU_COMPENSATION_POLICY_VERSION,
   employee:{userId,name:name(employee),title:employee.title||'',credential:employee.credential||'',employmentType:employee.employment_type||null,originalAgreementDate:prior?`${prior.agreementDate||prior.effectiveOn} · agreement ${prior.id}`:initialAgreement?null:reference},
   schedule,countersignerUserId:counterId,countersignerName:name(counter),createdByUserId:actorUserId,createdAt:now.toISOString(),additionalTerms:priorData.additionalTerms||'',commonClausesHtml:priorData.commonClausesHtml||'',
   source:{policyEffectiveOn:policy.nluCompensationEffectiveOn,priorAgreement:prior?{id:prior.id,agreementDate:prior.agreementDate,effectiveOn:prior.effectiveOn,policyVersion:priorData.employmentPayVersion||priorData.compensationPolicyVersion,payrollAuthorizationId:prior.payrollAuthorizationId||null}:null,priorSchedule:prior?structuredClone(priorData.schedule||{}):null,assignment:assignment?{category:assignment.category,level:assignment.level}:null}};
  // This amendment has one canonical schedule. Employment merge tokens belong
  // to the preserved prior generation and must not override the edited schedule
  // when the executed-agreement payroll reader normalizes this new generation.
  delete data.COMPENSATION_POLICY_VERSION;
  delete data.COMPENSATION_SCHEDULE;
  const html=renderAmendment(data);
  const [generation]=await connection.execute('INSERT INTO contract_generations(agency_id,candidate_user_id,token_values_json,rendered_html,created_by_user_id) VALUES (?,?,?,?,?)',[agencyId,userId,JSON.stringify(data),html,actorUserId]);
  const [audit]=await connection.execute('INSERT INTO user_activity_log(action_type,user_id,agency_id,metadata) VALUES (?,?,?,?)',['employee_compensation_draft_created',actorUserId,agencyId,JSON.stringify({generationId:generation.insertId,employeeUserId:userId,pushId,countersignerUserId:counterId,effectiveDate,initialAgreement,tasksAssigned:false,payrollChanged:false})]);
  await connection.commit();return {id:generation.insertId,data,html,issues:amendmentIssues(data),reused:false,auditRowId:audit.insertId};
 }catch(error){await connection.rollback();throw error;}finally{try{if(held)await connection.execute('SELECT RELEASE_LOCK(?)',[lock]);}finally{connection.release();}}
}
