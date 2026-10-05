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
beforeEach(()=>{vi.clearAllMocks();m.route.params={eventId:'s'.repeat(32)};m.teamAccess.mockReturnValue(null);m.supervisionAccess.mockReturnValue(null);m.get.mockImplementation(async url=>{if(url==='/users/me')throw {response:{status:401}};return {data:{title:'Team meeting',interview:false}};});});
afterEach(()=>vi.useRealTimers());
const mountEntry=()=>mount(Entry,{global:{stubs:{RouterLink:{name:'RouterLink',props:['to'],template:'<a><slot /></a>'},VideoSessionRoom:true}}});
it('keeps an unsigned calendar visitor a guest even with a cached personal invitation',async()=>{m.teamAccess.mockReturnValue({token:'previous-invite'});const w=mountEntry();await flushPromises();expect(w.text()).toContain('Request to join as guest');expect(m.teamAccess).not.toHaveBeenCalled();expect(m.setAuth).not.toHaveBeenCalled();w.unmount();});
it('uses the signed-in account for a calendar link',async()=>{m.get.mockResolvedValue({data:{id:8,role:'provider'}});const w=mountEntry();await flushPromises();await flushPromises();expect(m.setAuth).toHaveBeenCalledWith(null,{id:8,role:'provider'},null);await vi.waitFor(()=>expect(w.text()).toContain('Identified meeting workspace'));w.unmount();});
it('uses a scoped email grant without creating an app login',async()=>{m.route.params={eventId:'9'};m.teamAccess.mockReturnValue({token:'personal-scope'});const w=mountEntry();await flushPromises();await flushPromises();await vi.waitFor(()=>expect(w.text()).toContain('Identified meeting workspace'));expect(m.get).not.toHaveBeenCalled();expect(m.setAuth).not.toHaveBeenCalled();w.unmount();});
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
