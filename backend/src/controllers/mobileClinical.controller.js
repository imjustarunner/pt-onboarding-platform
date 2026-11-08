import pool from '../config/database.js';
import {runWithAgencyAccess} from '../utils/agencyAccessContext.js';
import clinicalPool from '../config/clinicalDatabase.js';
import User from '../models/User.model.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import ClinicalNoteDraft from '../models/ClinicalNoteDraft.model.js';
import ClinicalTreatmentPlan from '../models/clinical/ClinicalTreatmentPlan.model.js';
import ClinicalTreatmentObjectiveRating from '../models/clinical/ClinicalTreatmentObjectiveRating.model.js';
import NoteAidWorkQueueItem from '../models/NoteAidWorkQueueItem.model.js';
import SessionRecording from '../models/SessionRecording.model.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import {requireNarrivaAgency,requireNarrivaClient,maskMobileClientName,positiveId,narrivaError,parseNarrivaObject as parse} from '../services/narrivaAccess.service.js';
import {loadNarrivaSource,decryptNarrivaDraft} from '../services/narrivaSource.service.js';
import {ageAtServiceDate} from '../services/noteAidAge.service.js';
import {readStaffCareEligibility} from '../services/staffCareEligibility.service.js';
import {resolveAgencySchedulingCatalog} from '../services/agencySchedulingCatalog.service.js';
import {narrivaWriterCapabilities} from '../services/narrivaReview.service.js';
import {clinicalAccess} from '../services/guardianClinicalAccess.service.js';
import {clientSecureAudience,ensureClientSecureConversation} from '../services/clientSecureConversation.service.js';
import {resolveRelayFamily} from '../services/providerSmsRelayIdentity.service.js';
import {sendClinicalSms} from '../services/clinicalSmsSend.service.js';
import {getAuthorizedRecordingNarrative} from '../services/clinicalSessionRecording.service.js';

const present=value=>value!==null&&value!==undefined&&value!=='';
const checkedId=(value,label)=>{if(!present(value))return null;const id=positiveId(value);if(!id)throw narrivaError(400,`Invalid ${label}.`);return id;};
const dateOnly=value=>value instanceof Date?value.toISOString().slice(0,10):String(value || '').slice(0,10);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const active=user=>user && ![0,false,'0'].includes(user.is_active) && ['ACTIVE','ACTIVE_EMPLOYEE'].includes(String(user.status || '').toUpperCase());

