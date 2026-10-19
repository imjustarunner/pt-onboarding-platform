import pool from '../config/database.js';
import { authenticateSupervisionAgenda } from './supervisionInvitationAccess.middleware.js';
import { authenticate,authenticateOptional } from './auth.middleware.js';
import { teamMeetingRequest,validateTeamMeetingAccess } from '../services/teamMeetingInvitationAccess.service.js';
const scoped=optional=>async(req,res,next)=>{
 const token=req.get('X-Team-Meeting-Access');if(!token)return (optional?authenticateOptional:authenticate)(req,res,next);
 res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 try{const access=await validateTeamMeetingAccess(token,teamMeetingRequest(req.method,req.path),req.body);req.user=access.user;req.teamMeetingInvitationAccess=access;next();}
 catch(e){if(e.status)return res.status(e.status).json({error:{message:e.message}});next(e);}
};
export const authenticateTeamMeeting=scoped(false);
export const authenticateTeamMeetingOptional=scoped(true);

// Agenda IDs are resolved server-side before checking the invitation's meeting scope.
export async function authenticateTeamMeetingAgenda(req, res, next) {
 const token = req.get('X-Team-Meeting-Access');
 if (!token) return authenticateSupervisionAgenda(req, res, next);
 res.set({'Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
 try {
  let eventId = 0;
  if (req.path === '/' && ['GET','POST'].includes(req.method)) {
   const input = req.method === 'GET' ? req.query : req.body;
   if (input?.meetingType === 'provider_schedule_event') eventId = Number(input.meetingId);
  } else if (/^\/\d+\/items(?:\/\d+|\/bulk)?$/.test(req.path)) {
   const [rows] = await pool.execute('SELECT meeting_type,meeting_id FROM meeting_agendas WHERE id=?',[Number(req.path.split('/')[1])]);
   if (rows[0]?.meeting_type === 'provider_schedule_event') eventId = Number(rows[0].meeting_id);
  }
  const access = await validateTeamMeetingAccess(token,eventId ? {eventId,action:'agenda'} : null,req.body);
  req.user = access.user;
  req.teamMeetingInvitationAccess = access;
  next();
 } catch(e) {
  if(e.status)return res.status(e.status).json({error:{message:e.message}});
  next(e);
 }
}
