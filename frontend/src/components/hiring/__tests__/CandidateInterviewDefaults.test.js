import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:3}})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{}}),onBeforeRouteLeave:vi.fn()}));
vi.mock('../InterviewInvitePreview.vue',()=>({default:{template:'<div />'}}));
import Panel from '../CandidateInterviewPanel.vue';
import Preview from '../InterviewInvitePreview.vue';
import Guide from '../JobInterviewGuideEditor.vue';
let wrapper;
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async url=>({data:url.endsWith('/guide')?{data:{questionSet:{id:11},questionSets:[{id:11,job_description_id:45,title:'Counselor guide',questions_json:[{key:'q1',text:'Applied job question?',fingerprint:'reviewed'}]}],starterQuestions:[{key:'motivation',text:'Starter question?',fingerprint:'starter'}],starterSource:'platform'}}:url.includes('time-capsules')?{capsules:[]}:{data:[]}}));api.post.mockResolvedValue({data:{data:{interview:{id:5}}}});});
afterEach(()=>wrapper?.unmount());
it('selects the applied job guide and exposes the inline editor in the interview tab',async()=>{
 wrapper=mount(Panel,{props:{candidateUserId:31,agencyId:6,jobDescriptionId:45,jobTitle:'Counselor'},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(wrapper.get('.iqp-switch select').element.value).toBe('11');expect(wrapper.text()).toContain('Edit job questions & ratings');
 expect(api.get).toHaveBeenCalledWith('/hiring/interview-hub/jobs/45/guide',{params:{agencyId:6}});
});
it('submits the individual questions chosen in the candidate scheduler',async()=>{
 wrapper=mount(Panel,{props:{candidateUserId:31,agencyId:6,jobDescriptionId:45,jobTitle:'Counselor'},global:{stubs:{RouterLink:true}}});await flushPromises();
 await wrapper.get('[aria-label="Next question set"]').trigger('click');
 await wrapper.findAll('button').find(button=>button.text()==='Save without sending').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/hiring/interview-hub/interviews',expect.objectContaining({candidateUserId:31,jobQuestionSetId:null,questionSelection:[{setId:null,questionKey:'motivation',fingerprint:'starter'}]}));
});
it('disables invitations after a failed preview while allowing save without sending and cancel',async()=>{
 wrapper=mount(Panel,{props:{candidateUserId:31,agencyId:6,jobDescriptionId:45,jobTitle:'Counselor'},global:{stubs:{RouterLink:true}}});await flushPromises();
 wrapper.findComponent(Preview).vm.$emit('availability',false);await flushPromises();
 await wrapper.findAll('input[type=checkbox]').at(-1).setValue(true);
 const submit=()=>wrapper.findAll('button').find(button=>button.text()==='Schedule & send invitations');
 expect(submit().attributes('disabled')).toBeDefined();
 await wrapper.findAll('input[type=checkbox]').at(-1).setValue(false);
 expect(wrapper.findAll('button').find(button=>button.text()==='Save without sending').attributes('disabled')).toBeUndefined();
 await wrapper.findAll('button').find(button=>button.text()==='Cancel').trigger('click');expect(wrapper.find('.cip-schedule').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();
});
it('requires saving or canceling pending job question edits before scheduling',async()=>{
 wrapper=mount(Panel,{props:{candidateUserId:31,agencyId:6,jobDescriptionId:45},global:{stubs:{RouterLink:true}}});await flushPromises();
 wrapper.findComponent(Guide).vm.$emit('dirty-change',true);await flushPromises();
 expect(wrapper.findAll('button').find(button=>button.text()==='Save without sending').attributes('disabled')).toBeDefined();
 expect(wrapper.text()).toContain('Save or cancel the edited job questions');expect(api.post).not.toHaveBeenCalled();
});
it('shows the scheduled interview snapshot separately from the job’s current default',async()=>{
 const original=api.get.getMockImplementation();
 api.get.mockImplementation(async(url,...args)=>url.endsWith('/interviews')?{data:{data:[{id:50,status:'scheduled',interviewer_user_ids_json:[]}]}}:url.endsWith('/artifacts')?{data:{data:{flow_state_json:{sections:[{key:'job_specific',questions:[{text:'Previously saved interview question'}]}]}}}}:original(url,...args));
 wrapper=mount(Panel,{props:{candidateUserId:31,agencyId:6,jobDescriptionId:45},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(wrapper.get('.cip-saved-questions').text()).toContain('Previously saved interview question');
 expect(wrapper.get('.cip-saved-questions').text()).not.toContain('Applied job question?');
});
it('uses a separate same-origin staff link and keeps the candidate link distinct',async()=>{
 const original=api.get.getMockImplementation();
 api.get.mockImplementation(async(url,...args)=>url.endsWith('/interviews')?{data:{data:[{id:50,status:'scheduled',public_join_url:'https://plotlinepo.com/interview/juniper/video/candidate-token',host_join_url:'https://plotlinepo.com/interview/juniper/video/staff-token',interviewer_user_ids_json:[]}]}}:original(url,...args));
 wrapper=mount(Panel,{props:{candidateUserId:31,agencyId:463},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(wrapper.findAll('a').find(a=>a.text()==='Join as interviewer').attributes('href')).toBe('/interview/juniper/video/staff-token?staff=1');
 expect(wrapper.findAll('a').find(a=>a.attributes('href')?.includes('candidate-token')).text()).toContain('candidate-token');
});
it('defaults to no sends and requires a current successful preview before enabling invitations',async()=>{
 wrapper=mount(Panel,{props:{candidateUserId:31,agencyId:6,jobDescriptionId:45},global:{stubs:{RouterLink:true}}});await flushPromises();
 const checkbox=wrapper.findAll('input[type=checkbox]').at(-1);expect(checkbox.element.checked).toBe(false);
 await checkbox.setValue(true);const submit=()=>wrapper.findAll('button').find(b=>b.text()==='Schedule & send invitations');expect(submit().attributes('disabled')).toBeDefined();
 wrapper.findComponent(Preview).vm.$emit('availability',true);await flushPromises();expect(submit().attributes('disabled')).toBeUndefined();
});