/** A primary mobile session never gains the full bearer-token API surface. */
export async function requireMobileClinicalSession(req,res,next) {
 try {
  res.set('Cache-Control','no-store');
  if(req.mobileClinical?.verified){
   const scopedAgency=req.mobileClinical.agencyId;
   for(const value of [req.query?.agencyId,req.body?.agencyId,req.params?.agencyId])if(present(value)&&Number(value)!==scopedAgency)throw narrivaError(403,'This mobile session is scoped to a different workspace.');
   req.query={...req.query,agencyId:scopedAgency};req.body={...req.body,agencyId:scopedAgency};return runWithAgencyAccess(scopedAgency,()=>next(),{userId:req.user.id,access:req.user.agencyAccess});
  }
  const qv=req.quickView;
  if(!qv?.mobileDeviceSessionId || !positiveId(qv.userId) || !positiveId(qv.agencyId))throw narrivaError(403,'Sign into Auricwell mobile with your account to open clinical work.');
  const agencyId=Number(qv.agencyId);
  for(const value of [req.query?.agencyId,req.body?.agencyId,req.params?.agencyId])if(present(value)&&Number(value)!==agencyId)throw narrivaError(403,'This mobile session is scoped to a different workspace.');
  const user=await User.findById(qv.userId,{raw:true});
  if(!active(user))throw narrivaError(403,'Your account is no longer active.');
  // Enforce the token workspace even for a globally privileged account.
  const [[membership]]=await pool.execute(`SELECT 1 FROM user_agencies ua JOIN agencies a ON a.id=ua.agency_id WHERE ua.user_id=? AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 LIMIT 1`,[qv.userId,agencyId]);
  if(!membership)throw narrivaError(403,'Your workspace membership is no longer active.');
  await requireNarrivaAgency(user,agencyId);
  req.user={...user,id:Number(user.id)};
  req.mobileClinical={verified:true,userId:Number(user.id),agencyId};
  req.query={...req.query,agencyId};req.body={...req.body,agencyId};
  req.headers={...req.headers,'x-agency-id':String(agencyId)};
  req.medicalBillingAgencyId=agencyId;req.auricwellPreview={agencyId};
  return runWithAgencyAccess(agencyId,()=>next(),{userId:req.user.id,access:req.user.agencyAccess});
 }catch(error){next(error);}
}
async function ensurePrimary(req,res) {await new Promise((resolve,reject)=>requireMobileClinicalSession(req,res,error=>error?reject(error):resolve()));}
function assertSame(value,actual,label){if(present(value)&&Number(value)!==Number(actual))throw narrivaError(409,`${label} does not match the selected client or encounter.`);}
function scopeBody(req,clientId){for(const value of [req.body?.clientId,req.query?.clientId])if(present(value))assertSame(value,clientId,'Client');req.body={...req.body,clientId};req.query={...req.query,clientId};}
export function stripMobileClinicalIdentifiers(value) {
 if(value instanceof Date)return value.toISOString();
 if(Array.isArray(value))return value.map(stripMobileClinicalIdentifiers);
 if(!value||typeof value!=='object')return value;
 const out={};for(const[key,item]of Object.entries(value))if(!/^(?:client_?name|client_?dob|client_?initials|initials|date_?of_?birth|birth_?date|dob|guardian_?name|clientPayer|linkedClaim|versions)$/i.test(key))out[key]=stripMobileClinicalIdentifiers(item);
 return out;
}
/** Narrowly scoped adapter; existing controller permission and signature checks still run. */
export function scopedMobileClinicalHandler(handler,{clientParam=null,draftParam=null,noteParam=null,sessionParam=null,recordingParam=null,objectiveParam=null,requireClient=false,authorOnly=false,maskRecordingNames=false}={}) {
 return async(req,res,next)=>{
  try{
   await ensurePrimary(req,res);const {agencyId,userId}=req.mobileClinical;let clientId=checkedId(clientParam?req.params[clientParam]:req.body.clientId||req.query.clientId,'client'),reviewer=false;
   if(draftParam){const id=checkedId(req.params[draftParam],'draft');const draft=await ClinicalNoteDraft.findByIdForUser({draftId:id,userId});if(!draft||Number(draft.agency_id)!==agencyId)throw narrivaError(404,'Draft is not available in this workspace.');assertSame(clientId,draft.client_id,'Client');clientId=positiveId(draft.client_id);req.mobileClinical.draft=draft;}
   if(noteParam){const source=await loadNarrivaSource(req.user,{agencyId,noteId:checkedId(req.params[noteParam],'note')});assertSame(clientId,source.client.id,'Client');clientId=Number(source.client.id);reviewer=true;if(authorOnly&&Number(source.source.created_by_user_id)!==userId)throw narrivaError(403,'Only the author can sign this note.');req.mobileClinical.noteSource=source;}
   if(sessionParam){const session=await ClinicalSession.findById(checkedId(req.params[sessionParam],'session'));if(!session||Number(session.agency_id)!==agencyId||Number(session.provider_user_id)!==userId)throw narrivaError(404,'Your clinical session is not available in this workspace.');assertSame(clientId,session.client_id,'Client');clientId=positiveId(session.client_id);req.mobileClinical.session=session;}
   if(recordingParam){const recording=await SessionRecording.findByIdForUser({id:checkedId(req.params[recordingParam],'recording'),userId});if(!recording||Number(recording.agency_id)!==agencyId)throw narrivaError(404,'Recording is not available in this workspace.');assertSame(clientId,recording.client_id,'Client');clientId=positiveId(recording.client_id);}
   if(objectiveParam){const [[objective]]=await clinicalPool.execute(`SELECT p.agency_id,p.client_id FROM clinical_treatment_plan_objectives o JOIN clinical_treatment_plan_goals g ON g.id=o.goal_id JOIN clinical_treatment_plans p ON p.id=g.treatment_plan_id WHERE o.id=?`,[checkedId(req.params[objectiveParam],'objective')]);if(!objective||Number(objective.agency_id)!==agencyId)throw narrivaError(404,'Objective is not available in this workspace.');assertSame(clientId,objective.client_id,'Client');clientId=positiveId(objective.client_id);}
   // Saved draft IDs in generate/attach bodies must be checked before invoking
   // a model or persisting a note, not only after the writer completes.
   const bodyDraftId=checkedId(req.body.draftId||req.body.metadata?.draftId,'draft');
   if(bodyDraftId&&!draftParam){const linked=await ClinicalNoteDraft.findByIdForUser({draftId:bodyDraftId,userId});if(!linked||Number(linked.agency_id)!==agencyId)throw narrivaError(404,'Draft is not available in this workspace.');assertSame(clientId,linked.client_id,'Client');clientId=positiveId(linked.client_id);if(req.body.clinicalSessionId&&linked.clinical_session_id)assertSame(req.body.clinicalSessionId,linked.clinical_session_id,'Draft encounter');if(req.body.officeEventId&&linked.office_event_id)assertSame(req.body.officeEventId,linked.office_event_id,'Draft appointment');}
   if(sessionParam&&req.body.clinicalSessionId)assertSame(req.body.clinicalSessionId,req.mobileClinical.session.id,'Encounter');
   if(sessionParam&&req.body.officeEventId)assertSame(req.body.officeEventId,req.mobileClinical.session.office_event_id,'Appointment');
   if(!noteParam&&req.body.clinicalSessionId){const linked=await ClinicalSession.findById(checkedId(req.body.clinicalSessionId,'session'));if(!linked||Number(linked.agency_id)!==agencyId||Number(linked.provider_user_id)!==userId)throw narrivaError(404,'Your clinical session is not available.');assertSame(clientId,linked.client_id,'Client');clientId=positiveId(linked.client_id);}
   if(!noteParam&&req.body.officeEventId){const [[office]]=await pool.execute('SELECT e.*,l.agency_id AS location_agency_id FROM office_events e JOIN office_locations l ON l.id=e.office_location_id WHERE e.id=?',[checkedId(req.body.officeEventId,'appointment')]);if(!office||Number(office.booked_provider_id||office.assigned_provider_id)!==userId)throw narrivaError(403,'Open your own scheduled appointment.');if(Number(office.location_agency_id)!==agencyId){const [[shared]]=await pool.execute('SELECT 1 FROM office_location_agencies WHERE office_location_id=? AND agency_id=?',[office.office_location_id,agencyId]);if(!shared)throw narrivaError(403,'This appointment belongs to another workspace.');}if(clientId&&Number(office.client_id)!==clientId){const [[member]]=await pool.execute('SELECT 1 FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id WHERE a.office_event_id=? AND a.agency_id=? AND a.provider_user_id=? AND p.client_id=?',[office.id,agencyId,userId,clientId]);if(!member)throw narrivaError(403,'The client is not part of this appointment.');}clientId=clientId||positiveId(office.client_id);}
   if(clientId){await requireNarrivaClient(req.user,agencyId,clientId,{authorizedNoteReviewer:reviewer});scopeBody(req,clientId);}
   else if(requireClient)throw narrivaError(400,'Choose an authorized clinical client.');
   const original=res.json;res.json=function(body){res.json=original;let filtered=stripMobileClinicalIdentifiers(body);if(recordingParam||maskRecordingNames){for(const person of filtered.participants||[])if(person.name)person.name=maskMobileClientName({full_name:person.name});for(const person of filtered.signers||[])if(person.name)person.name=maskMobileClientName({full_name:person.name});for(const person of filtered.participants||[])for(const signer of person.signers||[])if(signer.name)signer.name=maskMobileClientName({full_name:signer.name});}return original.call(this,filtered);};
   await handler(req,res,next);
  }catch(error){next(error);}
 };
}
function instant(value){if(!value)return null;if(value instanceof Date)return value;const raw=String(value);const date=new Date(/Z$|[+-]\d\d:\d\d$/.test(raw)?raw:raw.replace(' ','T')+'Z');return Number.isNaN(date.getTime())?null:date;}
function zoned(value,zone){const date=instant(value);if(!date)return {date:'',time:''};const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date).map(part=>[part.type,part.value]));return {date:`${parts.year}-${parts.month}-${parts.day}`,time:`${parts.hour}:${parts.minute}`};}
function outputFromDraft(draft){const value=typeof draft.output_json==='object'?draft.output_json:parse(decryptNarrivaDraft(draft.output_json));return stripMobileClinicalIdentifiers(value);}
function mobileClient(client,serviceDate=today()){return {id:Number(client.id),maskedName:maskMobileClientName(client),age:ageAtServiceDate(client.date_of_birth,serviceDate)};}
async function workItem(req){const key=req.query.workId;if(!present(key))return null;const work=positiveId(key)?await NoteAidWorkQueueItem.findByIdForUser({id:Number(key),userId:req.user.id}):await NoteAidWorkQueueItem.findByClientKeyForUser({clientKey:String(key),userId:req.user.id});if(!work||Number(work.agencyId)!==req.mobileClinical.agencyId)throw narrivaError(404,'This work item is not in your current mobile workspace.');return work;}
export const bootstrapMobileClinicalSession=async(req,res,next)=>{if(req.body?.noteOnly||req.body?.note_only||!positiveId(req.body?.officeEventId))return next(narrivaError(400,'Open an actual scheduled office appointment before preparing its clinical session.'));const {bootstrapClinicalSession}=await import('./clinicalData.controller.js');return bootstrapClinicalSession(req,res,next);};
export const getMobileClinicalContext=async(req,res,next)=>{
 try{
  await ensurePrimary(req,res);const {agencyId,userId}=req.mobileClinical;const work=await workItem(req);let clientId=checkedId(req.query.clientId,'client')||positiveId(work?.clientId),draft=null,noteSource=null;
  for(const[field,workField]of [['clientId','clientId'],['draftId','draftId'],['clinicalSessionId','clinicalSessionId'],['officeEventId','officeEventId'],['noteId','clinicalNoteId']])if(work?.[workField]&&present(req.query[field]))assertSame(req.query[field],work[workField],field);
  const draftId=checkedId(req.query.draftId,'draft')||positiveId(work?.draftId),noteId=checkedId(req.query.noteId,'note')||positiveId(work?.clinicalNoteId);
  if(draftId){draft=await ClinicalNoteDraft.findByIdForUser({draftId,userId});if(!draft||Number(draft.agency_id)!==agencyId)throw narrivaError(404,'Draft is not available in this workspace.');assertSame(clientId,draft.client_id,'Client');clientId=positiveId(draft.client_id);}
  if(noteId){noteSource=await loadNarrivaSource(req.user,{agencyId,noteId});assertSame(clientId,noteSource.client.id,'Client');clientId=Number(noteSource.client.id);}
  let sessionId=checkedId(req.query.clinicalSessionId,'session')||positiveId(work?.clinicalSessionId)||positiveId(draft?.clinical_session_id)||positiveId(noteSource?.session?.id);
  let session=sessionId?await ClinicalSession.findById(sessionId):null;
  if(draft?.clinical_session_id&&sessionId)assertSame(sessionId,draft.clinical_session_id,'Draft encounter');
  if(noteSource?.session?.id&&sessionId)assertSame(sessionId,noteSource.session.id,'Note encounter');
  if(sessionId&&(!session||Number(session.agency_id)!==agencyId||(!noteSource&&Number(session.provider_user_id)!==userId)))throw narrivaError(404,'Your session is not available in this workspace.');
  if(session){assertSame(clientId,session.client_id,'Client');clientId=Number(session.client_id);}
  const officeEventId=checkedId(req.query.officeEventId,'appointment')||positiveId(work?.officeEventId)||positiveId(draft?.office_event_id)||positiveId(session?.office_event_id);
  let office=null;
  if(officeEventId){
   if(session)assertSame(officeEventId,session.office_event_id,'Appointment');
   if(draft?.office_event_id)assertSame(officeEventId,draft.office_event_id,'Draft appointment');
   const [[row]]=await pool.execute('SELECT e.*,l.agency_id AS location_agency_id FROM office_events e JOIN office_locations l ON l.id=e.office_location_id WHERE e.id=?',[officeEventId]);office=row;
   if(!office||(!noteSource&&Number(office.booked_provider_id||office.assigned_provider_id)!==userId))throw narrivaError(404,'Your appointment is not available.');
   if(Number(office.location_agency_id)!==agencyId){const [[shared]]=await pool.execute('SELECT 1 FROM office_location_agencies WHERE office_location_id=? AND agency_id=?',[office.office_location_id,agencyId]);if(!shared)throw narrivaError(403,'This appointment belongs to another workspace.');}
   if(clientId&&Number(office.client_id)!==clientId){const [[participant]]=await pool.execute('SELECT 1 FROM appointments a JOIN appointment_participants p ON p.appointment_id=a.id WHERE a.office_event_id=? AND a.agency_id=? AND a.provider_user_id=? AND p.client_id=?',[officeEventId,agencyId,Number(noteSource?.session?.provider_user_id)||userId,clientId]);if(!participant)throw narrivaError(403,'This client is not part of the selected appointment.');}
   clientId=clientId||positiveId(office.client_id);
   if(!session&&clientId){session=await ClinicalSession.findByOfficeEventAndClient({officeEventId,clientId});sessionId=positiveId(session?.id);if(session&&(Number(session.agency_id)!==agencyId||Number(session.provider_user_id)!==userId))throw narrivaError(403,'The linked session is not assigned to you.');}
  }
  if(!clientId)throw narrivaError(400,'Open a client note or actual appointment from My Work or the schedule.');
  const client=await requireNarrivaClient(req.user,agencyId,clientId,{authorizedNoteReviewer:!!noteSource});
  // Schedule launches identify an encounter, not necessarily its existing draft.
  // Restore only this author's draft for the authorized client and encounter;
  // never fall back to another note on the same calendar day.
  if(!draft && !noteSource && (sessionId || officeEventId)){
   draft=await ClinicalNoteDraft.findReusableOpen({userId,agencyId,clientId,officeEventId,clinicalSessionId:sessionId});
   if(draft){
    assertSame(agencyId,draft.agency_id,'Draft workspace');assertSame(userId,draft.user_id,'Draft author');assertSame(clientId,draft.client_id,'Draft client');
    if(sessionId && draft.clinical_session_id)assertSame(sessionId,draft.clinical_session_id,'Draft encounter');
    if(officeEventId && draft.office_event_id)assertSame(officeEventId,draft.office_event_id,'Draft appointment');
    if(!session && draft.clinical_session_id){
     session=await ClinicalSession.findById(draft.clinical_session_id);
     if(!session || Number(session.agency_id)!==agencyId || Number(session.provider_user_id)!==userId || Number(session.client_id)!==clientId)throw narrivaError(404,'Your draft encounter is not available.');
     if(officeEventId)assertSame(officeEventId,session.office_event_id,'Draft appointment');
     sessionId=Number(session.id);
    }
   }
  }
  const meta={...parse(session?.metadata_json),...parse(noteSource?.meta)},sourceZone=session?.source_timezone||work?.sourceTimezone||req.user.timezone||'America/Denver';let zone=sourceZone;try{zoned(new Date(),zone);}catch{zone='America/Denver';}
  const start=session?.scheduled_start_at||office?.start_at||work?.scheduledStart,end=session?.scheduled_end_at||office?.end_at||work?.scheduledEnd;
  const localStart=zoned(start,zone),localEnd=zoned(end,zone),dateOfService=localStart.date||dateOnly(draft?.date_of_service)||dateOnly(work?.date)||today();
  const durationMinutes=instant(start)&&instant(end)?Math.max(0,Math.round((instant(end)-instant(start))/60000)):Number(work?.durationMinutes||meta.durationMinutes||0);
  const care=await readStaffCareEligibility(userId,agencyId),catalog=await resolveAgencySchedulingCatalog({agencyId,credentialTier:care.credentialTier,allServiceCodes:[],eligibleServiceCodes:[]});
  const [[preference]]=await pool.execute('SELECT default_mode FROM narriva_writer_preferences WHERE user_id=? AND agency_id=?',[userId,agencyId]);
  let treatmentPlan=null;const plans=await ClinicalTreatmentPlan.listByClient({agencyId,clientId});const current=plans.find(plan=>String(plan.status).toLowerCase()==='active'&&(!plan.effective_date||dateOnly(plan.effective_date)<=dateOfService));
  if(current){const plan=await ClinicalTreatmentPlan.findById(current.id);if(Number(plan.agency_id)!==agencyId||Number(plan.client_id)!==clientId)throw narrivaError(409,'Treatment plan context changed.');const goals=[];for(const goal of plan.goals||[]){const objectives=[];for(const objective of goal.objectives||[]){const rating=await ClinicalTreatmentObjectiveRating.findLatestForDedupe({objectiveId:objective.id,dateOfService})||await ClinicalTreatmentObjectiveRating.findPreviousSession({objectiveId:objective.id,dateOfService});objectives.push({id:objective.id,title:objective.objective_text,scaleTarget:objective.scale_target,previousScore:rating?.scale_value??null});}goals.push({id:goal.id,title:goal.goal_text,objectives});}treatmentPlan={id:plan.id,goals,presentingProblem:plan.presentingProblem||'',diagnosticJustification:plan.diagnostic_justification||'',diagnoses:(plan.planDiagnoses||[]).map(dx=>({id:dx.diagnosis_id,code:dx.icd10_code,description:dx.description,justification:dx.justification}))};}
  let recordingNarrative=null;if(req.query.recordingId)recordingNarrative=await getAuthorizedRecordingNarrative({user:req.user,agencyId,clientId,clinicalSessionId:sessionId,officeEventId,recordingId:checkedId(req.query.recordingId,'recording')});
  const participants=String(meta.sessionContext?.participants||meta.participants||'Client').match(/client|parent|guardian|caregiver|partner|spouse|collateral|interpreter|supervisor/gi)||['Client'];
  const delivery=String(meta.narrivaContext?.modality||meta.sessionContext?.modality||meta.modality||session?.modality||'').toLowerCase();
  const modality=['in_person','video','phone'].includes(delivery)?delivery:office&&!['02','10'].includes(session?.place_of_service)?'in_person':'';
  const serviceLocationId=positiveId(session?.service_location_id)||positiveId(meta.sessionContext?.serviceLocationId);
  const billingOfficeLocationId=positiveId(session?.billing_office_location_id)||positiveId(meta.sessionContext?.billingOfficeLocationId)||positiveId(office?.office_location_id);
  const placeOfService=String(session?.place_of_service||meta.sessionContext?.placeOfService||'');
  const savedLocationLabel=String(meta.sessionContext?.locationLabel||meta.locationLabel||session?.location_label||'').trim();
  const [[risk]] = await pool.execute(`SELECT MAX(risk_assessment_required) AS required FROM narriva_reviews WHERE agency_id=? AND ((draft_id IS NOT NULL AND draft_id=?) OR (clinical_note_id IS NOT NULL AND clinical_note_id=?) OR (clinical_session_id IS NOT NULL AND clinical_session_id=?))`,[agencyId,draftId,noteId,sessionId]);
  const riskAssessmentRequired=Number(risk?.required)===1;
  const capabilities=await narrivaWriterCapabilities(userId,agencyId);
  // Reuse the desktop's assigned-office/school selector, never the full
  // administrative catalog. A location-list outage must not hide a saved note.
  const {listServiceLocations}=await import('./medicalBilling.controller.js');
  let locationChoices=[],locationChoicesUnavailable=false;
  try{const data=await invokeMobileClinicalController(listServiceLocations,req,{query:{agencyId,forNoteAid:'1',includeInactive:'0'}});locationChoices=data.choices||[];}
  catch{locationChoicesUnavailable=true;}
  const assignedLocation=locationChoices.find(choice=>serviceLocationId?Number(choice.serviceLocationId)===serviceLocationId:billingOfficeLocationId&&Number(choice.billingOfficeLocationId)===billingOfficeLocationId&&choice.placeOfService===placeOfService);
  const locationLabel=savedLocationLabel||assignedLocation?.name||({'02':'Telehealth','10':'Telehealth','03':'School','11':'Office','12':'Home'})[placeOfService]||(office?'Office':'');
  const preferredMode=preference?.default_mode||'manual';
  const defaultMode=preferredMode==='manual'&&capabilities.manualAllowed===false?'narriva':preferredMode;
  const signedContext=noteSource?await noteReviewContext(req,noteSource):null;
  res.json({agencyId,riskAssessmentRequired,review:signedContext?.review||null,client:mobileClient(client),session:{id:sessionId,officeEventId,dateOfService,startTimeLocal:localStart.time,endTimeLocal:localEnd.time,durationMinutes,sourceTimezone:zone,serviceCode:session?.service_code||draft?.service_code||work?.serviceCode||meta.serviceCode||'',participants:[...new Set(participants)].join(', '),locationLabel,serviceLocationId,billingOfficeLocationId,placeOfService,modality},
   draft:draft?{id:Number(draft.id),inputText:decryptNarrivaDraft(draft.input_text),outputJson:outputFromDraft(draft)}:null,
   note:signedContext?.note||null,
   treatmentPlan,locationChoices,locationChoicesUnavailable,serviceCodes:care.canProvideCare?catalog.eligibleServiceCodes:[],preferences:{defaultMode,features:capabilities},alerts:[],recordingNarrative});
 }catch(error){next(error);}
};

