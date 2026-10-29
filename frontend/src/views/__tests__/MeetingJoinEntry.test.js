import {mount,flushPromises} from '@vue/test-utils';import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({route:{params:{eventId:'s'.repeat(32)},fullPath:'/join/team-meeting/shared'},get:vi.fn(),post:vi.fn(),setAuth:vi.fn(),teamAccess:vi.fn(),supervisionAccess:vi.fn()}));
vi.mock('vue-router',()=>({useRoute:()=>m.route}));
vi.mock('../../store/auth',()=>({useAuthStore:()=>({setAuth:m.setAuth})}));
vi.mock('../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('../../utils/teamMeetingInvitationAccess',()=>({teamMeetingAccessFor:m.teamAccess}));
vi.mock('../../utils/supervisionInvitationAccess',()=>({supervisionAccessFor:m.supervisionAccess}));
vi.mock('../teamMeeting/JoinTeamMeetingView.vue',()=>({__esModule:true,default:{template:'<div>Identified meeting workspace</div>'}}));
vi.mock('../supervision/JoinSupervisionView.vue',()=>({__esModule:true,default:{template:'<div>Identified supervision workspace</div>'}}));
vi.mock('../teamMeeting/ApplicantInterviewView.vue',()=>({__esModule:true,default:{props:['invitationToken'],template:'<div>Applicant interview {{ invitationToken }}</div>'}}));
import Entry from '../MeetingJoinEntry.vue';
beforeEach(()=>{vi.clearAllMocks();m.route.query={};m.route.params={eventId:'s'.repeat(32)};m.teamAccess.mockReturnValue(null);m.supervisionAccess.mockReturnValue(null);m.get.mockImplementation(async url=>{if(url==='/users/me')throw {response:{status:401}};return {data:{title:'Team meeting',interview:false}};});});
afterEach(()=>vi.useRealTimers());
const mountEntry=()=>mount(Entry,{global:{stubs:{RouterLink:{name:'RouterLink',props:['to'],template:'<a><slot /></a>'},VideoSessionRoom:true}}});
it('keeps an unsigned calendar visitor a guest even with a cached personal invitation',async()=>{m.teamAccess.mockReturnValue({token:'previous-invite'});const w=mountEntry();await flushPromises();expect(w.text()).toContain('Request to join as guest');expect(m.teamAccess).not.toHaveBeenCalled();expect(m.setAuth).not.toHaveBeenCalled();w.unmount();});
it('uses the signed-in account for a calendar link',async()=>{m.get.mockResolvedValue({data:{id:8,role:'provider'}});const w=mountEntry();await flushPromises();await flushPromises();expect(m.setAuth).toHaveBeenCalledWith(null,{id:8,role:'provider'},null);await vi.waitFor(()=>expect(w.text()).toContain('Identified meeting workspace'));w.unmount();});
it('uses a scoped email grant without creating an app login',async()=>{m.route.params={eventId:'9'};m.teamAccess.mockReturnValue({token:'personal-scope'});const w=mountEntry();await flushPromises();await flushPromises();await vi.waitFor(()=>expect(w.text()).toContain('Identified meeting workspace'));expect(m.get).not.toHaveBeenCalled();expect(m.setAuth).not.toHaveBeenCalled();w.unmount();});
it('requires the recipient’s account for a shared supervision link even with a cached personal grant',async()=>{
 m.route.params={sessionId:'9'};m.route.query={account:'1'};m.supervisionAccess.mockReturnValue({token:'someone-else'});
 const w=mountEntry();await flushPromises();
 expect(m.supervisionAccess).not.toHaveBeenCalled();expect(w.text()).toContain('Sign in to join');
 expect(w.text()).not.toContain('Request to join as guest');expect(m.post).not.toHaveBeenCalled();w.unmount();
});
it('joins a shared supervision link as the signed-in recipient',async()=>{
 m.route.params={sessionId:'9'};m.route.query={account:'1'};m.supervisionAccess.mockReturnValue({token:'someone-else'});
 m.get.mockResolvedValue({data:{id:17,role:'provider'}});
 const w=mountEntry();await vi.waitFor(()=>expect(w.text()).toContain('Identified supervision workspace'));
 expect(m.setAuth).toHaveBeenCalledWith(null,{id:17,role:'provider'},null);expect(m.supervisionAccess).not.toHaveBeenCalled();w.unmount();
});
it.each([401,403,423])('opens the applicant invitation when staff auth fails with %s, without requesting a login',async status=>{
 m.get.mockImplementation(async url=>{if(url.startsWith('/meeting-calendar/'))return {data:{title:'Interview',interview:true}};throw {response:{status,data:{error:{code:'HIRE_ACTIVATION_REQUIRED'}}}};});
 const w=mountEntry();await vi.waitFor(()=>expect(w.text()).toContain('Applicant interview'));
 expect(w.text()).toContain('s'.repeat(32));expect(w.findComponent({name:'RouterLink'}).props('to')).toEqual({path:'/login',query:{redirect:m.route.fullPath}});expect(m.setAuth).not.toHaveBeenCalled();
 expect(m.get.mock.calls.some(([url])=>url==='/users/me')).toBe(false);w.unmount();
});
it('keeps assigned interviewers in their staff workspace on the same invitation',async()=>{
 m.get.mockImplementation(async url=>({data:url.startsWith('/meeting-calendar/')?{interview:true}:{isInterviewer:true}}));
 const w=mountEntry();await vi.waitFor(()=>expect(w.text()).toContain('Identified meeting workspace'));expect(w.text()).not.toContain('Applicant interview');w.unmount();
});
it('preserves signed-in host-token entry when the token is not a guest calendar link',async()=>{
 m.get.mockImplementation(async url=>{if(url.startsWith('/meeting-calendar/'))throw {response:{status:404}};return {data:{id:8,role:'provider'}};});
 const w=mountEntry();await vi.waitFor(()=>expect(w.text()).toContain('Identified meeting workspace'));w.unmount();
});

it('preserves the calendar URL when a signed-out interviewer chooses sign in',async()=>{m.route.params={eventId:'c-9-'+ 's'.repeat(43)};const w=mountEntry();await flushPromises();expect(w.findComponent({name:'RouterLink'}).props('to')).toEqual({path:'/login',query:{redirect:m.route.fullPath}});w.unmount();});

it('explains untracked guest attendance and waiting-room admission',async()=>{const w=mountEntry();await flushPromises();expect(w.text()).toContain('Attendance and compensation are not tracked for guests');expect(w.text()).toContain('The host must admit you');expect(w.text()).toContain('not HIPAA protected');w.unmount();});
it('only calls a room open when its waiting room is disabled',async()=>{m.get.mockImplementation(async url=>{if(url==='/users/me')throw {response:{status:401}};return {data:{title:'Team meeting',waitingRoomEnabled:false}};});const w=mountEntry();await flushPromises();expect(w.text()).toContain('This room is open');expect(w.text()).toContain('Join as guest');expect(w.text()).not.toContain('Request to join');w.unmount();});
it('shows shared-link status to guests without implying that copying opened the room',async()=>{m.get.mockImplementation(async url=>{if(url==='/users/me')throw {response:{status:401}};return {data:{title:'Team meeting',guestLinkEnabled:true,waitingRoomEnabled:true}};});const w=mountEntry();await flushPromises();expect(w.text()).toContain('Guest link enabled · Guests wait for admission.');expect(w.text()).not.toContain('This room is open');w.unmount();});
it('does not show a join form for an invalid shared link',async()=>{m.get.mockRejectedValue({response:{status:404,data:{error:{message:'Meeting unavailable'}}}});const w=mountEntry();await flushPromises();expect(w.text()).toContain('Meeting unavailable');expect(w.find('form').exists()).toBe(false);w.unmount();});
it('uses tracked member entry on a shared link without creating an anonymous guest',async()=>{m.get.mockImplementation(async url=>({data:url==='/users/me'?{id:8,role:'provider'}:{guestLinkEnabled:true,title:'Team meeting'}}));m.post.mockResolvedValue({data:{identified:true}});const w=mountEntry();await vi.waitFor(()=>expect(w.text()).toContain('Identified meeting workspace'));expect(m.post).toHaveBeenCalledWith(`/team-meetings/${'s'.repeat(32)}/shared-link-entry`,{},expect.any(Object));expect(m.post.mock.calls.some(([url])=>url.endsWith('/guests'))).toBe(false);w.unmount();});
it('offers untracked guest entry when a signed-in account is not eligible for this meeting',async()=>{m.get.mockImplementation(async url=>({data:url==='/users/me'?{id:8,role:'provider'}:{guestLinkEnabled:true,title:'Team meeting'}}));m.post.mockResolvedValue({data:{identified:false,guestReason:'This account is not eligible for tracked attendance.'}});const w=mountEntry();await flushPromises();expect(w.text()).toContain('This account is not eligible for tracked attendance');expect(w.text()).toContain('Request to join as guest');w.unmount();});
