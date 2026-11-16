import crypto from 'node:crypto';
import pool from '../config/database.js';
import {listPayerSetupRequests} from './payerSetupCatalog.service.js';
import {distinctInsurancePolicies} from '../utils/insurancePaymentPolicy.js';

export const PAYER_PROGRAMS=[{id:'commercial',label:'Commercial'},{id:'medicaid',label:'Medicaid'},{id:'tricare',label:'TRICARE'},{id:'medicare',label:'Medicare'}];
const programs=new Set(PAYER_PROGRAMS.map(p=>p.id)),tiers=new Set(['qbha','bachelors','intern_plus']);
const fail=(status,message)=>Object.assign(new Error(message),{status});
const json=value=>{try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}};
const day=value=>value instanceof Date?value.toISOString().slice(0,10):String(value || '').slice(0,10);
const validDay=value=>/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
export const defaultProgramCredential=(program,tier)=>tiers.has(tier) && (program==='medicaid' || tier==='intern_plus');
export const defaultProgramService=(program,code)=>program==='medicaid' || !(/^H/i.test(code) || String(code).toUpperCase()==='T1017');

export async function loadBillingPayerRules(agencyId,db=pool){
 try{
  const [[state]]=await db.execute('SELECT revision FROM billing_payer_rule_state WHERE agency_id=?',[agencyId]);
  const [payerPrograms]=await db.execute('SELECT payer_id,programs_json FROM billing_payer_programs WHERE agency_id=?',[agencyId]);
  const [credentialRules]=await db.execute('SELECT program,credential_tier,allowed FROM billing_program_credential_rules WHERE agency_id=?',[agencyId]);
  const [serviceRules]=await db.execute('SELECT program,service_code,allowed FROM billing_program_service_rules WHERE agency_id=?',[agencyId]);
  const [overrides]=await db.execute('SELECT payer_id,program,plan_type,service_code,allowed,effective_from,effective_through,reason,policy_reference FROM billing_payer_service_overrides WHERE agency_id=?',[agencyId]);
  return {available:true,revision:Number(state?.revision || 0),programs:PAYER_PROGRAMS,payerPrograms:payerPrograms.map(row=>({payerId:row.payer_id,programs:json(row.programs_json) || []})),credentialRules,serviceRules,overrides:overrides.map(row=>({...row,effective_from:day(row.effective_from),effective_through:day(row.effective_through)}))};
 }catch(error){if(error.code!=='ER_NO_SUCH_TABLE')throw error;return {available:false,revision:0,programs:PAYER_PROGRAMS,payerPrograms:[],credentialRules:[],serviceRules:[],overrides:[]};}
}

export function programForPolicy(policy,rules){
 const explicit=String(policy?.programType || '').toLowerCase();
 const configured=rules.payerPrograms.find(row=>row.payerId===policy?.payerId)?.programs || [];
 if(explicit && !programs.has(explicit))return {error:'Select a valid insurance coverage category.'};
 if(explicit){if(configured.length && !configured.includes(explicit))return {error:'The client coverage category conflicts with this payer’s configured categories.'};return {program:explicit};}
 if(policy?.isMedicaid===true || policy?.isMedicaid===1){if(configured.length && !configured.includes('medicaid'))return {error:'The Medicaid coverage flag conflicts with this payer’s configured categories.'};return {program:'medicaid'};}
 if(configured.length===1)return {program:configured[0]};
 return {error:configured.length?'This payer serves multiple coverage categories. Select this client’s coverage category in Insurance.':'Classify this payer as Commercial, Medicaid, TRICARE or Medicare in Billing rules, or record the client’s coverage category.'};
}

export function programCredentialAllowed(rules,program,tier){const row=rules.credentialRules.find(row=>row.program===program && row.credential_tier===tier);return row?Number(row.allowed)===1:defaultProgramCredential(program,tier);}
export function programServiceAllowed(rules,program,code){const row=rules.serviceRules.find(row=>row.program===program && row.service_code===code);return row?Number(row.allowed)===1:defaultProgramService(program,code);}

