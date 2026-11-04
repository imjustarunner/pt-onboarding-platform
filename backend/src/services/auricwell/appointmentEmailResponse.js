import crypto from 'node:crypto';
import sharedPool from '../../config/database.js';
import { get, transaction, lockPractice, update, create, list, audit } from './repository.js';
import { practiceMessagingContext } from './clientMessaging.js';
import { clientEmailContext, sendClientPortalEmail } from '../clientPortalEmail.service.js';
import { renderPortalEmail, enrollmentMailBrand, escapePortalHtml as e } from '../portalEmailBranding.service.js';
import { appointmentActionsHtml } from '../../utils/appointmentEmailContent.js';
import { nativeAppointmentProviderCopy } from '../appointmentProviderCopy.service.js';
import { nativeSchoolAppointment, schoolAppointmentReminderText } from '../../utils/schoolAppointmentReminder.js';
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
  return {row,ctx,appointment,patient,context,setting:{isSchool:nativeSchoolAppointment(appointment)},
    appt:{id:appointment.id,agencyId:ctx.agencyId,startAt:appointment.data.start,endAt:appointment.data.end,status:appointment.data.status,sourceTimezone:ctx.settings.timezone}};
}

export async function applyNativeResponse(current,action) {
  const {ctx,appointment,patient}=current;
  return transaction(async db=>{
    await lockPractice(ctx,db);
    const fresh=await get(ctx,'appointment',appointment.id,db,true);
    if(fresh.data.start!==appointment.data.start || fresh.data.end!==appointment.data.end || !['scheduled','confirmed'].includes(fresh.data.status)) throw fail('The appointment changed. Please contact your team.');
    const school=nativeSchoolAppointment(fresh);
    if(school && !['cancel','absence'].includes(action)) throw fail('Only cancellation is available for a school session.');
    if(action==='confirm') {
      await update(ctx,fresh,{...fresh.data,status:'confirmed',emailConfirmedAt:new Date().toISOString()},db);
      await audit(ctx,'appointment.email_confirmed',fresh.id,{patientId:patient.id,channel:'email'},db);
      return 'Your appointment is confirmed. Thank you!';
    }
    const pending=(await list(ctx,'appointment_request',{patientId:patient.id},db)).find(r=>r.data.appointmentId===fresh.id && r.data.status==='pending');
    if(pending&&(school||action==='absence')) await update(ctx,pending,{...pending.data,message:`${pending.data.message || ''}\nFamily requested school session cancellation via email. No fee was authorized.`.slice(0,2000)},db);
    if(!pending) await create(ctx,'appointment_request',{appointmentId:fresh.id,requestType:action==='absence'?'cancel':action,
      message:school||action==='absence'?'Family requested school session cancellation via the session email. No fee was authorized.':`Family requested ${action==='cancel'?'cancellation':'a new time'} through the appointment email.`,
      requestedBy:null,requestedByName:'Authorized email recipient',requestedStart:fresh.data.start,status:'pending'}, {patientId:patient.id},db);
    await audit(ctx,'appointment.email_change_requested',fresh.id,{action,channel:'email'},db);
    return `${school?'Your school session cancellation':action==='absence'?'Your cancellation':`Your ${action==='cancel'?'cancellation':'rescheduling'}`} request was sent to your care team for review. Your appointment stays scheduled until they respond.${school?' Please report school absences to the school as usual. No fee was authorized.':''}`;
  });
}

export async function sendNativeAppointmentEmail(ctx,to,text,appointment) {
  const school=nativeSchoolAppointment(appointment);
  const scope={agencyId:ctx.agencyId,practiceId:ctx.practiceId,patientId:appointment.patientId,to};
  if(school && await isSchoolSessionEmailOptedOut(scope)) return {skipped:true,reason:'school_session_email_opted_out'};
  const schoolOptOut=school ? await createSchoolSessionEmailOptOutLink(scope) : null;
  const optOut=schoolOptOut ? schoolSessionEmailOptOutContent(schoolOptOut.url) : {text:'',html:''};
  const token=crypto.randomBytes(32).toString('hex'),expires=new Date(Math.min(Date.parse(appointment.data.end),Date.now()+30*86400000));
  if(!Number.isFinite(+expires)||+expires<=Date.now()) throw fail('This appointment has ended.');
  if(!ctx.agencyId&&String(process.env.AURICWELL_APPOINTMENT_EMAIL_FROM||'').trim().toLowerCase()!=='reminders@auricwell.com') throw fail('Configure the AuricWell notifications sender before sending.');
  await sharedPool.execute(`INSERT INTO appointment_email_actions(token_hash,agency_id,product,practice_id,native_appointment_id,native_patient_id,recipient_hash,appointment_start,appointment_end,expires_at)
    VALUES(?,?,'auricwell',?,?,?,?,?,?,?)`,[hash(token),ctx.agencyId||null,ctx.practiceId,appointment.id,appointment.patientId,emailHash(to),dateToMysqlUtcDateTime(new Date(appointment.data.start)),dateToMysqlUtcDateTime(new Date(appointment.data.end)),dateToMysqlUtcDateTime(expires)]);
  const url=appointmentResponseUrl(token,{clinical:true});
  const actions=school?[['Cancel school session','cancel']]:[['Confirm appointment','confirm'],['Request cancellation','cancel'],['Request a new time','reschedule']];
  const body=school?`${schoolAppointmentReminderText} Use the cancel button if your dependent cannot attend. Please report school absences to the school as usual.`:String(text).replace(/For scheduling changes, contact your practice\./,'Confirm directly from this email. Cancellation and new-time requests open a review page. No sign-in is needed.');
  const html=`<h2>${school?'School session notice':'Your upcoming appointment'}</h2><p>${e(body).replaceAll('\n','<br>')}</p>${appointmentActionsHtml(actions.map(([label,action])=>({label,url:`${url}?action=${action}`})))}${optOut.html}`;
  const cc=school?await nativeAppointmentProviderCopy(ctx,appointment,to):[];
  const message={to,...(cc.length?{cc}:{}),subject:`${ctx.practiceName}: ${school?'School session notice':'Appointment reminder'}`,text:`${body}\n\n${actions.map(([label,action])=>`${label}: ${url}?action=${action}`).join('\n\n')}${optOut.text}`,html,source:'auto',templateType:school?SCHOOL_EMAIL_TEMPLATE:'auricwell_session_reminder',schoolSessionScopeKey:schoolOptOut?.scopeKey};
  if(ctx.agencyId){const context=await clientEmailContext({agencyId:ctx.agencyId,clinical:true});return sendClientPortalEmail({agencyId:ctx.agencyId,context,appointments:true,...message});}
  const {default:Email}=await import('../email.service.js');
  const brand={...enrollmentMailBrand({agency:{name:ctx.practiceName},domain:'auricwell.com',clinicalOverride:true}),displayName:'AuricWell Notifications'};
  return Email.sendEmail({...message,fromAddress:process.env.AURICWELL_APPOINTMENT_EMAIL_FROM,fromName:'AuricWell Notifications',replyTo:'support@auricwell.com',html:renderPortalEmail({brand,html})});
}
