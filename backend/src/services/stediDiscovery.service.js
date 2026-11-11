import pool from '../config/database.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { auditBilling, billingError } from './familyBillingPolicy.service.js';
import { readClientInsurance, insuranceDemographics } from './clientInsurance.service.js';
import { listClaimMdBillingProfiles } from './claimMdBillingProfile.service.js';
import { queueInsuranceVerificationSafely } from './insuranceVerificationTask.service.js';
import { policyIsMedicaid } from '../utils/insurancePaymentPolicy.js';
import { assertLiveClearinghouseAgency } from './syntheticClearinghouseGuard.service.js';
import { STEDI_AGENCIES, discoveryMonth, discoveryPatient, discoveryFingerprint, validateDiscoveryConfirmation, stediDiscoveryPayload, discoveryCandidate, discoveryNpiValid } from './stediDiscoveryPolicy.js';

const context = row => `stedi-discovery:${row.agency_id}:${row.client_id}`;
export function stediDiscoveryConfigured(agencyId) {
  return STEDI_AGENCIES.includes(Number(agencyId)) && process.env.STEDI_DISCOVERY_ENABLED === 'true' && !!process.env.STEDI_API_KEY;
}
async function patientFor({agencyId,clientId}, db = pool) {
  return discoveryPatient(await readClientInsurance(clientId,agencyId,db), await insuranceDemographics(clientId,agencyId,db));
}
export function decodeDiscovery(row) {
  const request = decryptFamilyBilling(row.request_encrypted,context(row));
  const response = decryptFamilyBilling(row.response_encrypted,context(row));
  return { id: row.id, status: row.status, serviceDate: row.service_date instanceof Date ? row.service_date.toISOString().slice(0,10) : row.service_date,
    createdAt: row.created_at, reviewRequired: !!row.review_required, discoveryId: row.discovery_id,
    response, reviews: decryptFamilyBilling(row.review_encrypted,context(row)) || [],
    candidates: (response?.items || []).map((item,index) => discoveryCandidate(item,index,request.patient)) };
}
export async function discoveryWorkspace(scope, deps = {}) {
  const db = deps.db || pool, patient = await (deps.patientFor || patientFor)(scope,db);
  const [rows] = await db.execute('SELECT * FROM stedi_insurance_discoveries WHERE agency_id=? AND client_id=? ORDER BY id DESC LIMIT 20',[scope.agencyId,scope.clientId]);
  const [[budget]] = await db.execute('SELECT reserved_count FROM stedi_discovery_budget WHERE month_key=?',[discoveryMonth()]);
  const enabled = stediDiscoveryConfigured(scope.agencyId);
  const offices = enabled ? await (deps.offices || listClaimMdBillingProfiles)(scope.agencyId) : [];
  return { enabled, patient, fingerprint: discoveryFingerprint(patient), offices: offices.map(o => ({ id:o.id, name:o.name, available:discoveryNpiValid(o.practice_npi) })),
    usedThisMonth:Number(budget?.reserved_count || 0), estimatedPriceCents:150, priceCheckedOn:'2026-11-10', searches:rows.map(decodeDiscovery) };
}

/** A shared usage lock serializes reservations across all three agencies.
 * Reserve durably before any network request; a crash is never retried as POST. */
