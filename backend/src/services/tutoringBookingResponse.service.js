import {createAppointmentEmailLink} from './appointmentEmailActions.service.js';
import {appointmentActionsHtml} from '../utils/appointmentEmailContent.js';
import {appointmentEmailTutorName} from './appointmentEmailDetails.service.js';
import {resolveAppointmentServiceSetting} from './appointmentServiceSetting.service.js';
import {sessionRsvpState} from './sessionReminderPolicy.js';
export async function tutoringBookingResponseEmail({appointment,clientId,to,guardianUserId}){
 if(!['learning','tutoring'].includes(appointment.businessType)||!['scheduled','confirmed','client_confirmed'].includes(appointment.status))return null;
 // RSVP capability is independent of the Session Hub/video rollout, including
 // in-person tutoring. Recipient and current service authorization still apply.
 const setting=await resolveAppointmentServiceSetting(appointment);
 const url=await createAppointmentEmailLink({appointment,clientId,to,guardianUserId,isSchool:setting.isSchool});
 if(!url)return null;
 const action=(value)=>url+(url.includes('?')?'&':'?')+'action='+value;
 const links=setting.isSchool?[{label:'Cancel school session',url:action('cancel')}]:[...(sessionRsvpState(appointment)!=='confirmed'?[{label:'Confirm tutoring session',url:action('confirm')}]:[]),{label:'Cancel tutoring session',url:action('cancel')},{label:'Request a different time',url:action('reschedule')}];
 return {links,reviewUrl:action('review'),tutorName:await appointmentEmailTutorName(appointment),text:links.map(l=>l.label+': '+l.url).join('\n'),html:appointmentActionsHtml(links)};
}
