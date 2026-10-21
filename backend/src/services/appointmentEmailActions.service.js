import crypto from 'node:crypto';
import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import { applyAppointmentReply } from './appointmentReply.service.js';
import { resolveAppointmentServiceSetting, formatAppointmentTime } from './appointmentServiceSetting.service.js';
import { clientEmailContext, sendClientPortalEmail } from './clientPortalEmail.service.js';
import { portalActionHtml } from './clientPortalEmailContent.js';
import { escapePortalHtml as e } from './portalEmailBranding.service.js';
import { dateToMysqlUtcDateTime, utcMysqlToIso } from '../utils/zonedWallTime.util.js';
import { isDobAdultLocked } from '../utils/guardianWaivers.utils.js';
import { createSchoolSessionEmailOptOutLink, schoolSessionEmailOptOutContent, isSchoolSessionEmailOptedOut, SCHOOL_EMAIL_TEMPLATE } from './schoolSessionEmailPreferences.service.js';

const hash = text => crypto.createHash('sha256').update(String(text)).digest('hex');
const emailHash = email => hash(String(email || '').trim().toLowerCase());
const fail = (message,status=410) => Object.assign(new Error(message),{status});
const date = value => value instanceof Date ? value : new Date(utcMysqlToIso(value) || value);
export const appointmentEmailActions = school => school ? ['absence'] : ['confirm','cancel','reschedule'];
export const actionLabels = {confirm:'Confirm appointment',cancel:'Cancel appointment',reschedule:'Request a new time',absence:'My child will miss school'};

export async function createAppointmentEmailLink({appointment,clientId,to}) {
  if (!appointment?.id || !clientId || !to) throw fail('An appointment and its recipient are required.',400);
  const [[participant]] = await pool.execute('SELECT id FROM appointment_participants WHERE appointment_id=? AND client_id=?',[appointment.id,clientId]);
  if (!participant) throw fail('Appointment unavailable.',404);
  const [[guardian]] = await pool.execute(`SELECT u.id FROM users u JOIN client_guardians cg ON cg.guardian_user_id=u.id
    WHERE cg.client_id=? AND cg.access_enabled=1 AND LOWER(u.email)=LOWER(?) AND u.is_active=1 LIMIT 1`,[clientId,to]);
  // Affiliated contacts receive an informational email, not authority to change a booking.
  if (!guardian) return null;
  const token=crypto.randomBytes(32).toString('hex'),start=date(appointment.startAt),end=date(appointment.endAt);
  const expires=new Date(Math.min(+end,Date.now()+30*86400000));
  if (!Number.isFinite(+expires) || +expires<=Date.now()) throw fail('This appointment has ended.');
  await pool.execute(`INSERT INTO appointment_email_actions(token_hash,appointment_id,agency_id,client_id,guardian_user_id,recipient_hash,appointment_start,appointment_end,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?)`,[hash(token),appointment.id,appointment.agencyId,clientId,guardian.id,emailHash(to),dateToMysqlUtcDateTime(start),dateToMysqlUtcDateTime(end),dateToMysqlUtcDateTime(expires)]);
  // Backend-rendered form: no login and no changes on GET/link prefetch.
  return `https://plottwisthq.com/api/public/appointment-response/${token}`;
}

export async function appointmentEmailActionContext(token,db=pool) {
  if (!/^[a-f0-9]{64}$/.test(String(token))) throw fail('This appointment link is invalid.',404);
  const [[row]]=await db.execute('SELECT * FROM appointment_email_actions WHERE token_hash=?',[hash(token)]);
  if(!row || +date(row.expires_at)<=Date.now()) throw fail('This appointment link has expired. Please contact your team.');
  if(row.product==='auricwell') return (await import('./auricwell/appointmentEmailResponse.js')).nativeResponseContext(row);
  const [[access]]=await db.execute(`SELECT u.email,cg.permissions_json,c.date_of_birth FROM users u JOIN client_guardians cg ON cg.guardian_user_id=u.id
    JOIN clients c ON c.id=cg.client_id WHERE u.id=? AND cg.client_id=? AND cg.access_enabled=1 AND u.is_active=1
    AND COALESCE(u.is_archived,0)=0 AND c.agency_id=? AND c.guardian_portal_enabled=1
    AND c.status NOT IN ('ARCHIVED','INACTIVE','TERMINATED')`,[row.guardian_user_id,row.client_id,row.agency_id]);
  if(!access || emailHash(access.email)!==row.recipient_hash) throw fail('This link no longer has access. Please sign in or contact your team.',403);
  const permissions=typeof access.permissions_json==='string'?JSON.parse(access.permissions_json):access.permissions_json||{};
  if(permissions.noView || permissions.noViewOtherGuardian || permissions.coGuardianInviteRestricted || isDobAdultLocked(access.date_of_birth)) throw fail('This link no longer has access. Please contact your team.',403);
  const appt=await Appointment.findById(row.appointment_id);
  if (!appt || Number(appt.agencyId)!==Number(row.agency_id) || +date(appt.startAt)!==+date(row.appointment_start) || +date(appt.endAt)!==+date(row.appointment_end)) throw fail('This appointment changed. Please use the latest reminder.');
  const [[participant]]=await db.execute('SELECT id FROM appointment_participants WHERE appointment_id=? AND client_id=?',[appt.id,row.client_id]);
  if(!participant) throw fail('This appointment link is no longer available.');
  const setting=await resolveAppointmentServiceSetting(appt);
  const context=await clientEmailContext({agencyId:row.agency_id,clientId:row.client_id});
  return {row,appt,setting,context};
}

