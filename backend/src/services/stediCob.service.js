import pool from '../config/database.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { auditBilling, billingError } from './familyBillingPolicy.service.js';
import { readClientInsurance, insuranceDemographics } from './clientInsurance.service.js';
import { listClaimMdBillingProfiles } from './claimMdBillingProfile.service.js';
import { queueInsuranceVerificationSafely } from './insuranceVerificationTask.service.js';
import { assertLiveClearinghouseAgency } from './syntheticClearinghouseGuard.service.js';
import { STEDI_AGENCIES, discoveryPatient, discoveryMonth, discoveryNpiValid, normalizeDiscoveryName } from './stediDiscoveryPolicy.js';
import { cobFingerprint, validateCobConfirmation, stediCobPayload, cobFindings } from './stediCobPolicy.js';
import { policyIsMedicaid } from '../utils/insurancePaymentPolicy.js';

const context = row => `stedi-cob:${row.agency_id}:${row.client_id}`;
export const stediCobConfigured = agencyId => STEDI_AGENCIES.includes(Number(agencyId)) && process.env.STEDI_COB_ENABLED==='true' && !!process.env.STEDI_API_KEY;
async function snapshotFor({agencyId,clientId},db=pool) {
  const insurance=await readClientInsurance(clientId,agencyId,db);
  return {insurance:insurance || {},patient:discoveryPatient(insurance,await insuranceDemographics(clientId,agencyId,db))};
}
export function decodeCob(row) {
  const request=decryptFamilyBilling(row.request_encrypted,context(row)),response=decryptFamilyBilling(row.response_encrypted,context(row));
  return {id:row.id,status:row.status,serviceDate:row.service_date instanceof Date?row.service_date.toISOString().slice(0,10):row.service_date,createdAt:row.created_at,reviewRequired:!!row.review_required,
    payerName:request.payer?.displayName || '',response,assessment:response?cobFindings(response,request):null,review:decryptFamilyBilling(row.review_encrypted,context(row))};
}
async function stediJson(url,options={},deps={},retainError=false) {
  const response=await (deps.fetch || fetch)(url,{...options,redirect:'error',signal:AbortSignal.timeout(options.method==='POST'?125000:20000),headers:{Authorization:process.env.STEDI_API_KEY,'Content-Type':'application/json'}});
  if(response.status!==200 && !retainError)throw billingError(502,'Stedi did not return a complete response. Check the saved attempt before sending another paid request.');
  const bytes=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>5*1024*1024)throw billingError(502,'The Stedi response exceeded the supported size. Reconcile this check in Stedi.');bytes.push(chunk);}
  const raw=Buffer.concat(bytes).toString('utf8');
  if(response.status!==200){let body;try{body=JSON.parse(raw);}catch{body=raw;}return {httpError:{status:response.status,body}};}
  const value=JSON.parse(raw);
  if(!value || typeof value!=='object' || Array.isArray(value))throw billingError(502,'Stedi returned an unexpected response.');
  return value;
}
export async function getCobPayer(stediId,deps={}) {
  if(!/^[A-Z]{5}$/.test(stediId || ''))throw billingError(409,'Select a payer from the participating payer list.');
  const value=await stediJson(`https://payers.us.stedi.com/2024-04-01/payer/${stediId}`,{method:'GET'},deps);
  if(value.payer?.stediId!==stediId)throw billingError(502,'The payer directory returned a different payer.');
  return value.payer;
}
export async function cobPayers(scope,deps={}) {
  if(!(deps.configured || stediCobConfigured)(scope.agencyId))throw billingError(409,'Stedi coordination of benefits is awaiting account setup.');
  const snapshot=await (deps.snapshotFor || snapshotFor)(scope,deps.db || pool),policy=snapshot.insurance?.[scope.slot];
  if(!['primary','secondary'].includes(scope.slot) || !policy?.insurerName)throw billingError(409,'Save the known insurer before checking payer participation.');
  // Only the saved insurer name is sent to the public directory, never patient data.
  const query=new URLSearchParams({query:policy.insurerName.slice(0,200),coordinationOfBenefits:'SUPPORTED',pageSize:'100'});
  const result=await stediJson(`https://payers.us.stedi.com/2024-04-01/payers/search?${query}`,{method:'GET'},deps);
  if(!Array.isArray(result.items))throw billingError(502,'The participating payer list could not be read.');
  return {payers:result.items.map(i=>i.payer).filter(p=>p?.transactionSupport?.coordinationOfBenefits==='SUPPORTED' && /^[A-Z]{5}$/.test(p.stediId)).map(p=>({stediId:p.stediId,name:p.displayName,payerId:p.primaryPayerId,states:p.operatingStates || []})),moreAvailable:!!result.nextPageToken};
}
export async function cobWorkspace(scope,deps={}) {
  const db=deps.db || pool,snapshot=await (deps.snapshotFor || snapshotFor)(scope,db);
  const [rows]=await db.execute("SELECT * FROM stedi_insurance_discoveries WHERE request_kind='cob' AND agency_id=? AND client_id=? ORDER BY id DESC LIMIT 20",[scope.agencyId,scope.clientId]);
  const enabled=(deps.configured || stediCobConfigured)(scope.agencyId),offices=enabled?await (deps.offices || listClaimMdBillingProfiles)(scope.agencyId):[];
  return {enabled,patient:snapshot.patient,fingerprint:cobFingerprint(snapshot),verified:snapshot.insurance.verifiedForClaims===true,policies:['primary','secondary'].filter(slot=>snapshot.insurance[slot]?.memberId).map(slot=>({slot,...snapshot.insurance[slot]})),
    offices:offices.map(o=>({id:o.id,name:o.name,available:discoveryNpiValid(o.practice_npi) && !!o.practice_name})),estimatedPriceCents:100,priceCheckedOn:'2026-11-10',checks:rows.map(decodeCob)};
}
export async function reserveCob(input,deps={}) {
  if(!STEDI_AGENCIES.includes(Number(input.agencyId)))throw billingError(403,'Coordination of benefits is unavailable for this agency.');
  const db=await (deps.pool || pool).getConnection();
  try {
    await db.beginTransaction();
    const month=discoveryMonth();
    // Same lock order as discovery prevents both duplicate spending and deadlocks.
    await db.execute('INSERT INTO stedi_discovery_budget (month_key) VALUES (?) ON DUPLICATE KEY UPDATE reserved_count=reserved_count',[month]);
    await db.execute('SELECT reserved_count FROM stedi_discovery_budget WHERE month_key=? FOR UPDATE',[month]);
    const [[client]]=await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[input.clientId,input.agencyId]);
    if(!client)throw billingError(404,'Client not found in this agency');
    const snapshot=await (deps.snapshotFor || snapshotFor)(input,db);
    validateCobConfirmation(input,snapshot);
    const fingerprint=cobFingerprint({snapshot,slot:input.slot,stediPayerId:input.stediPayerId});
    const [[duplicate]]=await db.execute(`SELECT * FROM stedi_insurance_discoveries WHERE request_kind='cob' AND agency_id=? AND client_id=? AND
      (request_key=? OR (?=0 AND identity_fingerprint=? AND service_date=? AND created_at>UTC_TIMESTAMP()-INTERVAL 30 DAY)) ORDER BY id DESC LIMIT 1`,[input.agencyId,input.clientId,input.requestKey,input.freshSearch===true?1:0,fingerprint,input.serviceDate]);
    if(duplicate){await db.commit();return {row:duplicate,reused:true};}
    const [[pending]]=await db.execute("SELECT id FROM stedi_insurance_discoveries WHERE request_kind='cob' AND agency_id=? AND client_id=? AND (status IN ('sending','unknown') OR review_required=1) LIMIT 1",[input.agencyId,input.clientId]);
    if(pending)throw billingError(409,'Resolve the previous COB check before paying for another. Existing discovery results can still be investigated with COB.');
    const offices=await (deps.offices || listClaimMdBillingProfiles)(input.agencyId),office=offices.find(o=>Number(o.id)===Number(input.billingOfficeId));
    // Capability is fetched by the server for this request, never trusted from the browser.
    const payload=stediCobPayload(input,snapshot,office,deps.payer);
    const row={agency_id:input.agencyId,client_id:input.clientId,service_date:input.serviceDate,status:'sending'};
    const request={snapshot,payload,payer:deps.payer,slot:input.slot,reason:input.reason,repeatReason:input.freshSearch===true?input.repeatReason.trim():'',confirmedAt:new Date().toISOString(),confirmations:{name:true,birthdate:true,address:true,policy:true,payer:true,cost:true},billingOfficeId:office.id};
    const encrypted=encryptFamilyBilling(request,context(row));
    const [insert]=await db.execute(`INSERT INTO stedi_insurance_discoveries (request_kind,agency_id,client_id,actor_user_id,request_key,identity_fingerprint,service_date,month_key,status,request_encrypted)
      VALUES ('cob',?,?,?,?,?,?,?,'sending',?)`,[input.agencyId,input.clientId,input.actorUserId,input.requestKey,fingerprint,input.serviceDate,month,encrypted]);
    await db.execute('UPDATE stedi_discovery_budget SET reserved_count=reserved_count+1 WHERE month_key=?',[month]);
    await (deps.audit || auditBilling)({...input,userId:input.actorUserId,action:'stedi_cob_requested',objectId:insert.insertId},db);
    await db.commit();return {row:{...row,id:insert.insertId,request_encrypted:encrypted},payload,reused:false};
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function callStediCob(payload,deps={}) {
  const value=await stediJson('https://healthcare.us.stedi.com/2024-04-01/coordination-of-benefits',{method:'POST',body:JSON.stringify(payload)},deps,true);
  // Preserve even unfamiliar fields and shapes. Assessment flags incomplete results.
  return value;
}
export async function startCob(input,deps={}) {
  if(!(deps.configured || stediCobConfigured)(input.agencyId))throw billingError(409,'Stedi coordination of benefits is awaiting account setup.');
  await (deps.assertLive || assertLiveClearinghouseAgency)(input.agencyId);
  const payer=await (deps.getPayer || getCobPayer)(input.stediPayerId);
  const reserved=await (deps.reserve || reserveCob)(input,{...deps,payer});
  if(reserved.reused)return {...decodeCob(reserved.row),reused:true};
  let response;
  try{response=await (deps.call || callStediCob)(reserved.payload);}
  catch{
    await (deps.db || pool).execute("UPDATE stedi_insurance_discoveries SET status='unknown',review_required=1 WHERE request_kind='cob' AND id=? AND agency_id=? AND client_id=?",[reserved.row.id,input.agencyId,input.clientId]);
    await (deps.queueFollowUp || queueInsuranceVerificationSafely)({...input,reason:'cob_unresolved'});
    return {...decodeCob({...reserved.row,status:'unknown',review_required:1}),message:'The outcome is uncertain. Reconcile this attempt in Stedi before another paid check.'};
  }
  const request=decryptFamilyBilling(reserved.row.request_encrypted,context(reserved.row));
  // A late response must never clear an issue for a different saved identity/policy.
  try{request.insuranceChangedWhileChecking=cobFingerprint(await (deps.snapshotFor || snapshotFor)(input,deps.db || pool))!==cobFingerprint(request.snapshot);}
  catch{request.insuranceChangedWhileChecking=true;}
  const assessment=cobFindings(response,request),encrypted=encryptFamilyBilling(response,context(reserved.row));
  const requestEncrypted=encryptFamilyBilling(request,context(reserved.row));
  await (deps.db || pool).execute("UPDATE stedi_insurance_discoveries SET status='complete',response_encrypted=?,review_required=?,request_encrypted=? WHERE request_kind='cob' AND id=? AND agency_id=? AND client_id=?",[encrypted,assessment.reviewRequired?1:0,requestEncrypted,reserved.row.id,input.agencyId,input.clientId]);
  if(assessment.reviewRequired)await (deps.queueFollowUp || queueInsuranceVerificationSafely)({...input,reason:assessment.identityMatches?'cob_unresolved':'identity_mismatch'});
  return decodeCob({...reserved.row,status:'complete',request_encrypted:requestEncrypted,response_encrypted:encrypted,review_required:assessment.reviewRequired?1:0});
}
export async function reviewCob(input,deps={}) {
  if(input.portalChecked!==true || input.coverageRecorded!==true || input.billingOrderConfirmed!==true || typeof input.reference!=='string' || input.reference.trim().length<10 || input.reference.length>500)throw billingError(409,'Confirm payer evidence, saved coverage and billing order, and record a reference explaining the resolution.');
  const db=await (deps.pool || pool).getConnection();
  try{
    await db.beginTransaction();
    await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[input.clientId,input.agencyId]);
    const [[row]]=await db.execute("SELECT * FROM stedi_insurance_discoveries WHERE request_kind='cob' AND id=? AND agency_id=? AND client_id=? FOR UPDATE",[input.id,input.agencyId,input.clientId]);
    if(!row)throw billingError(404,'COB check not found');
    if(row.status==='reconciled'){await db.commit();return {id:row.id,status:'reconciled',reviewRequired:false};}
    if(row.status==='sending' && Date.now()-new Date(row.created_at).getTime()<180000)throw billingError(409,'This check is still processing.');
    const insurance=await (deps.readInsurance || readClientInsurance)(input.clientId,input.agencyId,db);
    if(!insurance?.verifiedForClaims || (policyIsMedicaid(insurance.primary) && insurance.secondary))throw billingError(409,'Save verified insurance and resolve Medicaid billing order first.');
    const result=decodeCob(row),decisions=input.decisions || [],findings=result.assessment?.findings || [];
    if(!Array.isArray(decisions) || decisions.length!==findings.length || new Set(decisions.map(d=>d.index)).size!==decisions.length)throw billingError(409,'Resolve every reported policy.');
    if(decisions.some(d=>d.status==='recorded')){
      const current=await (deps.snapshotFor || snapshotFor)(input,db),original=decryptFamilyBilling(row.request_encrypted,context(row)).snapshot.patient;
      if(!['firstName','lastName','dateOfBirth'].every(k=>current.patient[k] && normalizeDiscoveryName(current.patient[k])===normalizeDiscoveryName(original[k])))throw billingError(409,'The client identity changed since this check. Resolve the identity discrepancy with the payer.');
    }
    for(const finding of findings){
      const decision=decisions.find(d=>d.index===finding.index);
      if(!decision || !['recorded','not_applicable'].includes(decision.status) || typeof decision.reason!=='string' || decision.reason.trim().length<10 || decision.reason.length>500)throw billingError(409,'Record an explanation for each reported policy.');
      if(decision.status==='recorded'){
        if(!result.assessment.identityMatches)throw billingError(409,'The response identity differs or is incomplete. Confirm the payer correction before recording this result.');
        const policy=insurance[decision.slot];
        if(!['primary','secondary'].includes(decision.slot) || !finding.memberId || policy?.memberId!==finding.memberId || normalizeDiscoveryName(policy.insurerName)!==normalizeDiscoveryName(finding.payerName) || !policy.payerId)throw billingError(409,'Save the reported member ID, insurer and verified Claim.MD route in the selected policy first.');
        if(finding.order!=='undetermined' && finding.order!==decision.slot)throw billingError(409,'The saved position differs from the reported billing order. Document payer correction as not applicable, or correct the saved order.');
        const [[payer]]=await db.execute("SELECT d.claimmd_payer_id FROM medical_payer_setup_requests r JOIN medical_payer_setup_details d ON d.request_id=r.id WHERE r.agency_id=? AND d.claimmd_payer_id=? AND d.directory_status='id_match' LIMIT 1",[input.agencyId,policy.payerId]);
        if(!payer)throw billingError(409,'Confirm this agency’s Claim.MD payer route before resolving the check.');
      }
    }
    const review={reference:input.reference.trim(),portalChecked:true,coverageRecorded:true,billingOrderConfirmed:true,decisions:decisions.map(d=>({index:d.index,status:d.status,slot:d.status==='recorded'?d.slot:null,reason:d.reason.trim()})),reviewedAt:new Date().toISOString()};
    await db.execute("UPDATE stedi_insurance_discoveries SET status='reconciled',review_required=0,review_encrypted=?,reviewed_by_user_id=? WHERE id=?",[encryptFamilyBilling(review,context(row)),input.actorUserId,row.id]);
    await (deps.audit || auditBilling)({...input,userId:input.actorUserId,action:'stedi_cob_reconciled',objectId:row.id},db);
    await db.commit();return {id:row.id,status:'reconciled',reviewRequired:false};
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}
