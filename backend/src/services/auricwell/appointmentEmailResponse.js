import crypto from 'node:crypto';
import sharedPool from '../../config/database.js';
import { get, transaction, lockPractice, update, create, list, audit } from './repository.js';
import { practiceMessagingContext } from './clientMessaging.js';
import { clientEmailContext, sendClientPortalEmail } from '../clientPortalEmail.service.js';
import { renderPortalEmail, enrollmentMailBrand, escapePortalHtml as e } from '../portalEmailBranding.service.js';
import { portalActionHtml } from '../clientPortalEmailContent.js';
import { appointmentResponseUrl } from '../../utils/appointmentResponseUrl.js';
import { dateToMysqlUtcDateTime, utcMysqlToIso } from '../../utils/zonedWallTime.util.js';
import { createSchoolSessionEmailOptOutLink, schoolSessionEmailOptOutContent, isSchoolSessionEmailOptedOut, SCHOOL_EMAIL_TEMPLATE } from '../schoolSessionEmailPreferences.service.js';
const hash=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
const emailHash=value=>hash(String(value||'').trim().toLowerCase());
const fail=message=>Object.assign(new Error(message),{status:410});
const date=value=>value instanceof Date?value:new Date(utcMysqlToIso(value)||value);

export async function nativeResponseContext(row) {
  const ctx=await practiceMessagingContext(row.practice_id);
  if(!ctx.settings.phiActivatedAt) throw fail('This practice is not available.');
  const appointment=await get(ctx,'appointment',row.native_appointment_id);
  const patient=await get(ctx,'patient',row.native_patient_id);
  if(['archived','inactive','discharged'].includes(patient.data.status)) throw fail('This appointment link no longer has access.');
  if(appointment.patientId!==patient.id || emailHash(patient.data.email)!==row.recipient_hash) throw fail('This appointment link no longer has access.');
  if(+date(appointment.data.start)!==+date(row.appointment_start)||+date(appointment.data.end)!==+date(row.appointment_end)) throw fail('Your appointment changed. Please use the latest reminder.');
  const context=ctx.agencyId?await clientEmailContext({agencyId:ctx.agencyId,clinical:true}):{
    tenant:{name:ctx.practiceName},brand:enrollmentMailBrand({agency:{name:ctx.practiceName},domain:'auricwell.com',clinicalOverride:true})};
  return {row,ctx,appointment,patient,context,setting:{isSchool:appointment.data.serviceSetting==='school'||appointment.data.placeOfService==='03'},
    appt:{id:appointment.id,agencyId:ctx.agencyId,startAt:appointment.data.start,endAt:appointment.data.end,status:appointment.data.status,sourceTimezone:ctx.settings.timezone}};
}

export async function applyNativeResponse(current,action) {
  const {ctx,appointment,patient}=current;
  return transaction(async db=>{
    await lockPractice(ctx,db);
    const fresh=await get(ctx,'appointment',appointment.id,db,true);
    if(fresh.data.start!==appointment.data.start || fresh.data.end!==appointment.data.end || !['scheduled','confirmed'].includes(fresh.data.status)) throw fail('The appointment changed. Please contact your team.');
    if(action==='confirm') {
      await update(ctx,fresh,{...fresh.data,status:'confirmed',emailConfirmedAt:new Date().toISOString()},db);
      await audit(ctx,'appointment.email_confirmed',fresh.id,{patientId:patient.id,channel:'email'},db);
      return 'Your appointment is confirmed. Thank you!';
    }
    const pending=(await list(ctx,'appointment_request',{patientId:patient.id},db)).find(r=>r.data.appointmentId===fresh.id && r.data.status==='pending');
    if(pending&&action==='absence') await update(ctx,pending,{...pending.data,message:`${pending.data.message || ''}\nFamily also reports a school absence via email. Do not assess a cancellation fee.`.slice(0,2000)},db);
    if(!pending) await create(ctx,'appointment_request',{appointmentId:fresh.id,requestType:action==='absence'?'cancel':action,
      message:action==='absence'?'Family reports a school absence via the session email. Do not assess a cancellation fee.':`Family requested ${action==='cancel'?'cancellation':'a new time'} through the appointment email.`,
      requestedBy:null,requestedByName:'Authorized email recipient',requestedStart:fresh.data.start,status:'pending'}, {patientId:patient.id},db);
    await audit(ctx,'appointment.email_change_requested',fresh.id,{action,channel:'email'},db);
    return action==='absence'?'Your care team received the school absence notice. Please also notify the school.':`Your ${action==='cancel'?'cancellation':'rescheduling'} request was sent to your care team for review. Your appointment stays scheduled until they respond.`;
  });
}

