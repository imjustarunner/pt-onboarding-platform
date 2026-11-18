import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:3}})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{}})}));
vi.mock('../InterviewInvitePreview.vue',()=>({default:{template:'<div />'}}));
import Panel from '../CandidateInterviewPanel.vue';
import Preview from '../InterviewInvitePreview.vue';
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
 await wrapper.findAll('button').find(button=>button.text()==='Schedule & send invitations').trigger('click');await flushPromises();
 expect(api.post).toHaveBeenCalledWith('/hiring/interview-hub/interviews',expect.objectContaining({candidateUserId:31,jobQuestionSetId:null,questionSelection:[{setId:null,questionKey:'motivation',fingerprint:'starter'}]}));
});
it('disables invitations after a failed preview while allowing save without sending and cancel',async()=>{
 wrapper=mount(Panel,{props:{candidateUserId:31,agencyId:6,jobDescriptionId:45,jobTitle:'Counselor'},global:{stubs:{RouterLink:true}}});await flushPromises();
 wrapper.findComponent(Preview).vm.$emit('availability',false);await flushPromises();
 const submit=()=>wrapper.findAll('button').find(button=>button.text()==='Schedule & send invitations');
 expect(submit().attributes('disabled')).toBeDefined();
 await wrapper.findAll('input[type=checkbox]').at(-1).setValue(false);
 expect(wrapper.findAll('button').find(button=>button.text()==='Save without sending').attributes('disabled')).toBeUndefined();
 await wrapper.findAll('button').find(button=>button.text()==='Cancel').trigger('click');expect(wrapper.find('.cip-schedule').exists()).toBe(false);expect(api.post).not.toHaveBeenCalled();
});
