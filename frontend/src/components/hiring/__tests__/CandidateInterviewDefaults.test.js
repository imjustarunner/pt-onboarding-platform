import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:3}})}));
vi.mock('vue-router',()=>({useRoute:()=>({params:{}})}));
vi.mock('../InterviewInvitePreview.vue',()=>({default:{template:'<div />'}}));
import Panel from '../CandidateInterviewPanel.vue';
let wrapper;
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async url=>({data:url.includes('job-question-sets')?{data:[{id:9,job_description_id:null,title:'Agency set'},{id:11,job_description_id:45,title:'Counselor guide',questions_json:[]}]}:url.includes('time-capsules')?{capsules:[]}:{data:[]}}));});
afterEach(()=>wrapper?.unmount());
it('selects the applied job guide and exposes the inline editor in the interview tab',async()=>{
 wrapper=mount(Panel,{props:{candidateUserId:31,agencyId:6,jobDescriptionId:45,jobTitle:'Counselor'},global:{stubs:{RouterLink:true}}});await flushPromises();
 expect(wrapper.get('#cip-questions').element.value).toBe('11');expect(wrapper.text()).toContain('Edit job questions & ratings');
 expect(api.get).toHaveBeenCalledWith('/hiring/interview-hub/job-question-sets',{params:{agencyId:6,jobDescriptionId:45}});
});