export async function sendNativeAppointmentEmail(ctx,to,text,appointment) {
  const school=appointment.data.serviceSetting==='school'||appointment.data.placeOfService==='03';
  const scope={agencyId:ctx.agencyId,practiceId:ctx.practiceId,patientId:appointment.patientId,to};
  if(school && await isSchoolSessionEmailOptedOut(scope)) return {skipped:true,reason:'school_session_email_opted_out'};
  const schoolOptOut=school ? await createSchoolSessionEmailOptOutLink(scope) : null;
  const optOut=schoolOptOut ? schoolSessionEmailOptOutContent(schoolOptOut.url) : {text:'',html:''};
  const token=crypto.randomBytes(32).toString('hex'),expires=new Date(Math.min(Date.parse(appointment.data.end),Date.now()+30*86400000));
  if(!Number.isFinite(+expires)||+expires<=Date.now()) throw fail('This appointment has ended.');
  if(!ctx.agencyId&&!/^notifications@[^@]+$/i.test(process.env.AURICWELL_ACCOUNT_EMAIL_FROM||'')) throw fail('Configure the AuricWell notifications sender before sending.');
  await sharedPool.execute(`INSERT INTO appointment_email_actions(token_hash,agency_id,product,practice_id,native_appointment_id,native_patient_id,recipient_hash,appointment_start,appointment_end,expires_at)
    VALUES(?,?,'auricwell',?,?,?,?,?,?,?)`,[hash(token),ctx.agencyId||null,ctx.practiceId,appointment.id,appointment.patientId,emailHash(to),dateToMysqlUtcDateTime(new Date(appointment.data.start)),dateToMysqlUtcDateTime(new Date(appointment.data.end)),dateToMysqlUtcDateTime(expires)]);
  const url=appointmentResponseUrl(token,{clinical:true});
  const actions=school?[['My child will miss school','absence']]:[['Confirm appointment','confirm'],['Request cancellation','cancel'],['Request a new time','reschedule']];
  const body=String(text).replace(/For scheduling changes, contact your practice\./,school?'No confirmation is needed. Use the button to notify your care team if your child will miss school. Please also notify the school.':'Use the buttons below to confirm or request a change. No sign-in is needed.');
  const html=`<h2>${school?'School session notice':'Your upcoming appointment'}</h2><p>${e(body).replaceAll('\n','<br>')}</p>${actions.map(([label,action])=>portalActionHtml(label,`${url}?action=${action}`)).join('')}${optOut.html}`;
  const message={to,subject:`${ctx.practiceName}: ${school?'School session notice':'Appointment reminder'}`,text:`${body}\n\n${actions.map(([label,action])=>`${label}: ${url}?action=${action}`).join('\n\n')}${optOut.text}`,html,source:'auto',templateType:school?SCHOOL_EMAIL_TEMPLATE:'auricwell_session_reminder',schoolSessionScopeKey:schoolOptOut?.scopeKey};
  if(ctx.agencyId){const context=await clientEmailContext({agencyId:ctx.agencyId,clinical:true});return sendClientPortalEmail({agencyId:ctx.agencyId,context,...message});}
  const {default:Email}=await import('../email.service.js');
  const brand=enrollmentMailBrand({agency:{name:ctx.practiceName},domain:'auricwell.com',clinicalOverride:true});
  return Email.sendEmail({...message,fromAddress:process.env.AURICWELL_ACCOUNT_EMAIL_FROM,fromName:'AuricWell Portal',replyTo:'support@auricwell.com',html:renderPortalEmail({brand,html})});
}