export function evaluateBillingPayerRules({rules,policy,credentialTier,serviceCodes,dateOfService}){
 const blockers=[];
 if(!rules.available)return {ready:false,blockers:['Payer billing rules need database setup before claim submission.'],revision:rules.revision};
 const classification=programForPolicy(policy,rules),program=classification.program;
 if(classification.error)blockers.push(classification.error);
 if(program && !programCredentialAllowed(rules,program,credentialTier))blockers.push(`${PAYER_PROGRAMS.find(p=>p.id===program).label} billing is not enabled for this provider’s credential category.`);
 const date=day(dateOfService),applied=[];
 if(!validDay(date))blockers.push('A valid service date is required to evaluate payer rules.');
 if(policy?.effectiveDate && (!validDay(policy.effectiveDate) || date<policy.effectiveDate))blockers.push('This insurance policy is not effective for the service date.');
 if(policy?.terminationDate && (!validDay(policy.terminationDate) || date>policy.terminationDate))blockers.push('This insurance policy has ended before the service date.');
 if(program)for(const code of [...new Set(serviceCodes)]){
  const candidates=rules.overrides.filter(row=>row.payer_id===policy.payerId && row.program===program && row.service_code===code && row.allowed!=null && (!row.plan_type || row.plan_type===String(policy.planType || '')) && row.effective_from<=date && row.effective_through>=date);
  const specific=candidates.filter(row=>row.plan_type);const match=(specific.length?specific:candidates.filter(row=>!row.plan_type));
  if(match.length>1){blockers.push(`${code}: conflicting payer service overrides require review.`);continue;}
  const override=match[0],allowed=override?Number(override.allowed)===1:programServiceAllowed(rules,program,code);
  if(override)applied.push(override);
  if(!allowed)blockers.push(`${code} is not enabled for ${PAYER_PROGRAMS.find(p=>p.id===program).label}${policy.insurerName?` / ${policy.insurerName}`:''}. Review the code or record a dated individual payer service override.`);
 }
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify({revision:rules.revision,program,credentialTier,serviceCodes,date,applied,blockers})).digest('hex');
 return {ready:!blockers.length,blockers,program,revision:rules.revision,applied,fingerprint};
}

// Secondary Medicaid opens the service choices it permits. Primary category
// defaults do not prevent the required primary-first adjudication workflow.
// Enrollment, network participation, signed documentation and COB evidence
// remain separate submission gates. A dated payer-specific block still applies.
export function evaluateClientBillingPayerRules({rules,insurance,credentialTier,serviceCodes,dateOfService,payerSequence=1,forSelection=false}){
 const primaryPolicy=payerSequence===2?insurance?.secondary:insurance?.primary;
 const primary=evaluateBillingPayerRules({rules,policy:primaryPolicy || {},credentialTier,serviceCodes,dateOfService});
 if(payerSequence===2 || primary.ready)return {...primary,coverageSource:payerSequence===2?'secondary':'primary',coordinationRequired:false,coordinationCodes:[]};
 const secondaryPolicy=insurance?.secondary;
 if(!rules.available || !primary.program && !forSelection || !distinctInsurancePolicies(primaryPolicy,secondaryPolicy) || primary.program==='medicaid' || programForPolicy(secondaryPolicy,rules).program!=='medicaid')return primary;
 const date=day(dateOfService);
 if(!validDay(date) || primaryPolicy.effectiveDate && (!validDay(primaryPolicy.effectiveDate) || date<primaryPolicy.effectiveDate) || primaryPolicy.terminationDate && (!validDay(primaryPolicy.terminationDate) || date>primaryPolicy.terminationDate))return primary;
 const blockers=[],coordinationCodes=[],applied=[];
 for(const code of [...new Set(serviceCodes)]){
  const direct=evaluateBillingPayerRules({rules,policy:primaryPolicy,credentialTier,serviceCodes:[code],dateOfService});
  if(direct.ready)continue;
  const secondary=evaluateBillingPayerRules({rules,policy:secondaryPolicy,credentialTier,serviceCodes:[code],dateOfService});
  if(!secondary.ready || !forSelection && direct.applied?.some(row=>Number(row.allowed)===0))blockers.push(...direct.blockers,...secondary.blockers.map(message=>`Medicaid secondary: ${message}`));
  else{coordinationCodes.push(code);applied.push(...secondary.applied);}
 }
 if(!coordinationCodes.length)return primary;
 const warnings=['Medicaid secondary makes these services available: '+coordinationCodes.join(', ')+'. Bill the primary insurer first and review its ERA/EOB before preparing the Medicaid secondary claim. A clearinghouse rejection or an out-of-network denial does not establish secondary payment eligibility.'];
 const fingerprint=crypto.createHash('sha256').update(JSON.stringify({primary:primary.fingerprint,secondaryPolicy,coordinationCodes,applied,blockers})).digest('hex');
 return {ready:!blockers.length,blockers,program:primary.program,revision:rules.revision,applied:[...primary.applied,...applied],coverageSource:'secondary_medicaid',coordinationRequired:true,coordinationCodes,warnings,fingerprint};
}

