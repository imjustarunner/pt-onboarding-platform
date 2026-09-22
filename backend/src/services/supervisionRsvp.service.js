import pool from '../config/database.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { isSignupOpen } from './supervisionSignup.service.js';
export async function saveSupervisionRsvp({sessionId,userId,response,now=new Date()}) {
 if(!['accepted','declined'].includes(response))throw Object.assign(new Error('Choose attending or not attending.'),{status:400});
 const db=await pool.getConnection();
 try{await db.beginTransaction();
 const [rows]=await db.execute(`SELECT s.*,a.status attendee_status FROM supervision_sessions s JOIN supervision_session_attendees a ON a.session_id=s.id AND a.user_id=?
 WHERE s.id=? AND a.status NOT IN ('REMOVED','CANCELLED') AND EXISTS(SELECT 1 FROM user_agencies ua JOIN users u ON u.id=ua.user_id WHERE ua.user_id=? AND ua.agency_id=s.agency_id AND ua.is_active=1 AND u.is_active=1) FOR UPDATE`,[userId,sessionId,userId]);
 const session=rows[0];
 if(!session||session.status!=='SCHEDULED'||parseUtcDate(session.start_at)<=now)throw Object.assign(new Error('This supervision RSVP is no longer available.'),{status:410});
 if(response==='accepted'&&session.enrollment_mode==='signup_only'&&!['SIGNED_UP','JOINED'].includes(session.attendee_status)&&!isSignupOpen(session,now))throw Object.assign(new Error('Registration for this session has closed.'),{status:409});
 await db.execute('UPDATE supervision_session_attendees SET status=?,updated_at=UTC_TIMESTAMP() WHERE session_id=? AND user_id=?',[response==='accepted'?'SIGNED_UP':'DECLINED',sessionId,userId]);
 await db.commit();return {ok:true,response};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