export async function reserveDiscovery(input, deps = {}) {
  if (!STEDI_AGENCIES.includes(Number(input.agencyId))) throw billingError(403,'Insurance discovery is unavailable for this agency');
  const db = await (deps.pool || pool).getConnection();
  try {
    await db.beginTransaction();
    const month = discoveryMonth();
    await db.execute('INSERT INTO stedi_discovery_budget (month_key) VALUES (?) ON DUPLICATE KEY UPDATE reserved_count=reserved_count',[month]);
    await db.execute('SELECT reserved_count FROM stedi_discovery_budget WHERE month_key=? FOR UPDATE',[month]);
    const [[client]] = await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[input.clientId,input.agencyId]);
    if (!client) throw billingError(404,'Client not found in this agency');
    const patient = await (deps.patientFor || patientFor)(input,db);
    validateDiscoveryConfirmation(input,patient);
    const [[duplicate]] = await db.execute(`SELECT * FROM stedi_insurance_discoveries WHERE agency_id=? AND client_id=? AND
      (request_key=? OR (?=0 AND identity_fingerprint=? AND service_date=? AND created_at>UTC_TIMESTAMP()-INTERVAL 30 DAY)) ORDER BY id DESC LIMIT 1`,[input.agencyId,input.clientId,input.requestKey,input.freshSearch===true?1:0,input.fingerprint,input.serviceDate]);
    if (duplicate) { await db.commit(); return {row:duplicate,reused:true}; }
    const [[recent]] = await db.execute(`SELECT id FROM stedi_insurance_discoveries WHERE agency_id=? AND client_id=? AND
      (status IN ('sending','pending','unknown') OR review_required=1) LIMIT 1`,[input.agencyId,input.clientId]);
    if (recent) throw billingError(409,'An unresolved search already exists. Retrieve its results or reconcile the attempt before paying for another search.');
    const offices = await (deps.offices || listClaimMdBillingProfiles)(input.agencyId);
    const office = offices.find(o => Number(o.id) === Number(input.billingOfficeId));
    if (!office) throw billingError(409,'Choose a billing office belonging to this agency');
    const payload = stediDiscoveryPayload(patient,office.practice_npi,input.serviceDate);
    const row = { agency_id:input.agencyId, client_id:input.clientId, status:'sending', service_date:input.serviceDate };
    const request = {patient,payload,reason:input.reason,freshSearch:input.freshSearch===true,repeatReason:input.freshSearch===true?input.repeatReason.trim():'',missingAddressReason:input.missingAddressReason || '',confirmedAt:new Date().toISOString(),nameConfirmed:true,birthdateConfirmed:true,addressConfirmed:true,costConfirmed:true,billingOfficeId:office.id};
    const encrypted = encryptFamilyBilling(request,context(row));
    const [insert] = await db.execute(`INSERT INTO stedi_insurance_discoveries (agency_id,client_id,actor_user_id,request_key,identity_fingerprint,service_date,month_key,status,request_encrypted)
      VALUES (?,?,?,?,?,?,?,'sending',?)`,[input.agencyId,input.clientId,input.actorUserId,input.requestKey,input.fingerprint,input.serviceDate,month,encrypted]);
    await db.execute('UPDATE stedi_discovery_budget SET reserved_count=reserved_count+1 WHERE month_key=?',[month]);
    await (deps.audit || auditBilling)({agencyId:input.agencyId,clientId:input.clientId,userId:input.actorUserId,action:'stedi_discovery_requested',objectId:insert.insertId},db);
    await db.commit();
    return {row:{...row,id:insert.insertId,request_encrypted:encrypted},payload,reused:false};
  } catch(e) { await db.rollback(); throw e; } finally { db.release(); }
}

