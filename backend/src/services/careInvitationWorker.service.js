import pool from '../config/database.js';
import {clientReenrollment} from './clientReenrollment.service.js';
import IntakeSubmission from '../models/IntakeSubmission.model.js';
import IntakeSubmissionClient from '../models/IntakeSubmissionClient.model.js';
import { submittedChildCount, submissionArtifactsComplete } from './enrollmentSubmissionRoster.service.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { coverageFingerprint, listCoverageEvidence, saveCoverageReview, coverageReviewBlockers } from './coverageVerification.service.js';
import { clientCoverageAdmission } from './clientCoverageAdmission.service.js';
import { ensureClientProviderAssignmentRow } from './clientProviderAssignmentSync.service.js';
import { queueInsuranceVerificationTask } from './insuranceVerificationTask.service.js';
import { notifyCareInvitation } from './careInvitation.service.js';
import { automaticCareCoverageReady, careDate, parseCareJson } from './careInvitationPolicy.js';
import { decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { decodeCob } from './stediCob.service.js';
import { hasMedicaidCoverage } from '../utils/insurancePaymentPolicy.js';
import User from '../models/User.model.js';
import { canLogin,isAccessExpired } from '../utils/accessControl.js';
import { hasSchedulingBillingAccess } from './schedulingBillingAccess.service.js';
import { bookSessionInOwnedOffice } from './ownedOfficeSession.service.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';
import { createAppointment, linkProviderScheduleEvent } from './appointment.service.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import Appointment from '../models/Appointment.model.js';
import { ensureAppointmentClinicalLink } from './appointmentClinicalLink.service.js';
import { scheduleSessionNotifications } from './sessionNotification.service.js';
import { appointmentScheduleNotices } from './appointmentScheduleNotice.service.js';
import { expandAppointmentRecurrence } from '../utils/appointmentRecurrence.js';
import { wallMysqlToUtcMysql } from '../utils/zonedWallTime.util.js';
import { requireStaffCareEligibility } from './staffCareEligibility.service.js';

const utc=value=>value instanceof Date?value:new Date(String(value).replace(' ','T').replace(/Z?$/,'Z'));
const fail=message=>Object.assign(new Error(message),{status:409});
async function state(db,i,status,message,audience) {
 await notifyCareInvitation(i,status,message,audience,db);
 await db.execute('UPDATE care_invitations SET status=?,last_error=? WHERE id=?',[status,status==='ready'?null:message,i.id]);
}
export async function careInvitationCoverage(invitation,now=new Date()) {
 const agencyId=Number(invitation.agency_id),clientId=Number(invitation.client_id);
 const serviceDate=invitation.start_at?careDate(utc(invitation.start_at),invitation.time_zone):careDate(now,invitation.time_zone);
 const insurance=await readClientInsurance(clientId,agencyId);
 const evidence=await listCoverageEvidence({agencyId,clientId,serviceDate});
 const fingerprint=coverageFingerprint(insurance);
 // A clean independent COB result must cover this exact identity/date, with no later findings.
 const [[cob]]=await pool.execute(`SELECT * FROM stedi_insurance_discoveries WHERE agency_id=? AND client_id=? AND service_date=?
  AND request_kind='cob' ORDER BY id DESC LIMIT 1`,[agencyId,clientId,serviceDate]);
 const cobRequest=cob?decryptFamilyBilling(cob.request_encrypted,`stedi-cob:${agencyId}:${clientId}`):null;
 evidence.cleanCob=!!cob&&cob.status==='clear'&&!cob.review_required&&+now-new Date(cob.updated_at)<7*86400000
  &&coverageFingerprint(cobRequest?.snapshot?.insurance)===fingerprint&&decodeCob(cob).assessment?.identityMatches===true;
 // Medicaid TPL requires billing reconciliation; an eligibility response is not that reconciliation.
 if(!evidence.review&& !hasMedicaidCoverage(insurance)&&automaticCareCoverageReady({insurance,evidence,fingerprint})) {
  const [[automation]]=await pool.execute('SELECT reviewer_user_id FROM agency_eligibility_automation WHERE agency_id=? AND enabled=1',[agencyId]);
  const reviewer=automation?.reviewer_user_id?await User.findById(automation.reviewer_user_id):null;
  if(!reviewer||!canLogin(reviewer)||isAccessExpired(reviewer)||!await hasSchedulingBillingAccess(reviewer,agencyId))return false;
  await saveCoverageReview({agencyId,clientId,serviceDate,status:'verified',source:'claimmd',reference:`Automatic care invitation ${invitation.id}; Claim.MD check ${evidence.checks[0].id}; clean COB for the current identity.`,
   primaryChecked:true,otherCoverageChecked:true,orderConfirmed:true,actorUserId:reviewer.id});
  return careInvitationCoverage(invitation,now);
 }
 const blockers=coverageReviewBlockers({insurance,...evidence,now});
 if(blockers.length||!evidence.review||evidence.review.evidence?.syntheticOnly)return false;
 return (await clientCoverageAdmission(clientId)).ready;
}

/** Book through the existing guarded office/session adapters. Identical retries
 * keep the same reservation identity and never create a second client session. */
export async function bookCareInvitation(invitation) {
 if(!invitation.start_at)return [];
 const start=utc(invitation.start_at),end=new Date(+start+3600000);
 if(start<=new Date())throw fail('The requested start has passed. Support must agree on a new start before booking.');
 const agencyId=Number(invitation.agency_id),clientId=Number(invitation.client_id),providerId=Number(invitation.provider_user_id),actorUserId=Number(invitation.created_by_user_id);
 if(invitation.modality==='IN_PERSON') {
  const [[assignment]]=await pool.execute(`SELECT a.*,l.timezone,l.name FROM office_standing_assignments a JOIN office_locations l ON l.id=a.office_location_id
   WHERE a.id=? AND a.provider_id=? AND a.office_location_id=? AND a.is_active=1`,[invitation.standing_assignment_id,providerId,invitation.office_location_id]);
  if(!assignment)throw fail('The invited office reservation is no longer assigned to this provider.');
  await OfficeScheduleMaterializer.materializeWeek({officeLocationId:assignment.office_location_id,weekStartRaw:careDate(start,invitation.time_zone),createdByUserId:actorUserId});
  const result=await bookSessionInOwnedOffice({office:{id:Number(assignment.office_location_id),timezone:assignment.timezone},roomId:Number(assignment.room_id),
   agencyId,clientId,providerId,actorUserId,startAt:start.toISOString(),endAt:end.toISOString(),recurrence:invitation.frequency,
   occurrenceCount:invitation.occurrence_count,serviceCode:invitation.service_code,modality:'IN_PERSON',billing:{settlementMode:'insurance'}});
  if(!result?.ok)throw fail('The office reservation no longer covers the invited appointment. Review the existing office booking.');
  return result.appointmentIds;
 }
 const occurrences=expandAppointmentRecurrence({startAt:start,endAt:end,timeZone:invitation.time_zone,recurrence:invitation.frequency,occurrenceCount:invitation.occurrence_count});
 const ids=[];
 for(const [index,occurrence] of occurrences.entries()) {
  const source=`care_invitation:${invitation.id}:${index}`;
  const [[existing]]=await pool.execute('SELECT id,status,provider_schedule_event_id,provider_user_id,start_at,end_at,modality,service_code FROM appointments WHERE agency_id=? AND source=? LIMIT 1',[agencyId,source]);
  if(existing&&!['scheduled','confirmed','client_confirmed'].includes(existing.status))throw fail('A session in this invitation series changed. Review the saved appointments.');
  if(existing&&(Number(existing.provider_user_id)!==providerId||existing.modality!=='TELEHEALTH'||existing.service_code!==invitation.service_code
   ||+utc(existing.start_at)!==+utc(wallMysqlToUtcMysql(occurrence.startAt,invitation.time_zone))||+utc(existing.end_at)!==+utc(wallMysqlToUtcMysql(occurrence.endAt,invitation.time_zone))))throw fail('A saved appointment changed. Review the series before retrying.');
  const appointment=existing||await createAppointment({agencyId,providerUserId:providerId,startAt:occurrence.startAt,endAt:occurrence.endAt,timeZone:invitation.time_zone,
   modality:'TELEHEALTH',serviceCode:invitation.service_code,source,createdByUserId:actorUserId,billing:{settlementMode:'insurance'},deferScheduleNotice:true,
   participants:[{role:'client',clientId,isBillingResponsible:true,receivesReminders:true}]});
  if(existing){
   const [participants]=await pool.execute('SELECT client_id FROM appointment_participants WHERE appointment_id=?',[existing.id]);
   if(participants.some(p=>Number(p.client_id)!==clientId))throw fail('The saved participants changed. Review the appointment before retrying.');
   if(!participants.length)await Appointment.replaceParticipants(existing.id,[{role:'client',clientId,isBillingResponsible:true,receivesReminders:true}]);
   await Appointment.upsertBilling(existing.id,{settlementMode:'insurance',responsibleClientId:clientId,responsiblePartyType:'client'});
  }
  await ensureAppointmentClinicalLink(appointment.id,actorUserId);
  if(!(existing?.provider_schedule_event_id||appointment.providerScheduleEventId)){
   const reason=`CARE_INVITATION_${invitation.id}_${index}`;
   const [[saved]]=await pool.execute('SELECT id FROM provider_schedule_events WHERE agency_id=? AND provider_id=? AND reason_code=? LIMIT 1',[agencyId,providerId,reason]);
   const event=saved||await ProviderScheduleEvent.create({agencyId,providerId,clientId,eventTimezone:invitation.time_zone,kind:'PERSONAL_EVENT',reasonCode:reason,title:'Client session',
    startAt:wallMysqlToUtcMysql(occurrence.startAt,invitation.time_zone),endAt:wallMysqlToUtcMysql(occurrence.endAt,invitation.time_zone),
    recurrenceSeriesId:`care-invitation-${invitation.id}`,recurrenceFrequency:invitation.frequency,recurrencePolicy:'future_only',recurrenceIndex:index,createdByUserId:actorUserId});
   await linkProviderScheduleEvent(appointment.id,event.id);
  }
  ids.push(appointment.id);
 }
 for(const id of ids){await scheduleSessionNotifications(id,{replace:true});await appointmentScheduleNotices.queue(id,{eventType:'created',actorUserId});}
 return ids;
}

export async function processCareInvitation(invitation,db,deps={}) {
 if(!invitation.client_id) {
  const [candidates]=await db.execute("SELECT id FROM intake_submissions WHERE intake_link_id=? AND status='submitted' ORDER BY id",[invitation.intake_link_id]);
  if(!candidates.length)return;
  if(candidates.length!==1)throw fail('More than one enrollment used this invitation. Support must review the submitted packets.');
  const submission=await IntakeSubmission.findById(candidates[0].id);
  const data=parseCareJson(submission.intake_data),rows=await IntakeSubmissionClient.listBySubmissionId(submission.id);
  if(!submissionArtifactsComplete(submission,rows,submittedChildCount(data)))return;
  if(submittedChildCount(data)!==1||rows.length>1)throw fail('This invitation is for one child. Support must review the completed enrollment.');
  const email=String(submission.signer_email||data.guardian?.email||'').trim().toLowerCase();
  if(email!==invitation.recipient_email.toLowerCase())throw fail('The enrollment email differs from the invitation. Support must confirm the recipient before assignment.');
  const clientId=Number(rows[0]?.client_id||submission.client_id);
  if(!clientId||!submission.guardian_user_id)throw fail('The enrollment needs review to finish linking the child and guardian portal.');
  const [[client]]=await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=?',[clientId,invitation.agency_id]);
  if(!client)throw fail('The enrolled child is outside this invitation’s organization.');
  await db.execute("UPDATE care_invitations SET client_id=?,submission_id=?,status='pending' WHERE id=? AND client_id IS NULL",[clientId,submission.id,invitation.id]);
  Object.assign(invitation,{client_id:clientId,submission_id:submission.id});
 }
 if(!await (deps.coverage||careInvitationCoverage)(invitation)) {
  const taskId=await queueInsuranceVerificationTask({agencyId:invitation.agency_id,clientId:invitation.client_id,actorUserId:invitation.created_by_user_id,reason:'eligibility_unresolved'});
  if(!taskId)throw fail('Configure the agency billing verification task list to route this enrollment.');
  await db.execute("UPDATE tasks SET title='New client enrollment — insurance verification needed' WHERE id=?",[taskId]);
  await state(db,invitation,'billing_review',`Enrollment paperwork is complete. Billing verification is required before provider assignment or booking. Invitation #${invitation.id}.`,{billing:true,support:true,provider:false});
  return;
 }
 await requireStaffCareEligibility(invitation.provider_user_id,invitation.agency_id);
 const [[client]]=await db.execute('SELECT provider_id,status FROM clients WHERE id=? AND agency_id=?',[invitation.client_id,invitation.agency_id]);
 if(!client||['ARCHIVED','INACTIVE','TERMINATED'].includes(client.status))throw fail('The enrolled client is inactive. Review before assigning or booking.');
 if(client.provider_id&&Number(client.provider_id)!==Number(invitation.provider_user_id))throw fail('This client already has a different provider. Support must review the care assignment.');
 await db.beginTransaction();
 try {
  const [[lockedClient]]=await db.execute('SELECT id,provider_id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[invitation.client_id,invitation.agency_id]);
  if(!lockedClient||(lockedClient.provider_id&&Number(lockedClient.provider_id)!==Number(invitation.provider_user_id)))throw fail('The client provider changed. Support must review this invitation.');
  const [existingAssignments]=await db.execute('SELECT id FROM client_provider_assignments WHERE client_id=? AND is_active=1 AND provider_user_id<>? LIMIT 1',[invitation.client_id,invitation.provider_user_id]);
  if(existingAssignments.length)throw fail('Another active provider relationship needs staff review before assignment.');
  const assignment=await ensureClientProviderAssignmentRow(db,{clientId:invitation.client_id,organizationId:invitation.agency_id,providerUserId:invitation.provider_user_id,userId:invitation.created_by_user_id,isPrimary:true});
  if(!assignment.ok)throw fail('The provider assignment could not be saved.');
  await db.execute('UPDATE clients SET provider_id=? WHERE id=? AND agency_id=? AND (provider_id IS NULL OR provider_id=?)',[invitation.provider_user_id,invitation.client_id,invitation.agency_id,invitation.provider_user_id]);
  await db.commit();
 }catch(e){await db.rollback();throw e;}
 try {await (deps.book||bookCareInvitation)(invitation);}
 catch(e){await state(db,invitation,'booking_review','Coverage verified and provider assigned. The requested session needs scheduling review. Retry this invitation to finish any partially saved series.',{provider:true,billing:true,support:true});throw e;}
 await state(db,invitation,'ready',`New client assigned: signed enrollment complete; insurance verified; ${invitation.modality==='IN_PERSON'?'in-person':'virtual'} care${invitation.start_at?' scheduled at the invited time':' ready for scheduling'}. Invitation #${invitation.id}.`,{provider:true,billing:true,support:true});
}

export async function runCareInvitations() {
 try{await clientReenrollment.completeSubmitted();}catch(error){console.warn('[care-invitations] Re-enrollment completion needs review:',error.code||'completion_error');}
 const [rows]=await pool.execute("SELECT * FROM care_invitations WHERE status IN ('invited','pending','billing_review','booking_review','pending_delivery','delivery_review','sending') ORDER BY updated_at LIMIT 25");
 for(const invitation of rows) {
  const db=await pool.getConnection();let locked=false;
  try {
   const [[got]]=await db.execute('SELECT GET_LOCK(?,0) acquired',[`care-invitation:${invitation.id}`]);locked=Number(got.acquired)===1;if(!locked)continue;
   // Reload after acquiring the lock; another replica may have completed this row.
   const [[current]]=await db.execute('SELECT * FROM care_invitations WHERE id=?',[invitation.id]);if(current.status==='ready')continue;
   await processCareInvitation(current,db);
  } catch(e) {
   await db.execute('UPDATE care_invitations SET last_error=? WHERE id=?',[String(e.message||'Enrollment review needed').slice(0,500),invitation.id]);
   const [[saved]]=await db.execute('SELECT notified_status FROM care_invitations WHERE id=?',[invitation.id]);
   if(!saved.notified_status)await notifyCareInvitation(invitation,'review_required','Care invitation requires support review. Open the invitation record before retrying.',{support:true,billing:true,provider:false},db);
  } finally {try{if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[`care-invitation:${invitation.id}`]);}finally{db.release();}}
 }
}
