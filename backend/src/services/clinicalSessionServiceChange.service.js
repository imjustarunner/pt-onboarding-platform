import {createHash, randomUUID} from 'node:crypto';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import Appointment from '../models/Appointment.model.js';
import {requireNarrivaAgency,requireNarrivaClient,narrivaError,positiveId,parseNarrivaObject as parse} from './narrivaAccess.service.js';
import {readStaffCareEligibility} from './staffCareEligibility.service.js';
import {resolveAgencySchedulingCatalog} from './agencySchedulingCatalog.service.js';
import {resolveSessionBilling} from './serviceCodeUnits.service.js';
import {maybeEncryptNotePayload,maybeDecryptNotePayload} from './clinicalNoteCrypto.service.js';
import {decryptChatText} from './chatEncryption.service.js';
import {isClinicalAddon} from '../utils/clinicalServiceCodeCatalog.js';
import {isServiceCodeDeniedForTier} from '../utils/clinicalServiceCodeEligibility.js';
import {reconcileClinicalAfterHours} from './clinicalAfterHours.service.js';
export {assertNoPendingClinicalServiceChange} from '../utils/clinicalServiceChangePolicy.js';

const code=value=>String(value||'').trim().toUpperCase();
const failure=(message,status=409,errorCode='CLINICAL_SERVICE_CHANGE_CONFLICT')=>narrivaError(status,message,errorCode);
const stamp=()=>new Date().toISOString();
const hash=value=>createHash('sha256').update(value).digest('hex');
const array=value=>{if(Array.isArray(value))return value;try{const parsed=JSON.parse(value||'[]');return Array.isArray(parsed)?parsed:[];}catch{return [];}};
const utc=value=>value instanceof Date?value:new Date(`${String(value||'').replace(' ','T').replace(/Z$/,'')}Z`);

