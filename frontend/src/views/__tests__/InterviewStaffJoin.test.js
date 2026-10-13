import {shallowMount,flushPromises} from '@vue/test-utils';
import {createPinia} from 'pinia';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),replace:vi.fn(),push:vi.fn(),interviewer:true}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{eventId:'shared-interview-token',organizationSlug:'tenant'},fullPath:'/tenant/join/team-meeting/shared-interview-token'}),useRouter:()=>({replace:m.replace,push:m.push})}));
vi.mock('../../services/api',()=>({default:{get:m.get,post:m.post}}));
vi.mock('../../store/auth',()=>({useAuthStore:()=>({isAuthenticated:true,user:{id:8,role:'provider'},setAuth:vi.fn()})}));
vi.mock('../../utils/activityTracker',()=>({suspendInactivityTimeout:vi.fn(),resumeInactivityTimeout:vi.fn()}));
import Join from '../teamMeeting/JoinTeamMeetingView.vue';
let wrapper;
beforeEach(()=>{
 vi.clearAllMocks();m.interviewer=true;m.post.mockResolvedValue({data:{}});
 m.get.mockImplementation(async url=>({data:url.includes('/join-info/')?{orgSlug:'tenant',eventId:9,meetingSubtype:'interview',isInterviewer:m.interviewer,canonicalJoinUrl:m.interviewer?'https://other-tenant.example/join/team-meeting/shared-interview-token':null}:url.endsWith('/video-token')?{eventId:9,token:'staff-token',sessionId:'room',applicationId:'project',meetingSubtype:'interview',isHost:false,isInterviewer:m.interviewer,isGuest:!m.interviewer,identity:m.interviewer?'user-8':'guest-candidate',roomMode:'main'}:{meetingSubtype:'interview'}}));
});
afterEach(()=>wrapper?.unmount());
it('keeps dashboard interviewers on their signed-in origin and opens the workspace without host controls',async()=>{
 wrapper=shallowMount(Join,{global:{plugins:[createPinia()]}});await flushPromises();await flushPromises();
 expect(m.get.mock.calls.some(([url])=>url.endsWith('/video-token'))).toBe(true);
 expect(m.replace).not.toHaveBeenCalled();
 expect(wrapper.findComponent({name:'InterviewLiveWorkspace'}).exists()).toBe(true);
 expect(wrapper.findComponent({name:'SupervisionVideoLobbyPanel'}).exists()).toBe(false);
 expect(wrapper.findComponent({name:'SupervisionVideoRoom'}).exists()).toBe(true);
});
it('never shows interviewer materials to an applicant',async()=>{
 m.interviewer=false;wrapper=shallowMount(Join,{global:{plugins:[createPinia()]}});await flushPromises();await flushPromises();
 expect(wrapper.findComponent({name:'InterviewLiveWorkspace'}).exists()).toBe(false);
 expect(wrapper.findComponent({name:'SupervisionVideoLobbyPanel'}).exists()).toBe(false);
});
