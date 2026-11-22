import pool from '../config/database.js';

// Appointment authorization happens before this lookup. Only the assigned
// provider's display name is included, never their personal contact details.
export async function appointmentEmailTutorName(appointment,db=pool) {
 if(!['tutoring','learning'].includes(appointment.businessType)||!appointment.providerUserId)return '';
 const [[provider]]=await db.execute('SELECT first_name,last_name FROM users WHERE id=?',[appointment.providerUserId]);
 return [provider?.first_name,provider?.last_name].filter(Boolean).join(' ').trim();
}