export function clinicalServiceChangeSummary(session) {
  const meta=parse(session?.metadata_json),duration=Number(session?.actual_duration_minutes||session?.duration_minutes)||Math.round((utc(session?.scheduled_end_at)-utc(session?.scheduled_start_at))/60000);
  const explicit=String(meta.narrivaContext?.modality||meta.sessionContext?.modality||meta.modality||'').toLowerCase();
  const remote=Number(session?.is_telehealth)===1||['02','10'].includes(String(session?.place_of_service||''));
  const modality=['in_person','phone','video'].includes(explicit)?explicit:remote?'':Number(session?.is_telehealth)===0||['11','03','12'].includes(String(session?.place_of_service))?'in_person':'';
  return {id:Number(session.id),clinicalSessionId:Number(session.id),agencyId:Number(session.agency_id),clientId:Number(session.client_id),serviceCode:code(session.service_code),durationMinutes:duration>0?duration:null,modality,
    locationLabel:session.location_label || meta.sessionContext?.locationLabel || '',serviceLocationId:Number(session.service_location_id)||null,
    billingOfficeLocationId:Number(session.billing_office_location_id)||null,placeOfService:String(session.place_of_service || ''),pendingServiceChange:!!meta.serviceCodeChangePending,durationReview:meta.serviceDurationReview || null};
}
function dependencies(overrides) {
  return {mainDb:pool,clinicalDb:clinicalPool,requireAgency:requireNarrivaAgency,requireClient:requireNarrivaClient,readEligibility:readStaffCareEligibility,resolveCatalog:resolveAgencySchedulingCatalog,
    setServiceCodes:(id,values,db)=>Appointment.setServiceCodes(id,values,{executor:db}),reconcileHours:reconcileClinicalAfterHours,encrypt:maybeEncryptNotePayload,decrypt:maybeDecryptNotePayload,now:stamp,uuid:randomUUID,...overrides};
}
async function ownedSession(db,user,input,{lock=false}={}) {
  const [[session]]=await db.execute(`SELECT * FROM clinical_sessions WHERE id=?${lock?' FOR UPDATE':''}`,[input.sessionId]);
  if(!session||Number(session.agency_id)!==input.agencyId||Number(session.provider_user_id)!==Number(user.id))throw failure('Your encounter is not available in this workspace.',404);
  if(input.clientId&&Number(input.clientId)!==Number(session.client_id))throw failure('The client does not match this encounter.');
  return session;
}
async function authorizedSession(db,user,input,d) {
  await d.requireAgency(user,input.agencyId);
  const session=await ownedSession(db,user,input);
  await d.requireClient(user,input.agencyId,Number(session.client_id));
  return session;
}
function checkedInput(input,write=false) {
  const result={...input,agencyId:positiveId(input.agencyId),sessionId:positiveId(input.sessionId)};
  if(!result.agencyId||!result.sessionId)throw failure('Choose a workspace and encounter.',400);
  if(!write)return result;
  result.serviceCode=code(input.serviceCode);
  result.expectedOldServiceCode=code(input.expectedOldServiceCode||input.previousServiceCode);
  result.justification=String(input.justification||'').trim();
  if(input.expectedOldServiceCode&&input.previousServiceCode&&code(input.expectedOldServiceCode)!==code(input.previousServiceCode))throw failure('The previous service codes conflict.',400);
  if(input.confirmed!==true||!result.serviceCode||!result.expectedOldServiceCode||!result.justification||result.justification.length>2000)throw failure('Explicitly confirm the original service, new service and a reason of up to 2,000 characters.',400,'CLINICAL_SERVICE_CHANGE_CONFIRMATION_REQUIRED');
  if(result.serviceCode===result.expectedOldServiceCode)throw failure('Choose a different service before confirming.',400);
  return result;
}
export async function getClinicalSessionService(user,input,overrides={}) {
  const d=dependencies(overrides),scoped=checkedInput(input),session=await authorizedSession(d.clinicalDb,user,scoped,d);
  const summary=clinicalServiceChangeSummary(session);
  const pending=parse(session.metadata_json).serviceCodeChangePending;
  let pendingConfirmation=null;
  if(pending&&Number(pending.actorUserId)===Number(user.id)){
    let justification;
    try{
      if(parse(pending.reasonCiphertext)._enc!==true)throw new Error('Unencrypted reason');
      justification=d.decrypt(pending.reasonCiphertext);
      if(hash(justification)!==pending.reasonHash)throw new Error('Reason hash mismatch');
    }catch{throw failure('The pending confirmation could not be decrypted. Restore secure encryption access before retrying this change.',503,'CLINICAL_SERVICE_CHANGE_PENDING');}
    pendingConfirmation={expectedOldServiceCode:pending.from,serviceCode:pending.to,justification};
  }
  return {...summary,session:summary,pendingConfirmation};
}
async function editableNotes(clinical,session,user) {
  if(session.billing_encounter_id)throw failure('This encounter is linked to billing. Change its service through the billing review workflow.');
  if(['cancelled','canceled','voided','no_show','missed','rescheduled'].includes(String(session.encounter_status).toLowerCase()))throw failure('A canceled, missed or replaced encounter cannot change service here.');
  const [notes]=await clinical.execute('SELECT * FROM clinical_notes WHERE clinical_session_id=? ORDER BY id FOR UPDATE',[session.id]);
  if(notes.some(note=>note.provider_signed_at||note.supervisor_cosigned_at||note.supervisor_signed_at||note.cosigned_at||Number(note.is_legal_hold)===1||note.content_review_source==='provider_review'||Number(note.created_by_user_id)!==Number(user.id)))throw failure('A signed, reviewed, held or another author’s note requires the existing amendment workflow.');
  const [claims]=await clinical.execute('SELECT id FROM clinical_claims WHERE clinical_session_id=? AND COALESCE(is_deleted,0)=0 LIMIT 1 FOR UPDATE',[session.id]);
  if(claims.length)throw failure('An existing claim requires the billing correction workflow before changing its service.');
  return notes;
}
async function eligibleTarget(main,session,user,input,d) {
  const care=await d.readEligibility(user.id,input.agencyId,main);
  if(!care.canProvideCare)throw failure('Current client-care privileges are required to change a service.',403);
  const catalog=await d.resolveCatalog({agencyId:input.agencyId,credentialTier:care.credentialTier,allServiceCodes:[],eligibleServiceCodes:[]});
  const selected=catalog.eligibleServiceCodes.find(row=>code(row.code)===input.serviceCode);
  if(!selected||isClinicalAddon(input.serviceCode,selected)||isServiceCodeDeniedForTier(care.credentialTier,input.serviceCode))throw failure('This service is not currently enabled for your qualifications in this workspace.',403,'SERVICE_CODE_NOT_ALLOWED');
  const [[medical]]=await main.execute('SELECT * FROM agency_medical_service_codes WHERE agency_id=? AND service_code=? FOR UPDATE',[input.agencyId,input.serviceCode]);
  if(!medical||Number(medical.is_active)!==1||Number(medical.is_addon)===1)throw failure('This service is not currently enabled in the medical catalog.',403,'SERVICE_CODE_NOT_ALLOWED');
  const current=clinicalServiceChangeSummary(session);
  if(!current.durationMinutes)throw failure('Record the actual encounter duration before changing its service.');
  if(input.durationMinutes!==undefined&&Number(input.durationMinutes)!==current.durationMinutes)throw failure('The duration changed. Save the actual encounter timing before confirming this service.');
  const supplied=String(input.modality||'').toLowerCase();
  if(supplied&&!['in_person','video','phone'].includes(supplied))throw failure('Choose the actual encounter delivery method.',400);
  const remote=Number(session.is_telehealth)===1||['02','10'].includes(String(session.place_of_service||''));
  if((supplied==='in_person'&&remote)||(supplied&&supplied!=='in_person'&&Number(session.is_telehealth)===0)||(current.modality&&supplied&&current.modality!==supplied))throw failure('The delivery method differs from this encounter. Correct the encounter details before changing the service.');
  const min=Math.max(Number(medical.min_minutes)||0,Number(selected.minDurationMinutes)||0)||null;
  const limits=[medical.max_minutes,selected.maxDurationMinutes].map(Number).filter(n=>n>0);
  const billing=resolveSessionBilling({minutes:current.durationMinutes,serviceCode:input.serviceCode,unitCalcMode:medical.unit_calc_mode,unitMinutes:medical.unit_minutes,minMinutes:min,maxMinutes:limits.length?Math.min(...limits):null,maxUnitsPerSession:medical.max_units_per_session,ladderBandsJson:medical.ladder_bands_json,overflowServiceCode:medical.overflow_service_code,overflowAtMinutes:medical.overflow_at_minutes});
  if((!billing.claimable&&!billing.requiresReview)||billing.overflowApplied||billing.effectiveServiceCode!==input.serviceCode)throw failure(billing.reason||'This duration requires a different service or billing review. No code has been substituted.',409,'SERVICE_DURATION_REVIEW_REQUIRED');
  const allowed=array(medical.allowed_place_of_service_json);
  if(allowed.length&&(!session.place_of_service||!allowed.map(String).includes(String(session.place_of_service))))throw failure('The encounter location does not meet the selected service policy.');
  return {...current,billingUnits:billing.claimable?billing.units:null,durationReview:billing.requiresReview?{requiresReview:true,code:billing.reviewCode,reason:billing.reason,actualMinutes:current.durationMinutes,units:billing.units,serviceCode:input.serviceCode}:null};
}
async function lockMainSources(main,session,input,{resume=false}={}) {
  let appointment=null,office=null;
  const allowed=new Set([input.expectedOldServiceCode,...resume?[input.serviceCode]:[]]);
  if(session.appointment_id){
    [[appointment]]=await main.execute('SELECT * FROM appointments WHERE id=? FOR UPDATE',[session.appointment_id]);
    if(!appointment||Number(appointment.agency_id)!==input.agencyId||Number(appointment.provider_user_id)!==Number(session.provider_user_id)||!allowed.has(code(appointment.service_code))||(appointment.clinical_session_id&&Number(appointment.clinical_session_id)!==Number(session.id)))throw failure('The appointment changed. Reopen the encounter before confirming its service.');
    if(appointment.package_entitlement_id||appointment.product_origin==='auricwell_ehr')throw failure('This booking requires its existing product or package service workflow.');
    const [participants]=await main.execute('SELECT client_id FROM appointment_participants WHERE appointment_id=? FOR UPDATE',[appointment.id]);
    const clients=new Set(participants.map(row=>Number(row.client_id)).filter(Boolean));
    if(clients.size>1||(clients.size===1&&!clients.has(Number(session.client_id))))throw failure('A shared appointment requires a coordinated group-service change in the main schedule.');
    if(session.office_event_id&&Number(appointment.office_event_id)!==Number(session.office_event_id))throw failure('The appointment source changed.');
  }
  if(session.office_event_id){
    [[office]]=await main.execute('SELECT e.*,l.agency_id AS location_agency_id,l.timezone AS source_timezone FROM office_events e JOIN office_locations l ON l.id=e.office_location_id WHERE e.id=? FOR UPDATE',[session.office_event_id]);
    if(!office||Number(office.booked_provider_id||office.assigned_provider_id)!==Number(session.provider_user_id)||!allowed.has(code(office.service_code)))throw failure('The scheduled service changed. Reopen the encounter before confirming.');
    if(Number(office.location_agency_id)!==input.agencyId){const [[shared]]=await main.execute('SELECT 1 FROM office_location_agencies WHERE office_location_id=? AND agency_id=?',[office.office_location_id,input.agencyId]);if(!shared)throw failure('The scheduled location belongs to another workspace.',403);}
    if(Number(office.client_id)!==Number(session.client_id))throw failure('A shared scheduled encounter requires a coordinated change in the main schedule.');
  }
  return {appointment,office};
}
function updatePayload(raw,target,d) {
  if(!raw)return raw;
  let plain=d.decrypt(typeof raw==='string'?raw:JSON.stringify(raw));
  let value;
  try{value=JSON.parse(plain);}catch{throw failure('The saved note payload could not be verified.');}
  // Older drafts used the chat envelope directly rather than the note envelope.
  if(value?.ciphertextB64){plain=decryptChatText(value);try{value=JSON.parse(plain);}catch{throw failure('The saved note payload could not be verified.');}}
  if(!value||typeof value!=='object'||Array.isArray(value))throw failure('The saved note payload could not be verified.');
  value.meta={...value.meta,serviceCode:target};
  if(value.meta.sessionContext)value.meta.sessionContext={...value.meta.sessionContext,serviceCode:target};
  return d.encrypt(JSON.stringify(value));
}
async function synchronizeMain(main,sources,session,input,d) {
  if(sources.appointment){
    const resolved=await d.reconcileHours({agencyId:input.agencyId,providerUserId:session.provider_user_id,primaryCode:input.serviceCode,startAt:sources.office?.start_at||sources.appointment.start_at||session.scheduled_start_at,timeZone:sources.office?.source_timezone||sources.appointment.source_timezone||session.source_timezone,
      modality:sources.appointment.modality||(Number(session.is_telehealth)===1?'TELEHEALTH':'IN_PERSON'),placeOfService:session.place_of_service,addonServiceCodes:array(sources.appointment.addon_service_codes_json),metadata:session.metadata_json},{database:main,readCare:d.readEligibility});
    await d.setServiceCodes(sources.appointment.id,{serviceCode:input.serviceCode,addonServiceCodes:resolved.addonServiceCodes},main);
    const [[verified]]=await main.execute('SELECT service_code FROM appointments WHERE id=?',[sources.appointment.id]);
    if(code(verified?.service_code)!==input.serviceCode)throw failure('The appointment service could not be synchronized.',503);
  }
  if(sources.office){const context=parse(sources.office.session_context_json);if(context.serviceCode)context.serviceCode=input.serviceCode;await main.execute('UPDATE office_events SET service_code=?,session_context_json=? WHERE id=?',[input.serviceCode,sources.office.session_context_json?JSON.stringify(context):null,sources.office.id]);}
  const [drafts]=await main.execute('SELECT * FROM clinical_note_drafts WHERE agency_id=? AND user_id=? AND clinical_session_id=? FOR UPDATE',[input.agencyId,session.provider_user_id,session.id]);
  for(const draft of drafts){const output=updatePayload(draft.output_json,input.serviceCode,d);await main.execute('UPDATE clinical_note_drafts SET service_code=?,output_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[input.serviceCode,output??null,draft.id]);}
  await main.execute('UPDATE note_aid_work_queue_items SET service_code=?,updated_at=CURRENT_TIMESTAMP WHERE agency_id=? AND user_id=? AND clinical_session_id=?',[input.serviceCode,input.agencyId,session.provider_user_id,session.id]);
}
/** Explicit code-only correction. A durable journal blocks generation/signing
 * between the main and clinical commits; the same confirmation safely resumes.
 * No booking move, rate update, clinical text generation or message send occurs. */
export async function changeClinicalSessionService(user,rawInput,overrides={}) {
  const d=dependencies(overrides),input=checkedInput(rawInput,true);
  await authorizedSession(d.clinicalDb,user,input,d);
  const main=await d.mainDb.getConnection(),clinical=await d.clinicalDb.getConnection();
  const lockName=`narriva-service:${input.agencyId}:${input.sessionId}`;
  let lock=false,mainOpen=false,clinicalOpen=false,pendingWritten=false,mainCommitted=false,mainCommitAttempted=false,newOperation=false,operation=null,mainRollbackFailed=false,clinicalRollbackFailed=false;
  try{
    const [[result]]=await main.execute('SELECT GET_LOCK(?,0) AS acquired',[lockName]);lock=Number(result?.acquired)===1;
    if(!lock)throw failure('Another service change is already in progress. Retry after it completes.');
    await main.beginTransaction();mainOpen=true;
    await clinical.beginTransaction();clinicalOpen=true;
    let session=await ownedSession(clinical,user,input,{lock:true});
    let meta=parse(session.metadata_json);
    operation=meta.serviceCodeChangePending||null;
    const reasonHash=hash(input.justification);
    if(operation&&(operation.actorUserId!==Number(user.id)||operation.from!==input.expectedOldServiceCode||operation.to!==input.serviceCode||operation.reasonHash!==reasonHash))throw failure('A different service change is pending. Resume its original confirmation before continuing.',409,'CLINICAL_SERVICE_CHANGE_PENDING');
    if(!operation&&code(session.service_code)===input.serviceCode&&array(meta.serviceCodeChanges).some(change=>change.from===input.expectedOldServiceCode&&change.to===input.serviceCode&&change.actorUserId===Number(user.id)&&change.reasonHash===reasonHash)){
      await eligibleTarget(main,session,user,input,d);
      await lockMainSources(main,session,{...input,expectedOldServiceCode:input.serviceCode});
      await clinical.commit();clinicalOpen=false;await main.commit();mainOpen=false;
      const summary=clinicalServiceChangeSummary(session);return {...summary,session:summary,changed:false};
    }
    if(!operation&&code(session.service_code)!==input.expectedOldServiceCode)throw failure('The original service changed. Reload the encounter before confirming.');
    if(operation&&![operation.from,operation.to].includes(code(session.service_code)))throw failure('The pending encounter changed and needs manual review.',409,'CLINICAL_SERVICE_CHANGE_PENDING');
    await editableNotes(clinical,session,user);
    const target=await eligibleTarget(main,session,user,input,d);
    const sources=await lockMainSources(main,session,input,{resume:!!operation});
    if(!operation){
      operation={operationId:d.uuid(),from:input.expectedOldServiceCode,to:input.serviceCode,actorUserId:Number(user.id),reasonHash,reasonCiphertext:d.encrypt(input.justification),requestedAt:d.now()};newOperation=true;
      meta={...meta,serviceCodeChangePending:operation};
      await clinical.execute('UPDATE clinical_sessions SET metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[JSON.stringify(meta),session.id]);
    }
    pendingWritten=true;await clinical.commit();clinicalOpen=false;
    await synchronizeMain(main,sources,session,input,d);
    mainCommitAttempted=true;await main.commit();mainOpen=false;mainCommitted=true;

    // Lock canonical sources again before clearing the fail-closed journal.
    await main.beginTransaction();mainOpen=true;
    await lockMainSources(main,session,{...input,expectedOldServiceCode:input.serviceCode});
    await clinical.beginTransaction();clinicalOpen=true;
    session=await ownedSession(clinical,user,input,{lock:true});meta=parse(session.metadata_json);
    if(meta.serviceCodeChangePending?.operationId!==operation.operationId)throw failure('The pending service change no longer matches this request.');
    const notes=await editableNotes(clinical,session,user);
    for(const note of notes){const noteMeta={...parse(note.metadata_json),serviceCode:input.serviceCode};if(noteMeta.sessionContext)noteMeta.sessionContext={...noteMeta.sessionContext,serviceCode:input.serviceCode};await clinical.execute('UPDATE clinical_notes SET note_payload=?,metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[updatePayload(note.note_payload,input.serviceCode,d),JSON.stringify(noteMeta),note.id]);}
    delete meta.serviceCodeChangePending;
    if(target.durationReview)meta.serviceDurationReview=target.durationReview;else delete meta.serviceDurationReview;
    if(meta.serviceCode)meta.serviceCode=input.serviceCode;
    if(meta.sessionContext)meta.sessionContext={...meta.sessionContext,serviceCode:input.serviceCode};
    if(meta.narrivaContext)meta.narrivaContext={...meta.narrivaContext,serviceCode:input.serviceCode};
    meta.serviceCodeChanges=[...array(meta.serviceCodeChanges),{...operation,completedAt:d.now()}];
    const durationHold=target.durationReview?`H0004_DURATION_REVIEW: ${target.durationReview.reason}`:null;
    await clinical.execute(`UPDATE clinical_sessions SET service_code=?,effective_service_code=?,billed_units=?,metadata_json=?,
      claim_blocked_reason=CASE WHEN claim_blocked_reason IS NULL OR claim_blocked_reason='' OR claim_blocked_reason LIKE 'H0004_DURATION_REVIEW:%' THEN ? ELSE claim_blocked_reason END,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`,[input.serviceCode,input.serviceCode,target.billingUnits,JSON.stringify(meta),durationHold,session.id]);
    await clinical.commit();clinicalOpen=false;
    await main.commit();mainOpen=false;
    const summary=clinicalServiceChangeSummary({...session,service_code:input.serviceCode,metadata_json:meta});
    return {...summary,session:summary,changed:true};
  }catch(error){
    if(mainOpen)try{await main.rollback();}catch{mainRollbackFailed=true;}
    if(clinicalOpen)try{await clinical.rollback();}catch{clinicalRollbackFailed=true;}
    if(pendingWritten&&!mainCommitted&&!mainCommitAttempted&&newOperation&&!mainRollbackFailed&&!clinicalRollbackFailed){
      try{
        await clinical.beginTransaction();
        const session=await ownedSession(clinical,user,input,{lock:true}),meta=parse(session.metadata_json);
        const matches=meta.serviceCodeChangePending?.operationId===operation.operationId&&code(session.service_code)===input.expectedOldServiceCode;
        if(matches){delete meta.serviceCodeChangePending;await clinical.execute('UPDATE clinical_sessions SET metadata_json=?,updated_at=CURRENT_TIMESTAMP WHERE id=?',[JSON.stringify(meta),session.id]);}
        await clinical.commit();if(matches)pendingWritten=false;
      }catch{try{await clinical.rollback();}catch{clinicalRollbackFailed=true;}}
    }
    if(pendingWritten)throw failure('The service change needs to finish synchronizing. Confirm the same original service, new service and reason again before generating or signing.',503,'CLINICAL_SERVICE_CHANGE_PENDING');
    throw error;
  }finally{
    if(lock)await main.execute('SELECT RELEASE_LOCK(?)',[lockName]).catch(()=>{});
    if(mainRollbackFailed&&typeof main.destroy==='function')main.destroy();else main.release();
    if(clinicalRollbackFailed&&typeof clinical.destroy==='function')clinical.destroy();else clinical.release();
  }
}
