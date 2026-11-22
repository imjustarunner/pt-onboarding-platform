import {shallowMount,flushPromises} from '@vue/test-utils';
import {reactive} from 'vue';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const shallow=(component,options={})=>shallowMount(component,{...options,global:{stubs:{RouterLink:true}}});
const m=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),put:vi.fn(),agency:null,route:null}));
vi.mock('../../../services/api',()=>({default:{get:m.get,post:m.post,put:m.put}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:1434,role:'support',agencyId:463}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>m.agency}));
vi.mock('vue-router',()=>({useRoute:()=>m.route,useRouter:()=>({push:vi.fn(),replace:vi.fn()}),onBeforeRouteLeave:vi.fn()}));
import Dashboard from '../HiringDashboardView.vue';
import Candidates from '../HiringCandidatesView.vue';
import Careers from '../CareersView.vue';
import Hub from '../InterviewHubView.vue';
let w;
const juniper={id:463,name:'Juniper Consulting QA',slug:'juniper',organization_type:'agency',feature_flags:{plotlineOnly:true}},maple={id:464,name:'Maple Studio QA',slug:'maple',organization_type:'agency',feature_flags:{plotlineOnly:true}};
beforeEach(()=>{
 vi.clearAllMocks();localStorage.clear();sessionStorage.clear();localStorage.setItem('hiring_selected_agency_v1_1434','463');
 m.agency=reactive({currentAgency:maple,userAgencies:[juniper,maple,{id:2,name:'Clinical company',organization_type:'agency'}],fetchUserAgencies:vi.fn()});
 m.route=reactive({params:{organizationSlug:'maple'},query:{agencyId:'463'},meta:{}});
 m.get.mockImplementation(async path=>({data:path==='/hiring/dashboard'?{}:path==='/hiring/careers-page'?{careersPage:{}}:[]}));
});
afterEach(()=>w?.unmount());
it.each([['dashboard',Dashboard],['applicants',Candidates],['jobs',Careers],['interviews',Hub]])('pins %s to Maple despite a Juniper saved filter or query',async(_,component)=>{
 w=shallow(component,{props:component===Careers?{mode:'jobs'}:{}});await flushPromises();await flushPromises();
 const reads=m.get.mock.calls.filter(([path])=>path.startsWith('/hiring/'));
 expect(reads.length).toBeGreaterThan(0);expect(reads.every(([,options])=>Number(options?.params?.agencyId)===464)).toBe(true);
 expect(w.text()).not.toContain('Clinical company');expect(w.find('select.agency-select').exists()).toBe(false);expect(m.post).not.toHaveBeenCalled();
});
it('clears old results and follows route changes even if the shell or saved selector still names Juniper',async()=>{
 m.agency.currentAgency=juniper;m.route.params.organizationSlug='juniper';m.route.query={};
 const deferred=[];m.get.mockImplementation((_,options)=>Number(options.params.agencyId)===463?new Promise(resolve=>deferred.push(resolve)):Promise.resolve({data:{recentApplicants:[]}}));
 w=shallow(Dashboard);await w.vm.$nextTick();m.route.params.organizationSlug='maple';await flushPromises();
 deferred.forEach(resolve=>resolve({data:{recentApplicants:[{id:1849,firstName:'Private Juniper applicant'}]}}));await flushPromises();
 expect(m.get.mock.calls.some(([,options])=>Number(options.params.agencyId)===464)).toBe(true);expect(w.text()).not.toContain('Private Juniper applicant');
});
it('waits for a named company instead of requesting the previous one during metadata loading',async()=>{
 m.agency.currentAgency=juniper;m.agency.userAgencies=[juniper];
 w=shallow(Dashboard);await flushPromises();expect(m.get).not.toHaveBeenCalled();
 m.agency.userAgencies.push(maple);await flushPromises();expect(m.get.mock.calls.every(([,options])=>Number(options.params.agencyId)===464)).toBe(true);
});

it('retries job loading in the staff candidate form instead of silently offering an empty dropdown',async()=>{
 let fail=true;
 m.get.mockImplementation(async path=>{
  if(path==='/hiring/job-descriptions'){
   if(fail)throw {response:{data:{error:{message:'Jobs temporarily unavailable'}}}};
   return {data:[{id:43,title:'Maple consulting role'}]};
  }
  return {data:[]};
 });
 w=shallow(Candidates);await flushPromises();
 const open=w.findAll('button').find(button=>button.text()==='Add candidate');await open.trigger('click');await flushPromises();
 expect(w.text()).toContain('Jobs temporarily unavailable');
 expect(w.get('select[aria-label="Job posting"]').attributes('disabled')).toBeDefined();
 fail=false;await w.findAll('button').find(button=>button.text()==='Retry loading jobs').trigger('click');await flushPromises();
 expect(w.get('select[aria-label="Job posting"]').text()).toContain('Maple consulting role');
 await w.get('select[aria-label="Job posting"]').setValue('43');
 expect(w.findAll('a').find(link=>link.text()==='Open public application ↗').attributes('href')).toBe('https://plotlinepo.com/careers/maple/jobs/43/apply');
 expect(w.text()).not.toContain('Jobs temporarily unavailable');
 expect(m.post).not.toHaveBeenCalled();
});