export function validateBillingPayerMutation(input){
 const kind=input.kind,program=String(input.program || ''),serviceCode=String(input.serviceCode || '').trim().toUpperCase(),payerId=String(input.payerId || '').trim();
 if(!['payer_programs','program_credential','program_service','payer_service'].includes(kind))throw fail(400,'Select a billing rule to change.');
 if(!Number.isSafeInteger(Number(input.revision)) || Number(input.revision)<0)throw fail(400,'Reload the current billing rules before saving.');
 if(kind==='payer_programs'){
  if(!/^[A-Za-z0-9_-]{1,32}$/.test(payerId) || !Array.isArray(input.programs) || input.programs.some(p=>!programs.has(p)))throw fail(400,'Select a verified payer and valid coverage categories.');
  return {kind,payerId,programs:[...new Set(input.programs)].sort()};
 }
 if(!programs.has(program))throw fail(400,'Select a coverage category.');
 if(kind==='program_credential'){
  if(!tiers.has(input.credentialTier) || typeof input.allowed!=='boolean')throw fail(400,'Choose a provider category and On or Off.');
  return {kind,program,credentialTier:input.credentialTier,allowed:input.allowed};
 }
 if(!/^[A-Z0-9]{4,16}$/.test(serviceCode))throw fail(400,'Select a service code.');
 if(kind==='program_service'){
  if(typeof input.allowed!=='boolean')throw fail(400,'Choose On or Off.');
  return {kind,program,serviceCode,allowed:input.allowed};
 }
 if(!/^[A-Za-z0-9_-]{1,32}$/.test(payerId) || ![true,false,null].includes(input.allowed))throw fail(400,'Select a payer service override.');
 const planType=String(input.planType || '').trim(),effectiveFrom=String(input.effectiveFrom || ''),effectiveThrough=String(input.effectiveThrough || ''),reason=String(input.reason || '').trim(),policyReference=String(input.policyReference || '').trim();
 if(planType.length>100 || !validDay(effectiveFrom) || !validDay(effectiveThrough) || effectiveFrom>effectiveThrough || reason.length<10 || reason.length>1000 || policyReference.length<5 || policyReference.length>1000)throw fail(400,'Provide valid effective dates, a reason (10–1,000 characters), and a payer policy reference (5–1,000 characters).');
 return {kind,program,payerId,serviceCode,planType,allowed:input.allowed,effectiveFrom,effectiveThrough,reason,policyReference};
}