async function contactRoster(req){const {agencyId}=req.mobileClinical,clientId=checkedId(req.params.clientId,'client');const client=await requireNarrivaClient(req.user,agencyId,clientId),links=await ClientGuardian.listForClient(clientId),audience=await clientSecureAudience(clientId,pool,{agencyId}),contacts=[];
 for(const link of links){if(Number(link.access_enabled)!==1||!active(link))continue;const access=await clinicalAccess({agencyId,clientId,userId:link.guardian_user_id});if(access.reviewRequired||!access.scopes.includes('clinical_messages')||link.permissions_json?.canMessage===false)continue;
  const family=link.phone?await resolveRelayFamily(client,link.phone):null;
  contacts.push({key:`guardian:${Number(link.guardian_user_id)}`,maskedName:maskMobileClientName(link),relationship:link.relationship_type==='self'?'Self':link.relationship_title||'Guardian',email:link.email||null,phone:link.phone||null,guardianUserId:Number(link.guardian_user_id),channels:{secure:audience.userIds.includes(Number(link.guardian_user_id)),sms:!!family&&Number(family.guardianUserId)===Number(link.guardian_user_id),email:!!link.email}});
 }
 if(ageAtServiceDate(client.date_of_birth,today())>=18&&!links.some(link=>link.relationship_type==='self'&&Number(link.access_enabled)===1)){
  const family=client.contact_phone?await resolveRelayFamily(client,client.contact_phone):null;
  contacts.unshift({key:'client',maskedName:maskMobileClientName(client),relationship:'Self',email:client.contact_email||client.email||null,phone:client.contact_phone||null,guardianUserId:0,channels:{secure:false,sms:!!family&&Number(family.guardianUserId)===0,email:!!(client.contact_email||client.email)}});
 }
 return {client,contacts};}