/** Fixed origin, no redirects or automatic retries; never log HTTP error bodies. */
export async function callStediDiscovery({discoveryId,payload}, deps = {}) {
  if (discoveryId && !/^[a-zA-Z0-9_-]{1,128}$/.test(discoveryId)) throw billingError(409,'Invalid saved discovery reference');
  const response = await (deps.fetch || fetch)(`https://healthcare.us.stedi.com/2024-04-01/insurance-discovery/check/v1${discoveryId ? `/${discoveryId}` : ''}`, {
    method:discoveryId?'GET':'POST', redirect:'error', signal:AbortSignal.timeout(125000),
    headers:{Authorization:process.env.STEDI_API_KEY,'Content-Type':'application/json'},...(discoveryId?{}:{body:JSON.stringify(payload)})
  });
  // A definite HTTP rejection is still counted conservatively against our cap.
  if (![200,202,502].includes(response.status)) throw billingError(502,'Stedi could not return this search. Check the saved search in Stedi before trying again.');
  const bytes = [];
  let size = 0;
  for await (const chunk of response.body) { size += chunk.length; if (size > 5*1024*1024) throw billingError(502,'The Stedi response exceeded the supported size; reconcile it in Stedi.'); bytes.push(chunk); }
  const value = JSON.parse(Buffer.concat(bytes).toString('utf8'));
  if (!['PENDING','COMPLETE','ERROR'].includes(value.status) || !/^[a-zA-Z0-9_-]{1,128}$/.test(value.discoveryId || '') || !Array.isArray(value.items)) throw billingError(502,'Stedi returned an unexpected response. Reconcile the search before retrying.');
  if (discoveryId && value.discoveryId !== discoveryId) throw billingError(502,'Stedi returned a different search reference');
  return value;
}
async function storeResponse(scope,row,response, deps = {}) {
  const db = deps.db || pool;
  const status = ({PENDING:'pending',COMPLETE:'complete',ERROR:'error'})[response.status];
  const review = response.items.length > 0;
  await db.execute(`UPDATE stedi_insurance_discoveries SET status=?,discovery_id=?,response_encrypted=?,review_required=?,poll_started_at=NULL WHERE id=? AND agency_id=? AND client_id=?`,[status,response.discoveryId,encryptFamilyBilling(response,context(row)),review?1:0,row.id,scope.agencyId,scope.clientId]);
  if (review || status === 'error') await (deps.queueFollowUp || queueInsuranceVerificationSafely)({...scope,reason:review?'coverage_coordination':'eligibility_unresolved'});
  return {...decodeDiscovery({...row,status,discovery_id:response.discoveryId,response_encrypted:encryptFamilyBilling(response,context(row)),review_required:review?1:0})};
}
export async function startDiscovery(input, deps = {}) {
  if (!(deps.configured || stediDiscoveryConfigured)(input.agencyId)) throw billingError(409,'Stedi insurance discovery has not been connected for this agency.');
  await (deps.assertLive || assertLiveClearinghouseAgency)(input.agencyId);
  const reserved = await (deps.reserve || reserveDiscovery)(input,deps);
  if (reserved.reused) return {...decodeDiscovery(reserved.row),reused:true};
  let response;
  try { response = await (deps.call || callStediDiscovery)({payload:reserved.payload}); }
  catch { await (deps.db || pool).execute("UPDATE stedi_insurance_discoveries SET status='unknown' WHERE id=? AND agency_id=? AND client_id=?",[reserved.row.id,input.agencyId,input.clientId]); await (deps.queueFollowUp || queueInsuranceVerificationSafely)({...input,reason:'eligibility_unresolved'}); return {...decodeDiscovery({...reserved.row,status:'unknown'}),message:'The outcome is uncertain. Do not start another search; billing must reconcile this request in Stedi.'}; }
  // Storage errors propagate without resubmitting the paid request.
  return storeResponse(input,reserved.row,response,deps);
}
export async function refreshDiscovery(scope, deps = {}) {
  const db = deps.db || pool;
  const [[row]] = await db.execute('SELECT * FROM stedi_insurance_discoveries WHERE id=? AND agency_id=? AND client_id=?',[scope.id,scope.agencyId,scope.clientId]);
  if (!row) throw billingError(404,'Search not found');
  if (row.status !== 'pending' || !row.discovery_id) return decodeDiscovery(row);
  if (!(deps.configured || stediDiscoveryConfigured)(scope.agencyId)) throw billingError(409,'Reconnect Stedi to retrieve this search');
  await (deps.assertLive || assertLiveClearinghouseAgency)(scope.agencyId);
  const [claimed] = await db.execute(`UPDATE stedi_insurance_discoveries SET poll_started_at=UTC_TIMESTAMP(6) WHERE id=? AND status='pending' AND (poll_started_at IS NULL OR poll_started_at<UTC_TIMESTAMP()-INTERVAL 3 MINUTE)`,[row.id]);
  if (!claimed.affectedRows) return {...decodeDiscovery(row),message:'This result is already being retrieved.'};
  try { const response = await (deps.call || callStediDiscovery)({discoveryId:row.discovery_id}); return await storeResponse(scope,row,response,deps); }
  catch { return {...decodeDiscovery(row),message:'Results are not available yet. Refresh this existing search later; no new search was sent.'}; }
}
export async function reviewDiscovery(input, deps = {}) {
  const db = await (deps.pool || pool).getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[input.clientId,input.agencyId]);
    const [[row]] = await db.execute('SELECT * FROM stedi_insurance_discoveries WHERE id=? AND agency_id=? AND client_id=? FOR UPDATE',[input.id,input.agencyId,input.clientId]);
    if (!row) throw billingError(404,'Search not found');
    const current = decodeDiscovery(row), decisions = input.decisions;
    if (row.status !== 'complete' || !current.candidates.length) throw billingError(409,'Only completed matches can be reconciled here.');
    if (input.otherCoverageChecked !== true) throw billingError(409,'Review the full response for additional insurers and record any other coverage before completing this review.');
    if (!Array.isArray(decisions) || decisions.length !== current.candidates.length || new Set(decisions.map(d=>d.index)).size !== decisions.length) throw billingError(409,'Review every returned match.');
    const insurance = await (deps.readInsurance || readClientInsurance)(input.clientId,input.agencyId,db);
    if (policyIsMedicaid(insurance?.primary) && insurance?.secondary) throw billingError(409,'Resolve Medicaid payer order before completing this review.');
    for (const candidate of current.candidates) {
      const decision = decisions.find(d=>d.index===candidate.index);
      if (!decision || !['recorded','not_applicable'].includes(decision.status) || typeof decision.reason !== 'string' || decision.reason.trim().length < 10 || decision.reason.length > 500) throw billingError(409,'Record a decision and explanation for every match.');
      if (decision.status === 'recorded') {
        const currentPatient = await (deps.patientFor || patientFor)(input,db);
        const match = discoveryCandidate(candidate.response,candidate.index,currentPatient);
        if (!match.identityMatches) throw billingError(409,'The returned name or birthdate does not match this client. Resolve the identity discrepancy before recording this match.');
        const policy = insurance?.[decision.slot];
        if (!['primary','secondary'].includes(decision.slot) || !candidate.policy.memberId || policy?.memberId !== candidate.policy.memberId || !policy.payerId || decision.identityConfirmed !== true || decision.payerConfirmed !== true || decision.coverageConfirmed !== true) throw billingError(409,'Save this matched member ID and its verified Claim.MD payer route in the chosen policy, then confirm identity, payer and coverage dates.');
        const [[payer]] = await db.execute(`SELECT d.claimmd_payer_id FROM medical_payer_setup_requests r JOIN medical_payer_setup_details d ON d.request_id=r.id WHERE r.agency_id=? AND d.claimmd_payer_id=? AND d.directory_status='id_match' LIMIT 1`,[input.agencyId,policy.payerId]);
        if (!payer) throw billingError(409,'Confirm the saved payer route in this agency’s Claim.MD payer directory.');
      }
    }
    const safe = decisions.map(d => ({index:d.index,status:d.status,slot:d.status==='recorded'?d.slot:null,reason:d.reason.trim(),identityConfirmed:d.identityConfirmed===true,payerConfirmed:d.payerConfirmed===true,coverageConfirmed:d.coverageConfirmed===true}));
    await db.execute('UPDATE stedi_insurance_discoveries SET review_required=0,review_encrypted=?,reviewed_by_user_id=? WHERE id=?',[encryptFamilyBilling({decisions:safe,otherCoverageChecked:true,reviewedAt:new Date().toISOString()},context(row)),input.actorUserId,row.id]);
    await (deps.audit || auditBilling)({agencyId:input.agencyId,clientId:input.clientId,userId:input.actorUserId,action:'stedi_discovery_reviewed',objectId:row.id},db);
    await db.commit(); return {id:row.id,reviewRequired:false};
  } catch(e) { await db.rollback(); throw e; } finally { db.release(); }
}

