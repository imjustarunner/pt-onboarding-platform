import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
const state=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),agency:null,route:null}));
vi.mock('../../../services/api',()=>({default:{get:state.get,post:state.post,put:state.put}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:1434,role:'support'}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>state.agency}));
vi.mock('vue-router',()=>({useRoute:()=>state.route,useRouter:()=>({push:vi.fn()}),onBeforeRouteLeave:vi.fn()}));
import Careers from '../CareersView.vue';
let wrapper,guides,jobs;
beforeEach(()=>{
 vi.clearAllMocks();sessionStorage.clear();guides=new Map();jobs=[{id:15,agencyId:2,title:'ITSCO Denver',isActive:true},{id:16,agencyId:2,title:'ITSCO Springs',isActive:true},{id:21,agencyId:6,title:'NLU Tutor',isActive:true}];
 const itsco={id:2,name:'ITSCO',slug:'itsco',organization_type:'agency'},nlu={id:6,name:'NLU',slug:'nlu',organization_type:'agency'};
 state.agency=reactive({currentAgency:itsco,userAgencies:[itsco,nlu],fetchUserAgencies:vi.fn()});state.route=reactive({params:{organizationSlug:'itsco'},query:{},meta:{}});
 state.get.mockImplementation(async(path,options)=>{
  if(path==='/hiring/job-descriptions')return {data:jobs.filter(job=>job.agencyId===Number(options.params.agencyId))};
  if(path.endsWith('/guide')){const id=Number(path.split('/').at(-2)),settings=guides.get(id);return {data:{data:{job:{id},questionSet:settings?{id:id+100}:null,questions:settings?.questions || [],criteria:[],criteriaSource:'platform',starterSource:'platform',starterQuestions:[{key:'starter',text:'Starter question'}],questionSets:[]}}};}
  return {data:path==='/hiring/careers-page'?{careersPage:{}}:[]};
 });
 state.put.mockImplementation(async(path,data)=>{
  if(path.startsWith('/hiring/job-descriptions/')){const id=Number(path.split('/').at(-1));guides.set(id,JSON.parse(data.get('interviewGuideJson')));return {data:jobs.find(job=>job.id===id)};}
  throw new Error('Unexpected separate guide write');
 });
});
afterEach(()=>{wrapper?.unmount();wrapper=null;vi.restoreAllMocks();});
async function start(){wrapper=mount(Careers,{props:{mode:'jobs'},global:{stubs:{RouterLink:true,ContractExpectationsEditor:true,JobApplicationPagePreview:true,JobEvaluationRubricEditor:true,JobDescriptionSectionsEditor:true,JobHirePackagesEditor:true}}});await flushPromises();}
async function edit(title){await wrapper.findAll('.job-edit-link').find(button=>button.text()===title).trigger('click');await flushPromises();await wrapper.findAll('.job-guide button').find(button=>button.text()==='Edit job questions & ratings').trigger('click');await flushPromises();}
async function savePosting(){await wrapper.get('.modal-actions button').trigger('click');await flushPromises();}
it('persists questions through the main posting Save across two jobs and a company switch',async()=>{
 await start();
 for(const job of jobs){
  if(job.agencyId===6){await wrapper.get('.agency-select').setValue('6');await flushPromises();}
  await edit(job.title);await wrapper.get('.job-guide textarea').setValue(`Questions for ${job.title}`);await savePosting();
  expect(wrapper.find('.modal').exists()).toBe(false);
  await edit(job.title);expect(wrapper.get('.job-guide textarea').element.value).toBe(`Questions for ${job.title}`);
  await wrapper.findAll('.modal-header button').find(button=>button.text()==='Close').trigger('click');
 }
 expect(state.put).toHaveBeenCalledTimes(3);
 for(const [path,body] of state.put.mock.calls){const id=Number(path.split('/').at(-1));expect(Number(body.get('agencyId'))).toBe(jobs.find(job=>job.id===id).agencyId);expect(guides.get(id).questions).toHaveLength(1);}
});
it('keeps questions in the modal after a failed save and confirms before discarding',async()=>{
 await start();await edit('ITSCO Denver');await wrapper.get('.job-guide textarea').setValue('Keep my edited questions');
 state.put.mockRejectedValueOnce({response:{data:{error:{message:'Synthetic transaction failure'}}}});await savePosting();
 expect(wrapper.get('.modal [role=alert]').text()).toContain('Synthetic transaction failure');expect(wrapper.get('.job-guide textarea').element.value).toBe('Keep my edited questions');
 vi.spyOn(window,'confirm').mockReturnValue(false);await wrapper.get('.modal-header button').trigger('click');expect(wrapper.find('.modal').exists()).toBe(true);
 await savePosting();expect(wrapper.find('.modal').exists()).toBe(false);expect(guides.get(15).questions[0].text).toBe('Keep my edited questions');
});
