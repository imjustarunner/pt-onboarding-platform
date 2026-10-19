import {afterEach,it,expect} from 'vitest';
import {saveTeamMeetingAccess,attachTeamMeetingAccess} from '../teamMeetingInvitationAccess';
import {saveSupervisionAccess,attachSupervisionAccess} from '../supervisionInvitationAccess';
afterEach(()=>history.replaceState(null,'','/'));
it('attaches a team invitation only to its meeting and never an external URL',()=>{saveTeamMeetingAccess({eventId:9,token:'private',expiresAt:Date.now()+60000});history.replaceState(null,'','/join/team-meeting/9');expect(attachTeamMeetingAccess({url:'/team-meetings/9/video-token'}).headers['X-Team-Meeting-Access']).toBe('private');expect(attachTeamMeetingAccess({url:'/team-meetings/10/video-token'}).headers).toBeUndefined();expect(attachTeamMeetingAccess({url:'https://elsewhere.example/team-meetings/9/video-token'}).headers).toBeUndefined();});
it('never tags shared calendar joins using cached personal invitations',()=>{saveTeamMeetingAccess({eventId:9,token:'private',expiresAt:Date.now()+60000});saveSupervisionAccess({sessionId:8,token:'private-supervision',expiresAt:Date.now()+60000});history.replaceState(null,'','/join/team-meeting/shared-calendar-token');expect(attachTeamMeetingAccess({url:'/team-meetings/9/video-token'}).headers).toBeUndefined();history.replaceState(null,'','/join/supervision/shared-calendar-token');expect(attachSupervisionAccess({url:'/supervision/sessions/8/video-token'}).headers).toBeUndefined();});
it('scopes agenda credentials to this team meeting and never to other meeting types',()=>{
 saveTeamMeetingAccess({eventId:9,token:'private',expiresAt:Date.now()+60000});history.replaceState(null,'','/join/team-meeting/9');
 expect(attachTeamMeetingAccess({url:'/meeting-agendas',params:{meetingType:'provider_schedule_event',meetingId:9}}).headers['X-Team-Meeting-Access']).toBe('private');
 expect(attachTeamMeetingAccess({url:'/meeting-agendas/3/items/4',method:'patch'}).headers['X-Team-Meeting-Access']).toBe('private');
 expect(attachTeamMeetingAccess({url:'/meeting-agendas',params:{meetingType:'supervision_session',meetingId:9}}).headers).toBeUndefined();
 expect(attachTeamMeetingAccess({url:'/meeting-agendas',params:{meetingType:'provider_schedule_event',meetingId:10}}).headers).toBeUndefined();
});
