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