export async function submitAppointmentEmailAction(token,action) {
  if (!/^[a-f0-9]{64}$/.test(String(token))) throw fail('This appointment link is invalid.',404);
  const db=await pool.getConnection();let locked=false,lock;
  try {
    const [[target]]=await db.execute('SELECT appointment_id,native_appointment_id FROM appointment_email_actions WHERE token_hash=?',[hash(token)]);
    lock=`appointment-email:${target?.appointment_id || target?.native_appointment_id || hash(token).slice(0,40)}`;
    const [[result]]=await db.execute('SELECT GET_LOCK(?,0) AS acquired',[lock]);locked=Number(result.acquired)===1;
    if(!locked) throw fail('Your response is being saved. Please wait a moment.',409);
    const current=await appointmentEmailActionContext(token,db);
    const {row,appt,setting}=current;
    if(row.status==='completed') return row.result_message;
    if(row.status!=='ready') throw fail('Your response needs review. Please contact your team before trying again.',409);
    if(!appointmentEmailActions(setting.isSchool).includes(action)) throw fail('Choose an available response.',400);
    if(!['scheduled','confirmed','client_confirmed','reschedule_requested'].includes(appt.status)) throw fail('This appointment is no longer available for a response.');
    if(!setting.isSchool && +date(appt.startAt)<=Date.now()) throw fail('This appointment has started. Please contact your team.');
    await db.execute("UPDATE appointment_email_actions SET status='processing',chosen_action=? WHERE id=? AND status='ready'",[action,row.id]);
    try {
      if(row.product==='auricwell') {
        const message=await (await import('./auricwell/appointmentEmailResponse.js')).applyNativeResponse(current,action);
        await db.execute("UPDATE appointment_email_actions SET status='completed',result_message=?,completed_at=UTC_TIMESTAMP() WHERE id=?",[message,row.id]);
        return message;
      }
      const rawBody=action==='absence'?'My child will miss school for this scheduled session.':{confirm:'Y',cancel:'N',reschedule:'R'}[action];
      const response=await applyAppointmentReply({appointmentId:appt.id,agencyId:row.agency_id,clientId:row.client_id,channel:'email',rawBody,autoApply:action!=='absence'});
      const message=action==='absence'?'Your care team has been notified that your child will miss school. Please also report the absence to the school as usual. This notice does not assess a cancellation fee.':response.ackMessage;
      await db.execute("UPDATE appointment_email_actions SET status='completed',result_message=?,completed_at=UTC_TIMESTAMP() WHERE id=?",[String(message).slice(0,1000),row.id]);
      return message;
    } catch(error) {await db.execute("UPDATE appointment_email_actions SET status='review' WHERE id=? AND status='processing'",[row.id]);throw error;}
  } finally {try {if(locked)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);} finally {db.release();}}
}

export async function buildAppointmentEmail({appointment,clientId,to,kind='reminder',actionUrl,schoolOptOut}) {
  const context=await clientEmailContext({agencyId:appointment.agencyId,clientId});
  const setting=await resolveAppointmentServiceSetting(appointment);
  if(setting.isSchool && schoolOptOut===undefined) schoolOptOut=await createSchoolSessionEmailOptOutLink({agencyId:appointment.agencyId,clientId,to});
  const optOut=setting.isSchool && schoolOptOut ? schoolSessionEmailOptOutContent(schoolOptOut.url) : {text:'',html:''};
  if(actionUrl===undefined) actionUrl=await createAppointmentEmailLink({appointment,clientId,to});
  const when=formatAppointmentTime(appointment),name=context.tenant.name;
  const subject=setting.isSchool?`${name}: School session notice`:`${name}: ${kind.startsWith('confirmation')?'Please confirm your appointment':'Appointment reminder'}`;
  const intro=setting.isSchool?`A school session is scheduled for ${when}. No confirmation is needed.`:`Your ${context.learning?'tutoring session':'appointment'} with ${name} is scheduled for ${when}.`;
  const actions=appointmentEmailActions(setting.isSchool);
  const links=actionUrl?actions.map(action=>({label:actionLabels[action],url:`${actionUrl}?action=${action}`})):[{label:'Open your portal',url:context.url(`guardian?panel=appointments&clientId=${clientId}`)}];
  const footer=setting.isSchool?'If your child will miss school, use the button to notify your care team. Please also report the absence directly to the school.':actionUrl?'Choose a response above. You can review and submit it without signing in. Any cancellation policy will still apply.':'Sign in to view your appointment or contact your team about a change.';
  return {context,subject,...(setting.isSchool?{templateType:SCHOOL_EMAIL_TEMPLATE,schoolSessionScopeKey:schoolOptOut?.scopeKey}:{}),text:`${intro}\n\n${links.map(l=>`${l.label}:\n${l.url}`).join('\n\n')}\n\n${footer}${optOut.text}`,
    html:`<h2 style="font-size:22px">${setting.isSchool?'School session notice':'Your upcoming appointment'}</h2><p>${e(intro)}</p>${links.map(l=>portalActionHtml(l.label,l.url)).join('')}<p>${e(footer)}</p>${optOut.html}`};
}

export async function sendAppointmentEmail(input) {
  const setting=await resolveAppointmentServiceSetting(input.appointment);
  if(setting.isSchool && await isSchoolSessionEmailOptedOut({agencyId:input.appointment.agencyId,clientId:input.clientId,to:input.to})) return {skipped:true,reason:'school_session_email_opted_out'};
  const {context,...content}=await buildAppointmentEmail(input);
  return sendClientPortalEmail({agencyId:input.appointment.agencyId,clientId:input.clientId,context,to:input.to,
    userId:input.userId || null,templateType:input.kind?.startsWith('confirmation')?'session_confirmation':'session_reminder',source:'auto',...content});
}
