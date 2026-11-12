import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
const state=vi.hoisted(()=>({route:null}));
vi.mock('vue-router',()=>({useRoute:()=>state.route}));
import Page from '../ProspectPublicPage.vue';
const demo={name:'Champions Counseling',slug:'champions',status:'DEMO',notice:'Demonstration only. All availability and jobs are examples.',logoUrl:'/logo.svg',offices:[{id:1,name:'Dublin',city:'Colorado Springs'}],
  providers:[{id:1,name:'Drew Pierce',credential:'LPC',office:'Dublin',bio:'Website-listed owner.',details:{specialties:['Anxiety']},availability:[{id:9,day_of_week:'Monday',start_time:'09:00:00',end_time:'11:00:00'}]},
    {id:2,name:'Faith Lee',credential:'MFTC',office:'Telehealth',bio:'Relationship counseling.',details:{specialties:['Relationships']},availability:[]}],
  jobs:[{id:1,title:'Licensed Professional Counselor',description_text:'DEMONSTRATION ONLY — NOT AN ACTUAL VACANCY. Example work.',city:'Colorado Springs',state:'CO',isExample:true}],workspaceUrl:'/app/champions',loginUrl:'/champions/login'};
let wrapper;
beforeEach(()=>{state.route=reactive({params:{alias:'championsproviders',surface:'providers'}});vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>structuredClone(demo)}));});
afterEach(()=>{wrapper?.unmount();vi.unstubAllGlobals();});
describe('personalized prospect public pages',()=>{
  it('shows actual provider profiles with an explicit demo notice and sample openings',async()=>{
    wrapper=mount(Page);await flushPromises();expect(fetch).toHaveBeenCalledWith('/api/prospect-demos/public/providers/championsproviders',expect.any(Object));
    expect(wrapper.text()).toContain('Drew Pierce');expect(wrapper.text()).toContain('Faith Lee');expect(wrapper.text()).toContain('sample availability');expect(wrapper.text()).toContain('Monday');
    await wrapper.get('input[type=search]').setValue('Relationships');expect(wrapper.text()).not.toContain('Drew Pierce');expect(wrapper.text()).toContain('Faith Lee');
    expect(document.querySelector('meta[name=robots]').content).toBe('noindex, nofollow');
  });
  it('labels fictional jobs and provides no live application form',async()=>{
    state.route.params={alias:'championscareers',surface:'careers'};wrapper=mount(Page);await flushPromises();
    expect(wrapper.text()).toContain('not actual vacancies');expect(wrapper.text()).toContain('Example role');expect(wrapper.find('form').exists()).toBe(false);
    expect(wrapper.get('.job-card a').attributes('href')).toBe('https://plotlinepo.com/app/champions/admin/careers/jobs');
  });
  it('removes demo notices after activation and uses only configured live application links',async()=>{
    state.route.params={alias:'championscareers',surface:'careers'};
    fetch.mockResolvedValue({ok:true,json:async()=>({...structuredClone(demo),status:'LIVE',notice:null,jobs:[{...demo.jobs[0],description_text:'An actual published role.',isExample:false,applicationUrl:'/intake/actual-public-key'}]})});
    wrapper=mount(Page);await flushPromises();expect(wrapper.find('.preview-notice').exists()).toBe(false);expect(wrapper.text()).not.toContain('Demonstration preview');
    expect(wrapper.get('.job-card a').attributes('href')).toBe('/intake/actual-public-key');expect(document.querySelector('meta[name=robots]').content).toBe('index, follow');
  });
  it('shows a controlled error for unknown aliases',async()=>{
    fetch.mockResolvedValue({ok:false,json:async()=>({error:{message:'Organization page not found.'}})});wrapper=mount(Page);await flushPromises();
    expect(wrapper.get('[role=alert]').text()).toBe('Organization page not found.');expect(wrapper.find('.provider-grid').exists()).toBe(false);
  });
});