export const getMobileClientSummary=async(req,res,next)=>{try{await ensurePrimary(req,res);const {client,contacts}=await contactRoster(req);res.json({client:mobileClient(client),contacts:contacts.map(({guardianUserId,...contact})=>contact),secureMessaging:{available:contacts.some(contact=>contact.channels.secure),reason:contacts.some(contact=>contact.channels.secure)?null:'Secure messaging needs an active client or guardian portal account with permission to receive clinical messages. Open the client’s Portal settings in the main app to review access or arrange an invitation.'}});}catch(error){next(error);}};
function selectedContact(req,contacts){if(['to','phone','email','relayRecipient','guardianUserId'].some(key=>present(req.body[key])))throw narrivaError(400,'Choose a current authorized contact rather than supplying a recipient address.');const contact=contacts.find(contact=>contact.key===req.body.recipientKey);const channel=String(req.body.channel||'');if(!contact||!['secure','sms','email'].includes(channel)||!contact.channels[channel])throw narrivaError(403,'This contact or communication channel is no longer available.');return {contact,channel};}
export const resolveMobileClientContact=async(req,res,next)=>{try{await ensurePrimary(req,res);const {client,contacts}=await contactRoster(req),{contact,channel}=selectedContact(req,contacts);if(channel==='secure'){const shared=await ensureClientSecureConversation({clientId:client.id,agencyId:req.mobileClinical.agencyId,actorUserId:req.user.id});return res.json({threadId:shared.threadId,suite:'secure'});}res.json({channel,to:channel==='sms'?contact.phone:contact.email,clientId:Number(client.id)});}catch(error){next(error);}};
export const sendMobileClientContact=async(req,res,next)=>{try{await ensurePrimary(req,res);const {client,contacts}=await contactRoster(req),{contact,channel}=selectedContact(req,contacts);if(channel!=='sms')throw narrivaError(400,'Use the selected secure conversation or email composer for this channel.');const text=String(req.body.text||'').trim();if(!text||text.length>5000)throw narrivaError(400,'Enter a text message of 1 to 5000 characters.');const sent=await sendClinicalSms({userId:req.user.id,clientId:client.id,body:text,relayRecipient:{phone:contact.phone,guardianUserId:contact.guardianUserId}});res.json({ok:true,messageId:sent.messageLog?.id||null,conversationId:sent.conversationId||null});}catch(error){next(error);}};