export async function saveBillingPayerRule({agencyId,actorUserId,...input},dbPool=pool){
 const value=validateBillingPayerMutation(input);
 if(!Number.isSafeInteger(Number(actorUserId)) || Number(actorUserId)<1)throw fail(401,'An authenticated billing actor is required.');
 const db=await dbPool.getConnection();
 try{
  await db.beginTransaction();
  await db.execute('INSERT IGNORE INTO billing_payer_rule_state(agency_id,revision) VALUES(?,0)',[agencyId]);
  const [[state]]=await db.execute('SELECT revision FROM billing_payer_rule_state WHERE agency_id=? FOR UPDATE',[agencyId]);
  if(Number(state.revision)!==Number(input.revision))throw fail(409,'Billing rules changed. Reload before saving your update.');
  const before=await loadBillingPayerRules(agencyId,db);
  const previous=value.kind==='payer_programs'?before.payerPrograms.find(row=>row.payerId===value.payerId):value.kind==='program_credential'?before.credentialRules.find(row=>row.program===value.program && row.credential_tier===value.credentialTier):value.kind==='program_service'?before.serviceRules.find(row=>row.program===value.program && row.service_code===value.serviceCode):before.overrides.find(row=>row.payer_id===value.payerId && row.program===value.program && row.plan_type===value.planType && row.service_code===value.serviceCode && row.effective_from===value.effectiveFrom);
  if(value.payerId){const payers=await listPayerSetupRequests(agencyId,db);if(!payers.some(p=>p.claimmd_payer_id===value.payerId && p.directory_status==='id_match'))throw fail(400,'Add this exact payer route to the practice payer list first.');}
  if(value.kind==='payer_service' && before.overrides.some(row=>row.payer_id===value.payerId && row.program===value.program && row.plan_type===value.planType && row.service_code===value.serviceCode && row.effective_from!==value.effectiveFrom && row.effective_from<=value.effectiveThrough && row.effective_through>=value.effectiveFrom))throw fail(409,'This override period overlaps another rule for the same payer, category, plan and service. Review the existing period.');
  if(value.kind==='payer_programs')await db.execute('INSERT INTO billing_payer_programs(agency_id,payer_id,programs_json) VALUES(?,?,?) ON DUPLICATE KEY UPDATE programs_json=VALUES(programs_json)',[agencyId,value.payerId,JSON.stringify(value.programs)]);
  if(value.kind==='program_credential')await db.execute('INSERT INTO billing_program_credential_rules(agency_id,program,credential_tier,allowed) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE allowed=VALUES(allowed)',[agencyId,value.program,value.credentialTier,value.allowed?1:0]);
  if(value.kind==='program_service')await db.execute('INSERT INTO billing_program_service_rules(agency_id,program,service_code,allowed) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE allowed=VALUES(allowed)',[agencyId,value.program,value.serviceCode,value.allowed?1:0]);
  if(value.kind==='payer_service')await db.execute('INSERT INTO billing_payer_service_overrides(agency_id,payer_id,program,plan_type,service_code,allowed,effective_from,effective_through,reason,policy_reference) VALUES(?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE allowed=VALUES(allowed),effective_from=VALUES(effective_from),effective_through=VALUES(effective_through),reason=VALUES(reason),policy_reference=VALUES(policy_reference)',[agencyId,value.payerId,value.program,value.planType,value.serviceCode,value.allowed===null?null:value.allowed?1:0,value.effectiveFrom,value.effectiveThrough,value.reason,value.policyReference]);
  const revision=Number(state.revision)+1;
  await db.execute('INSERT INTO billing_payer_rule_events(agency_id,revision,actor_user_id,rule_kind,scope_json,before_json,after_json) VALUES(?,?,?,?,?,?,?)',[agencyId,revision,actorUserId,value.kind,JSON.stringify({payerId:value.payerId,program:value.program,serviceCode:value.serviceCode,credentialTier:value.credentialTier,planType:value.planType}),JSON.stringify(previous || null),JSON.stringify(value)]);
  await db.execute('UPDATE billing_payer_rule_state SET revision=? WHERE agency_id=?',[revision,agencyId]);
  await db.commit();return {revision};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