export async function reconcileUncertainDiscovery(input, deps = {}) {
  if (input.portalChecked !== true || input.coverageRecorded !== true || typeof input.reference !== 'string' || input.reference.trim().length < 10 || input.reference.length > 500) throw billingError(409,'Check this attempt in the Stedi portal, record any returned coverage, and provide a reconciliation reference.');
  const db = deps.db || pool;
  const [[row]] = await db.execute('SELECT * FROM stedi_insurance_discoveries WHERE id=? AND agency_id=? AND client_id=?',[input.id,input.agencyId,input.clientId]);
  if (!row) throw billingError(404,'Search not found');
  const evidence = encryptFamilyBilling({reference:input.reference.trim(),portalChecked:true,coverageRecorded:true,reconciledAt:new Date().toISOString()},context(row));
  const [updated] = await db.execute(`UPDATE stedi_insurance_discoveries SET status='reconciled',review_required=0,review_encrypted=?,reviewed_by_user_id=? WHERE id=? AND agency_id=? AND client_id=? AND
    (status IN ('unknown','error') OR (status='sending' AND created_at<UTC_TIMESTAMP()-INTERVAL 3 MINUTE))`,[evidence,input.actorUserId,row.id,input.agencyId,input.clientId]);
  if (!updated.affectedRows) throw billingError(409,'This search is still processing or has results that must be reviewed.');
  await (deps.audit || auditBilling)({agencyId:input.agencyId,clientId:input.clientId,userId:input.actorUserId,action:'stedi_discovery_reconciled',objectId:row.id},db);
  return {id:row.id,status:'reconciled'};
}