export function invokeMobileClinicalController(handler,request,{params={},query={}}={}) {
 const req=Object.assign(Object.create(request),{params:{...request.params,...params},query:{...request.query,...query},body:{...request.body}});
 return new Promise((resolve,reject)=>{let status=200;const response={set(){return this;},setHeader(){return this;},status(code){status=code;return this;},json(body){if(status>=400)reject(narrivaError(status,body?.error?.message||'This clinical view is unavailable.'));else resolve(body);return this;}};Promise.resolve(handler(req,response,reject)).catch(reject);});
}
async function noteReviewContext(req,source) {
 const {getClinicalNoteById}=await import('./medicalBilling.controller.js');
 const {getSuperviseeReviewDocument}=await import('./supervisedBilling.controller.js');
 const {latestNarrivaStatus}=await import('../services/narrivaReview.service.js');
 const noteId=Number(source.source.id),providerId=Number(source.source.provider_signed_by_user_id||source.source.created_by_user_id);
 const details=await invokeMobileClinicalController(getClinicalNoteById,req,{params:{noteId:String(noteId)}});
 const note=details.note||{},review={canCosign:false,contentHash:note.contentHash||null,reviewSnapshotToken:note.reviewSnapshotToken||null,entryManifestHash:note.versions?.entryManifestHash||note.versions?.effectiveRevision?.entryManifestHash||null,providerSignedAt:note.providerSignedAt||source.source.provider_signed_at||null,narriva:await latestNarrivaStatus(req.user,req.mobileClinical.agencyId,noteId)};
 if(providerId!==req.user.id&&review.providerSignedAt){
  const data=await invokeMobileClinicalController(getSuperviseeReviewDocument,req,{params:{providerId:String(providerId),type:'note',documentId:String(noteId)}});
  Object.assign(review,{canCosign:data.canCosign===true&&!data.versions?.pendingRevisionId&&!data.amendmentSignoffRequired,contentHash:data.contentHash,reviewSnapshotToken:data.reviewSnapshotToken,entryManifestHash:data.versions?.entryManifestHash||data.versions?.effectiveRevision?.entryManifestHash||null,providerSignedAt:data.reviewSnapshot?.providerSignedAt||review.providerSignedAt});
 }
 return {review,note:{id:noteId,readOnly:!!review.providerSignedAt,outputJson:stripMobileClinicalIdentifiers(note.outputJson||{sections:{Narrative:source.narrative},meta:source.meta}),signingToken:note.signingToken||null,canSignClinicalNote:note.canSignClinicalNote===true,providerSignedAt:review.providerSignedAt}};
}
export const getMobileNotesToSign=async(req,res,next)=>{
 try{
  await ensurePrimary(req,res);const {listNotesToSign}=await import('./notesToSign.controller.js');
  const data=await invokeMobileClinicalController(listNotesToSign,req),notes=[];
  for(const row of data.notes||[]){
   if(Number(row.agency_id||row.agencyId)!==req.mobileClinical.agencyId)continue;
   let source;try{source=await loadNarrivaSource(req.user,{agencyId:req.mobileClinical.agencyId,noteId:positiveId(row.clinical_note_id||row.clinicalNoteId)});}catch(error){if([403,404].includes(error.status))continue;throw error;}
   const client=mobileClient(source.client);
   notes.push({id:row.id,clinical_note_id:row.clinical_note_id,agency_id:req.mobileClinical.agencyId,client_id:client.id,client_name:client.maskedName,maskedName:client.maskedName,clientMaskedName:client.maskedName,clientAge:client.age,client,age:client.age,clinicalNoteId:row.clinical_note_id,clientId:client.id,agencyId:req.mobileClinical.agencyId,dateOfService:row.date_of_service,serviceCode:row.service_code,title:'Clinical note',service_code:row.service_code,date_of_service:row.date_of_service,provider_user_id:row.provider_user_id,provider_name:[row.provider_first_name,row.provider_last_name].filter(Boolean).join(' '),provider_signed_at:row.provider_signed_at,clinical_revision_id:row.clinical_revision_id||null,narriva:row.clinical_revision_id?{status:'pending',quickSignEligible:false}:row.narriva||{status:'pending',quickSignEligible:false}});
  }
  res.json({notes,count:notes.length,isSupervisor:data.isSupervisor===true});
 }catch(error){next(error);}
};
