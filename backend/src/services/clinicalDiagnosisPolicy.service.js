import { maybeEncryptNotePayload, maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { deriveCredentialTierFromText, isFullyLicensedCredentialText, isBachelorsCredentialText } from '../utils/credentialNormalization.js';
import { ageOnDate, diagnosisAlerts, evaluateDiagnosisRules, normalizeDiagnosisCode, validDiagnosisCode } from './clinicalDiagnosisPolicy.rules.js';

const object = value => { if(value && typeof value==='object')return value;try{return JSON.parse(value || '{}');}catch{return {};}};
const array = value => { const parsed=object(value);return Array.isArray(parsed)?parsed:[]; };
const fail=(status,message,code='DIAGNOSIS_REVIEW_REQUIRED')=>Object.assign(new Error(message),{status,code});
const credentialTierFor = actor => isBachelorsCredentialText(actor?.credential) && !isFullyLicensedCredentialText(actor?.credential) ? 'bachelors' : deriveCredentialTierFromText({userRole:actor?.role,providerCredentialText:actor?.credential});
const missingSchema=error=>['ER_NO_SUCH_TABLE','ER_BAD_FIELD_ERROR'].includes(error?.code);

export async function loadClientDiagnosesWithReviews({agencyId,clientId},db=clinicalPool) {
  const [rows]=await db.execute('SELECT * FROM clinical_diagnoses WHERE agency_id=? AND client_id=? AND is_active=1 ORDER BY is_primary DESC,id',[agencyId,clientId]);
  let reviews=[];
  try { [reviews]=await db.execute('SELECT * FROM clinical_diagnosis_reviews WHERE agency_id=? AND client_id=? ORDER BY id DESC',[agencyId,clientId]); }
  catch(error){ if(!missingSchema(error))throw error; }
  return (rows || []).map(d=>{
    const history=reviews.filter(r=>Number(r.diagnosis_id)===Number(d.id)).map(review=>({...review,evaluation_note:review.evaluation_note ? maybeDecryptNotePayload(review.evaluation_note) : null,review_reason:review.review_reason ? maybeDecryptNotePayload(review.review_reason) : ''}));
    const review=history[0];
    return {...d,reviewHistory:history,review:review ? {...review,evidenceDocumentIds:array(review.evidence_document_ids_json),evidenceVerified:array(review.evidence_document_ids_json).length>0 || (!!review.qualified_evaluator_user_id && !!String(review.evaluation_note || '').trim()),last_reviewed_at:review.reviewed_at} : {evidenceVerified:false}};
  });
}
export async function listClientDiagnosisAlerts({agencyId,clientId,asOfDate}={}) {
  return diagnosisAlerts(await loadClientDiagnosesWithReviews({agencyId,clientId}),{asOfDate});
}
async function providerContext({agencyId,providerUserId,clientId}) {
  const [[client]]=await pool.execute('SELECT id,agency_id,date_of_birth FROM clients WHERE id=? LIMIT 1',[clientId]);
  if(!client)throw fail(404,'Client not found.');
  const [[provider]]=providerUserId?await pool.execute('SELECT u.id,u.role,u.credential,ua.claim_billing_mode,ua.claim_billing_supervisor_user_id FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? WHERE u.id=? LIMIT 1',[agencyId,providerUserId]):[[]];
  const [supervisors]=providerUserId?await pool.execute("SELECT supervisor_id FROM supervisor_assignments WHERE agency_id=? AND supervisee_id=? AND supervisor_type IN ('clinical','billing') ORDER BY is_primary DESC,id",[agencyId,providerUserId]):[[]];
  const supervisorId=Number(provider?.claim_billing_supervisor_user_id || supervisors?.[0]?.supervisor_id)||null;
  let nonFAllowed=false;
  if(supervisorId) {
    try { const [[permission]]=await clinicalPool.execute('SELECT allow_non_f_primary FROM clinical_supervisor_diagnosis_permissions WHERE agency_id=? AND provider_user_id=? AND supervisor_user_id=? ORDER BY id DESC LIMIT 1',[agencyId,providerUserId,supervisorId]);nonFAllowed=Number(permission?.allow_non_f_primary)===1; }
    catch(error){if(!missingSchema(error))throw error;}
  }
  const [[agency]]=await pool.execute('SELECT feature_flags FROM agencies WHERE id=? LIMIT 1',[agencyId]);
  const policy=object(agency?.feature_flags).clinicalDiagnosisPolicy || {};
  const credentialTier=credentialTierFor(provider);
  return {client,provider,credentialTier,supervisorId,nonFAllowed,policy,supervised:!!supervisorId};
}
export async function evaluateClientDiagnosisPolicy({agencyId,clientId,providerUserId,serviceCode,dateOfService,diagnosisCodes,diagnoses=null,note=null}={}) {
  const metadata=object(note?.metadata_json || note?.metadataJson),context=note?.clinical_version_encounter_context || {};
  const service=String(serviceCode || context.serviceCode || metadata.serviceCode || '').toUpperCase();
  const date=String(dateOfService || context.dateOfService || metadata.dateOfService || new Date().toISOString().slice(0,10)).slice(0,10);
  const codeOf = row => normalizeDiagnosisCode(typeof row === 'string' ? row : row?.icd10_code || row?.icd10Code || row?.code);
  const frozen = [diagnoses,metadata.structuredChart?.diagnoses,metadata.structuredChart?.intakeDiagnoses,metadata.diagnoses]
    .filter(Array.isArray).flat().map(row => typeof row === 'string' ? {code:row} : row).filter(row=>codeOf(row));
  if(metadata.structuredChart?.primaryDiagnosis && codeOf(metadata.structuredChart.primaryDiagnosis))frozen.unshift(metadata.structuredChart.primaryDiagnosis);
  const metadataCodes = [metadata.diagnosisCodes,metadata.diagnosis_codes,metadata.structuredChart?.diagnosisCodes].filter(Array.isArray).flat().map(codeOf).filter(Boolean);
  const explicitCodes = [...new Set([...(Array.isArray(diagnosisCodes)?diagnosisCodes:[]),...metadataCodes,...frozen.map(codeOf)].map(codeOf).filter(Boolean))];
  // A pure digital screening needs no invented disorder. Explicitly recorded
  // diagnoses still undergo credential/justification checks, even when billing uses R69.
  if(service==='H0002' && (!explicitCodes.length || explicitCodes.every(code=>code==='R69')))return {ready:true,blockers:[],warnings:[],alerts:[]};
  const chart=await loadClientDiagnosesWithReviews({agencyId,clientId});
  const frozenPrimaryJustification = String(note?.diagnostic_justification || metadata.structuredChart?.diagnosticJustification || metadata.diagnosticJustification || '').trim();
  // Mutable chart text cannot retrospectively supply a signed note's rationale.
  // Legacy primary rationale is retained in the note snapshot; secondaries need
  // their own frozen rationale. Current evidence reviews remain separately auditable.
  const source = frozen.length ? frozen : note ? chart.map(row=>({...row,justification:''})) : chart;
  const selectedCodes = explicitCodes.length ? explicitCodes : source.map(codeOf);
  const selected = selectedCodes.map((code,index)=>{
    const record=source.find(row=>codeOf(row)===code)||{};
    const current=chart.find(row=>codeOf(row)===code);
    const justification=record.justification || (index===0 && note ? frozenPrimaryJustification : '');
    return {...record,justification,icd10_code:code,is_primary:index===0?1:0,review:current?.review || {evidenceVerified:false},created_at:record.created_at || current?.created_at};
  });
  if(!selected.length)return {ready:false,blockers:['A primary diagnosis with its own clinical justification is required.'],warnings:[],alerts:[]};
  const ctx=await providerContext({agencyId,clientId,providerUserId:providerUserId || note?.provider_signed_by_user_id || note?.created_by_user_id});
  return evaluateDiagnosisRules({diagnoses:selected,credentialTier:ctx.credentialTier,supervised:ctx.supervised,nonFAllowed:ctx.nonFAllowed,age:ageOnDate(ctx.client.date_of_birth,date),serviceCode:service,sdohServiceEligible:Array.isArray(ctx.policy.verifiedSdohServiceCodes) ? ctx.policy.verifiedSdohServiceCodes.includes(service) : undefined,asOfDate:date});
}
export async function assertClientDiagnosisPolicy(args) {
  const result=await evaluateClientDiagnosisPolicy(args);
  if(!result.ready)throw Object.assign(fail(409,result.blockers.join(' ')),{blockers:result.blockers,diagnosisAlerts:result.alerts});
  return result;
}
export async function validateDiagnosisWrite({agencyId,clientId,createdByUserId,icd10Code,justification,concernKind}) {
  if(concernKind==='learning_concern')return;
  if(!validDiagnosisCode(icd10Code))throw fail(400,'Enter a valid ICD-10-CM diagnosis code.');
  if(!String(justification || '').trim())throw fail(400,`${normalizeDiagnosisCode(icd10Code)} requires its own clinical justification.`);
  const [[actor]]=await pool.execute('SELECT u.role,u.credential FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? WHERE u.id=? LIMIT 1',[agencyId,createdByUserId]);
  if(!actor)throw fail(403,'An agency clinical relationship is required to add diagnoses.');
  const tier=credentialTierFor(actor);
  if(['bachelors','qbha'].includes(tier)&&normalizeDiagnosisCode(icd10Code).startsWith('F'))throw fail(403,"Bachelor's-level and QBHA providers cannot author F diagnoses.");
  const [[client]]=await pool.execute('SELECT id FROM clients WHERE id=? AND agency_id=? LIMIT 1',[clientId,agencyId]);
  if(!client) { const [[assignment]]=await pool.execute('SELECT client_id FROM client_agency_assignments WHERE client_id=? AND agency_id=? AND is_active=1 LIMIT 1',[clientId,agencyId]); if(!assignment)throw fail(404,'Client not found in this agency.'); }
}
export async function saveDiagnosisReview({agencyId,clientId,diagnosisId,actorUserId,input},db=clinicalPool) {
  const [[diagnosis]]=await db.execute('SELECT * FROM clinical_diagnoses WHERE id=? AND agency_id=? AND client_id=? AND is_active=1 LIMIT 1',[diagnosisId,agencyId,clientId]);
  if(!diagnosis)throw fail(404,'Diagnosis not found for this client.');
  const [[previous]] = await db.execute('SELECT * FROM clinical_diagnosis_reviews WHERE agency_id=? AND client_id=? AND diagnosis_id=? ORDER BY id DESC LIMIT 1',[agencyId,clientId,diagnosisId]);
  const reason = String(input.reason || '').trim();
  const hasNewEvaluation = Object.prototype.hasOwnProperty.call(input, 'evaluationNote');
  const evaluationNote = String(hasNewEvaluation ? input.evaluationNote || '' : (previous?.evaluation_note ? maybeDecryptNotePayload(previous.evaluation_note) : '')).trim();
  const month = String(input.stressorEventMonth ?? previous?.stressor_event_month ?? '').trim();
  if(!reason || reason.length>2000)throw fail(400,'A review reason is required (up to 2,000 characters).');
  if(month && (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month) || month > new Date().toISOString().slice(0,7)))throw fail(400,'Enter an event month as YYYY-MM that is not in the future.');
  const documentInput=input.evidenceDocumentIds ?? array(previous?.evidence_document_ids_json);
  if(!Array.isArray(documentInput))throw fail(400,'Supporting documents must be an array of existing document IDs.');
  const documents=[...new Set(documentInput.map(Number))];
  if(documents.some(id=>!Number.isSafeInteger(id)||id<1)||documents.length>20)throw fail(400,'Choose up to 20 existing supporting documents.');
  if(documents.length){const [rows]=await pool.execute(`SELECT id FROM client_phi_documents WHERE agency_id=? AND client_id=? AND id IN (${documents.map(()=>'?').join(',')})`,[agencyId,clientId,...documents]);if(rows.length!==documents.length)throw fail(400,'Every supporting document must belong to this client and agency.');}
  let evaluator = hasNewEvaluation ? null : previous?.qualified_evaluator_user_id || null;
  let evaluationAuthoredAt = hasNewEvaluation ? null : previous?.evaluation_authored_at || previous?.reviewed_at || null;
  if(hasNewEvaluation && evaluationNote){const [[actor]]=await pool.execute('SELECT credential FROM users WHERE id=? LIMIT 1',[actorUserId]);if(!isFullyLicensedCredentialText(actor?.credential))throw fail(403,'A qualified licensed clinician must document their own evaluation. An uploaded outside medical record may be selected instead.');if(evaluationNote.length>12000)throw fail(400,'Evaluation notes must be under 12,000 characters.');evaluator=actorUserId;evaluationAuthoredAt=new Date();}
  const [result]=await db.execute('INSERT INTO clinical_diagnosis_reviews (diagnosis_id,agency_id,client_id,evidence_document_ids_json,evaluation_note,qualified_evaluator_user_id,evaluation_authored_at,stressor_event_month,review_reason,reviewed_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?)',[diagnosisId,agencyId,clientId,JSON.stringify(documents),evaluationNote ? maybeEncryptNotePayload(evaluationNote) : null,evaluator,evaluationAuthoredAt,month || null,maybeEncryptNotePayload(reason),actorUserId]);
  return {id:result.insertId,diagnosisId,reviewedByUserId:actorUserId};
}
export async function readSupervisorDiagnosisPermission({agencyId,providerUserId}) {
  const [rows]=await clinicalPool.execute('SELECT * FROM clinical_supervisor_diagnosis_permissions WHERE agency_id=? AND provider_user_id=? ORDER BY id DESC',[agencyId,providerUserId]);
  return rows.map(row=>({...row,reason:row.reason ? maybeDecryptNotePayload(row.reason) : ''}));
}
export async function saveSupervisorDiagnosisPermission({agencyId,providerUserId,actorUserId,input}) {
  const [[assignment]]=await pool.execute("SELECT sa.id,u.credential FROM supervisor_assignments sa JOIN users u ON u.id=sa.supervisor_id WHERE sa.agency_id=? AND sa.supervisee_id=? AND sa.supervisor_id=? AND sa.supervisor_type IN ('clinical','billing') LIMIT 1",[agencyId,providerUserId,actorUserId]);
  if(!assignment || !isFullyLicensedCredentialText(assignment.credential))throw fail(403,'Only the assigned licensed supervisor may change their supervisee\'s non-F diagnosis permission.');
  if(typeof input.allowNonFPrimary!=='boolean')throw fail(400,'Choose whether non-F primary diagnoses are authorized.');
  const reason=String(input.reason || '').trim();if(!reason || reason.length>2000)throw fail(400,'A reason is required.');
  const [result]=await clinicalPool.execute('INSERT INTO clinical_supervisor_diagnosis_permissions (agency_id,provider_user_id,supervisor_user_id,allow_non_f_primary,reason) VALUES (?,?,?,?,?)',[agencyId,providerUserId,actorUserId,input.allowNonFPrimary?1:0,maybeEncryptNotePayload(reason)]);
  return {id:result.insertId,allowNonFPrimary:input.allowNonFPrimary};
}
