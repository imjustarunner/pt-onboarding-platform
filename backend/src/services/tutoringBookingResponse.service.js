import Agency from '../models/Agency.model.js';
import pool from '../config/database.js';
import {tutoringSessionHubEnabled} from '../utils/tutoringSessionHubPolicy.js';
import {authorizedAppointmentClient} from './guardianAppointments.service.js';
import {guardianContextAllowsAppointment} from './clientServiceEnrollment.service.js';
import {tutoringInvitationAllowed} from '../utils/tutoringGuestPermissions.js';
import {createAppointmentEmailLink} from './appointmentEmailActions.service.js';
import {appointmentActionsHtml} from '../utils/appointmentEmailContent.js';
export async function tutoringBookingResponseEmail({appointment,clientId,to}){
 if(!['learning','tutoring'].includes(appointment.businessType)||!['scheduled','confirmed','client_confirmed'].includes(appointment.status))return null;
 if(!tutoringSessionHubEnabled(await Agency.findById(appointment.agencyId)))return null;
 const [[recipient]]=await pool.execute('SELECT u.id FROM users u JOIN client_guardians g ON g.guardian_user_id=u.id WHERE g.client_id=? AND g.access_enabled=1 AND u.is_active=1 AND LOWER(u.email)=LOWER(?) LIMIT 1',[clientId,to]);
 if(!recipient)return null;
 try{const access=await authorizedAppointmentClient(recipient.id,clientId,{agencyId:appointment.agencyId,serviceId:appointment.learningContext?.serviceEnrollmentId});if(!tutoringInvitationAllowed(access,appointment,guardianContextAllowsAppointment))return null;}
 catch(e){if([403,404].includes(e.status))return null;throw e;}
 const url=await createAppointmentEmailLink({appointment,clientId,to});
 if(!url)return null;
 const action=(value)=>url+(url.includes('?')?'&':'?')+'action='+value;
 const links=[{label:'Confirm tutoring session',url:action('confirm')},{label:'Cancel tutoring session',url:action('cancel')},{label:'Request a different time',url:action('reschedule')}];
 return {text:links.map(l=>l.label+': '+l.url).join('\n'),html:appointmentActionsHtml(links)};
}
