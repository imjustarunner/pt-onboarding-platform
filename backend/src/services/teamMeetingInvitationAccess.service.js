import { createHash,createHmac } from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from '../config/config.js';
import pool from '../config/database.js';
import { invitationEvents } from './meetingInvitations.service.js';
import { canJoinTeamMeeting,roomUnavailable } from './meetingJoinPolicy.service.js';
import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
const issuer='personal-team-meeting-invitation',audience='team-meeting';
const key=()=>createHmac('sha256',config.jwt.secret).update(issuer).digest();
const hash=t=>createHash('sha256').update(String(t)).digest('hex');
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function resolveTeamMeetingInvitationAccess(token,now=new Date()){
 if(!/^[\w-]{32}$/.test(String(token||'')))throw fail(404,'Invitation not found.');
 const [rows]=await pool.execute('SELECT * FROM meeting_email_invitations WHERE join_token=?',[token]);
 const invitation=rows[0];if(!invitation||invitation.meeting_type!=='team_meeting')return null;
 const event=(await invitationEvents(invitation)).find(e=>!e.meeting_completed_at&&(parseUtcDate(e.end_at)>now||Number(e.has_live_presence)===1));
 if(!event||!await canJoinTeamMeeting(event,invitation.user_id))throw fail(410,'This invitation is no longer available.');
 if(event.platform_video_link!=null&&!Number(event.platform_video_link))return {joinUrl:null,meeting:{title:event.title,when:String(event.start_at),location:event.location_text||event.google_meet_link||''}};
 const blocked=roomUnavailable(event);if(blocked)throw fail(blocked.status,blocked.error.message);
 const expiresIn=12*60*60;
 return {joinUrl:`${await tenantMeetingBase(event.agency_id)}/join/team-meeting/${event.id}`,teamMeetingAccess:{eventId:Number(event.id),expiresAt:now.getTime()+expiresIn*1000,token:jwt.sign({invitationId:Number(invitation.id),invitationHash:hash(token),eventId:Number(event.id)},key(),{algorithm:'HS256',issuer,audience,subject:String(invitation.user_id),expiresIn})}};
}
export function teamMeetingRequest(method,path){
 const info=/^\/join-info\/(\d+)$/.exec(String(path||''));if(method==='GET'&&info)return {eventId:Number(info[1]),action:'join-info'};
 const m=/^\/(\d+)\/(.+?)\/?$/.exec(String(path||'').split('?')[0]);if(!m)return null;
 const allowed={GET:/^(calendar-guests|video-token|admission-status|lobby-participants|workspace|participants|activity|attendance|transcription)$/,POST:/^(calendar-guests\/\d+\/admit|join-presence|admit\/\d+|waiting-room|activity|workspace|complete|client-transcript|transcript-control|transcription\/audio)$/};
 return allowed[String(method).toUpperCase()]?.test(m[2])?{eventId:Number(m[1]),action:m[2]}:null;
}
export async function validateTeamMeetingAccess(token,request,body={}){
 let grant;try{grant=jwt.verify(token,key(),{algorithms:['HS256'],issuer,audience});}catch{throw fail(401,'Open your personal invitation again.');}
 if(!request||Number(grant.eventId)!==request.eventId)throw fail(403,'This link only grants access to its meeting.');
 const [rows]=await pool.execute('SELECT * FROM meeting_email_invitations WHERE id=? AND user_id=?',[grant.invitationId,Number(grant.sub)]);
 const invitation=rows[0];if(!invitation||invitation.meeting_type!=='team_meeting'||hash(invitation.join_token)!==grant.invitationHash)throw fail(410,'Invitation no longer available.');
 const event=(await invitationEvents(invitation)).find(e=>Number(e.id)===request.eventId);
 if(!event||!await canJoinTeamMeeting(event,Number(grant.sub)))throw fail(403,'You are no longer invited to this meeting.');
 const blocked=roomUnavailable(event);
 const ended=parseUtcDate(event.meeting_completed_at);
 const closing=request.action==='join-presence'&&body.action==='leave'&&ended&&Date.now()-ended.getTime()<300000;
 if(blocked&&!closing)throw fail(blocked.status,blocked.error.message);
 const [users]=await pool.execute('SELECT id,first_name,last_name,email,role FROM users WHERE id=?',[Number(grant.sub)]);
 if(!users[0])throw fail(410,'Account unavailable.');return {user:users[0],eventId:request.eventId};
}
