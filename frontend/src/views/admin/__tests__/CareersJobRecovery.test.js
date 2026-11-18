import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
const state=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),agency:null,route:null}));
vi.mock('../../../services/api',()=>({default:{get:state.get,post:state.post,put:state.put}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:1434,role:'support'}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>state.agency}));
vi.mock('vue-router',()=>({useRoute:()=>state.route,useRouter:()=>({push:vi.fn()})}));
import Careers from '../CareersView.vue';
let wrapper,saved;
beforeEach(()=>{
  vi.clearAllMocks();sessionStorage.clear();saved=[];
  const company={id:463,slug:'juniper-qa',name:'Juniper QA',organization_type:'agency'};
  state.agency=reactive({currentAgency:company,userAgencies:[company],fetchUserAgencies:vi.fn()});
  state.route=reactive({params:{organizationSlug:'juniper-qa'},query:{},meta:{}});
  state.get.mockImplementation(async path=>({data:path==='/hiring/job-descriptions'?[...saved]:path==='/hiring/careers-page'?{careersPage:{}}:[]}));
  state.post.mockImplementation(async(path)=>{
    if(path==='/hiring/job-descriptions'){const job={id:91,title:'Consultant A',isActive:true};saved.push(job);return {data:job};}
    throw {response:{status:403,data:{error:{message:'Synthetic form failure'}}}};
  });
});
afterEach(()=>{wrapper?.unmount();wrapper=null;});
const start=async()=>{wrapper=mount(Careers,{props:{mode:'jobs'},global:{stubs:{RouterLink:true,ContractExpectationsEditor:true,JobApplicationPagePreview:true,JobEvaluationRubricEditor:true,JobInterviewGuideEditor:true,JobDescriptionSectionsEditor:true,JobHirePackagesEditor:true}}});await flushPromises();};
const button=text=>wrapper.findAll('button').find(b=>b.text()===text);
const jobPosts=()=>state.post.mock.calls.filter(c=>c[0]==='/hiring/job-descriptions');
it('keeps a successful job visible and retries only its incomplete form, including after reload',async()=>{
  await start();await wrapper.get('input[placeholder="Job title"]').setValue('Consultant A');
  await button('Create job + application').trigger('click');await flushPromises();
  expect(wrapper.get('.create-panel [role=alert]').text()).toContain('Job #91 is saved');
  expect(wrapper.text()).toContain('Job #91');expect(jobPosts()).toHaveLength(1);
  wrapper.unmount();wrapper=null;await start();expect(button('Finish application for job #91')).toBeDefined();
  state.post.mockResolvedValue({data:{created:false,link:{id:41}}});
  await button('Finish application for job #91').trigger('click');await flushPromises();
  expect(jobPosts()).toHaveLength(1);expect(state.post).toHaveBeenLastCalledWith('/intake-links/from-job/91');
  expect(state.put).not.toHaveBeenCalled();expect(wrapper.get('.create-result').text()).toContain('and its application form are ready');
});
it('shows a validation error beside Create and retains entered data',async()=>{
  await start();state.post.mockRejectedValue({response:{status:400,data:{error:{message:'Choose a valid date'}}}});
  await wrapper.get('input[placeholder="Job title"]').setValue('Consultant A');await button('Create job + application').trigger('click');await flushPromises();
  expect(wrapper.get('.create-panel [role=alert]').text()).toBe('Choose a valid date');expect(wrapper.get('input[placeholder="Job title"]').element.value).toBe('Consultant A');
});
it('does not replay an uncertain job POST on another click or a session resume',async()=>{
  await start();state.post.mockRejectedValue(new Error('connection lost'));
  await wrapper.get('input[placeholder="Job title"]').setValue('Consultant A');await button('Create job + application').trigger('click');await flushPromises();
  expect(wrapper.get('.create-panel [role=alert]').text()).toContain('may already be saved');
  expect(button('Create job + application').attributes('disabled')).toBeDefined();
  window.dispatchEvent(new Event('pt:session-resumed'));await flushPromises();
  expect(jobPosts()).toHaveLength(1);expect(state.get).toHaveBeenCalledWith('/intake-links',{params:{agencyId:463}});
});
it('recovers failed list reads after server-confirmed resume without changing saved jobs',async()=>{
  state.get.mockRejectedValueOnce({response:{status:423,data:{error:{message:'Session locked'}}}});await start();
  expect(wrapper.text()).toContain('Jobs could not be verified');saved.push({id:92,title:'Retained guide job',isActive:true});
  window.dispatchEvent(new Event('pt:session-resumed'));await flushPromises();
  expect(wrapper.text()).toContain('Retained guide job');expect(state.post).not.toHaveBeenCalled();
});
