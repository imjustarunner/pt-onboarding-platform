import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import express from 'express';
const m=vi.hoisted(()=>({execute:vi.fn(),events:vi.fn(),save:vi.fn(),trainingSave:vi.fn(),people:vi.fn(),team:vi.fn(),join:vi.fn()}));
vi.mock('../../config/database.js',()=>({default:{execute:m.execute}}));
vi.mock('../meetingInvitations.service.js',()=>({invitationEvents:m.events}));
vi.mock('../supervisionRsvp.service.js',()=>({saveSupervisionRsvp:m.save}));
vi.mock('../scheduledTrainingRsvp.service.js',()=>({saveTrainingRsvp:m.trainingSave}));
vi.mock('../supervisionEmail.service.js',()=>({supervisionCalendar:vi.fn(),supervisionEmailPeople:m.people}));
vi.mock('../meetingParticipants.service.js',()=>({meetingParticipantRows:m.team}));
vi.mock('../supervisionInvitationAccess.service.js',()=>({resolveSupervisionInvitationAccess:m.join}));
vi.mock('../teamMeetingInvitationAccess.service.js',()=>({resolveTeamMeetingInvitationAccess:vi.fn()}));
vi.mock('../activeMeetingPrompts.service.js',()=>({activeMeetingPrompts:vi.fn()}));
vi.mock('../../middleware/auth.middleware.js',()=>({authenticate:(_req,res)=>res.status(401).json({error:{message:'No token provided'}})}));
vi.mock('../../models/SupervisionSession.model.js',()=>({default:{}}));
vi.mock('../../models/ProviderScheduleEvent.model.js',()=>({default:{}}));
vi.mock('../../models/MeetingAgendaItem.model.js',()=>({mapMeetingAgendaItem:r=>r}));
import routes from '../../routes/meetingInvitations.routes.js';
import {invitationResponseContext} from '../meetingInvitationResponse.service.js';
const token='t'.repeat(32);
let server,invitation,event;
beforeEach(()=>{
 vi.clearAllMocks();
 invitation={id:1,join_token:token,meeting_type:'supervision',agency_id:2,user_id:7};
 event={id:19,agency_id:2,supervisor_user_id:8,session_type:'group',start_at:'2099-10-15 16:00:00',end_at:'2099-10-15 17:00:00',event_timezone:'America/Denver'};
 m.execute.mockImplementation(async(sql,args)=>{
  if(sql.includes('meeting_email_invitations'))return [args[0]===token?[invitation]:[]];
 if(sql.startsWith('SELECT id,role FROM users'))return [[{id:7,role:'provider'}]];
 if(sql.includes('meeting_agenda_items'))return [[{title:'Presentation',notes:'Private notes'}]];
  if(sql.startsWith('SELECT user_id,rsvp_decline_reason'))return [[{user_id:7,rsvp_decline_reason:'attended in the spring'},...(args[1]?[{user_id:9,rsvp_decline_reason:'Private reason'}]:[])]];
  return [{affectedRows:1}];
 });
 m.events.mockResolvedValue([event]);m.save.mockResolvedValue({ok:true,response:'accepted'});m.trainingSave.mockResolvedValue({ok:true,response:'declined'});
 m.people.mockResolvedValue([{id:7,name:'Ryn',is_required:1,status:'INVITED',email:'private@example.test'},{id:9,name:'Attendee',status:'DECLINED',decline_reason:'Private reason'}]);
 m.team.mockResolvedValue([{id:7,name:'Ryn',rsvp:'accepted',email:'private@example.test'}]);
 m.join.mockResolvedValue({joinUrl:'https://tenant.test/join/supervision/19',supervisionAccess:{sessionId:19,token:'scoped-only'}});
});
afterEach(async()=>{if(server){const done=once(server,'close');server.close();server.closeAllConnections();await done;server=null;}});
async function url(){
 const app=express();app.use(express.json());
 const source=readFileSync(new URL('../../server.js',import.meta.url),'utf8');
 const mounts=[...source.matchAll(/app\.use\('(\/api(?:\/meeting-invitations)?)', (meetingInvitationsRoutes|userCommunicationRoutes)\);/g)];
 expect(mounts).toHaveLength(2);
 for(const[,path,name]of mounts)app.use(path,name==='meetingInvitationsRoutes'?routes:(_req,res)=>res.sendStatus(401));
 app.use((err,_req,res,_next)=>res.status(err.status||500).json({error:{message:err.message}}));
 server=app.listen(0,'127.0.0.1');await once(server,'listening');return `http://127.0.0.1:${server.address().port}/api/meeting-invitations`;
}
it('shows signed-out details with agenda but no private notes, emails, other decline reasons, or app session',async()=>{
 const r=await fetch(`${await url()}/${token}?details=1&eventId=19`);
 expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(r.headers.get('set-cookie')).toBeNull();
 const body=await r.json();expect(body.meeting).toMatchObject({recipientName:'Ryn',title:'Group supervision',agenda:[{title:'Presentation'}]});
 expect(JSON.stringify(body)).not.toMatch(/Private|private@example|join_token|supervisionAccess/);
 expect(m.save).not.toHaveBeenCalled();
});
it('accepts an RSVP without app login and derives identity only from the personal invitation',async()=>{
 const r=await fetch(`${await url()}/${token}/rsvp`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:19,userId:999,response:'accepted'})});
 expect(r.status).toBe(200);expect(m.save).toHaveBeenCalledWith(expect.objectContaining({sessionId:19,userId:7,response:'accepted'}));
});
it('keeps the personal join route ahead of catch-all app authentication',async()=>{
 const r=await fetch(`${await url()}/${token}`);expect(r.status).toBe(200);expect((await r.json()).supervisionAccess.sessionId).toBe(19);
});
it.each(['active','../users/1/communications'])('still protects the private route %s',async path=>{
 const r=await fetch(`${await url()}/${path}`);expect(r.status).toBe(401);
});
it('rejects a meeting outside the invited series without updating RSVP',async()=>{
 const r=await fetch(`${await url()}/${token}/rsvp`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:200,userId:7,response:'accepted'})});
 expect(r.status).toBe(410);expect(m.save).not.toHaveBeenCalled();
});
it.each(['broken','x'.repeat(32)])('rejects malformed or unknown personal links',async badToken=>{
 await expect(invitationResponseContext(badToken,19)).rejects.toMatchObject({status:404});
});
it('rejects recipients removed from the invitation roster',async()=>{
 m.events.mockResolvedValue([]);await expect(invitationResponseContext(token,19)).rejects.toMatchObject({status:410});
 expect(m.events).toHaveBeenCalledWith(invitation,{includeDeclined:true});
});
it.each([{end_at:'2000-01-01 00:00:00'},{live_ended_at:'2026-10-15 17:00:00'},{meeting_completed_at:'2026-10-15 17:00:00'}])('rejects ended invitations %j',async patch=>{
 Object.assign(event,patch);await expect(invitationResponseContext(token,19)).rejects.toMatchObject({status:410});
});
it('uses team RSVP status without implying supervision compensation',async()=>{
 invitation.meeting_type='team_meeting';event.kind='TEAM_MEETING';delete event.session_type;
 const r=await fetch(`${await url()}/${token}?details=1&eventId=19`);expect(r.status).toBe(200);
 expect((await r.json()).meeting).toMatchObject({title:'Meeting',attendance:null,rsvp:'accepted',participants:[{name:'Ryn',status:'accepted'}]});
});
it('stores a mandatory training decline reason under the invitation identity',async()=>{
 invitation.meeting_type='team_meeting';event.kind='TEAM_MEETING';event.meeting_subtype='training';event.provider_id=8;delete event.session_type;
 const r=await fetch(`${await url()}/${token}/rsvp`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:19,userId:999,response:'declined',reason:'attended in the spring'})});
 expect(r.status).toBe(200);expect(m.trainingSave).toHaveBeenCalledWith(event,7,'declined','attended in the spring');
});
it.each([false,true])('shows training decline reasons only to their author or a trainer: proctor=%s',async proctor=>{
 invitation.meeting_type='team_meeting';event.kind='TEAM_MEETING';event.meeting_subtype='training';event.provider_id=8;delete event.session_type;
 m.team.mockResolvedValue([{id:7,name:'Ryn',is_required:1,is_cohost:Number(proctor),rsvp:'declined'},{id:9,name:'Attendee',is_required:1,rsvp:'declined'}]);
 const r=await fetch(`${await url()}/${token}?details=1&eventId=19`);expect(r.status).toBe(200);const body=await r.json();
 expect(body.meeting.declineReason).toBe('attended in the spring');
 if(proctor){expect(body.meeting.participants[0].declineReason).toBe('attended in the spring');expect(body.meeting.participants[1].declineReason).toBe('Private reason');}
 else expect(body.meeting.participants).toEqual([]);
 expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('(?=1 OR user_id=?)'),[19,Number(proctor),7]);
});

it.each(['admin','super_admin','support'])('shows declined supervision RSVPs to an authorized %s invitation recipient',async role=>{
 const base=m.execute.getMockImplementation();
 m.execute.mockImplementation(async(sql,args)=>sql.startsWith('SELECT id,role FROM users')?[[{id:7,role}]]:base(sql,args));
 const r=await fetch(`${await url()}/${token}?details=1&eventId=19`);
 expect(r.status).toBe(200);const body=await r.json();
 expect(body.meeting.canSeeDeclined).toBe(true);
 expect(body.meeting.participants.find(p=>p.name==='Attendee')).toMatchObject({status:'DECLINED',declineReason:'Private reason'});
});
