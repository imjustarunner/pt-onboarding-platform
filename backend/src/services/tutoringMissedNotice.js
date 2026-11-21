import {appointmentServiceLabel} from '../utils/appointmentPresentation.js';
import {parseUtcDate} from '../utils/officeEventDateTime.util.js';
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function providerTutoringOutcomeUrl(portalUrl, appointmentId) {
 const url = new URL(portalUrl);
 const tenant = url.pathname.match(/^\/([a-z0-9_-]+)\/guardian(?:\/|$)/i)?.[1];
 url.pathname = (tenant ? '/' + tenant : '') + '/tutoring-session/appointment/' + appointmentId;
 url.search = ''; url.hash = '';
 return url.href;
}
export function buildTutoringMissedNotice(appointment,portalUrl,{parentFirstName,studentFirstName,tutorFirstName,providerCopy=false,clientMessage}={}){
 const zone=appointment.sourceTimezone||'America/Denver',when=new Intl.DateTimeFormat('en-US',{timeZone:zone,weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(parseUtcDate(appointment.startAt));
 const student=studentFirstName||'your child',tutor=tutorFirstName||'Your tutor',service=appointmentServiceLabel(appointment);
 const paragraphs=providerCopy?[`Copy of the missed-session notice for ${studentFirstName||'your student'}.`,`${service} · ${when}.`,`Appointment #${appointment.id} was recorded as missed. Its correction window has ended. Open the Session Hub to review the attendance record.`]:[`Hi${parentFirstName?' '+parentFirstName:''},`,`${tutor} marked ${student}'s ${service} session on ${when} as missed because ${student} wasn't able to attend.`,`Depending on your plan, this may use a session from your package or include a missed-session fee. Sign in to your Next Level Up portal to see the details for this session and your current balance.`,`If ${student} attended, or you think this was marked by mistake, reply to this email or contact Support so we can review it.`,`Thanks,`,`Next Level Up`];
 if (!providerCopy && String(clientMessage || '').trim()) paragraphs.splice(2, 0, String(clientMessage).trim());
 const subject=providerCopy?`Copy: missed session for ${studentFirstName||'your student'} on ${when}`:`Missed session: ${service} on ${when}`;
 return {subject,text:[...paragraphs,`View session details: ${portalUrl}`,`Reference: appointment #${appointment.id}`].join('\n\n'),html:paragraphs.map(p=>`<p>${escape(p).replaceAll('\n', '<br>')}</p>`).join('')+`<p><a href="${escape(portalUrl)}">View session details</a></p><p>Reference: appointment #${Number(appointment.id)}</p>`,sms:`A missed-session notice is available in your Next Level Up portal: ${portalUrl}`};
}
