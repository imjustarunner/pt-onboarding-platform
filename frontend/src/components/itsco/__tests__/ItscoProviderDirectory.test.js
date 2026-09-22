import {describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createMemoryHistory} from 'vue-router';
import Directory from '../ItscoProviderDirectory.vue';
vi.mock('../../publicServices/PublicProviderProfileEditor.vue',()=>({default:{template:'<div/>'}}));
vi.mock('../../publicServices/PublicProviderAvailabilityPanel.vue',()=>({default:{template:'<div>Schedule</div>'}}));
vi.mock('../ProviderProfileStats.vue',()=>({default:{template:'<div/>'}}));
const base={credential:'LPC',title:'Counselor',photoUrl:'',bio:'A caring provider.',details:{virtualEnabled:true},specialties:['Anxiety'],ageGroups:['Adults (18+)','Toddler (0–5)','Teen (14–18)','Children (6–10)'],populations:['Individuals','Families'],modalities:[],insurances:[{name:'Aetna'}],schools:[],officeLocations:[{id:1,name:'Windchime',city:'Colorado Springs',state:'CO'}],office:true,acceptingNewClients:true,selfPayAvailable:true};
const providers=[{...base,id:1,displayName:'Alpha Person',popularityRank:2,onlineScheduling:false},{...base,id:2,displayName:'Zeta Person',popularityRank:0,onlineScheduling:true}];
async function render(url='/p/itsco/providers',extraProps={}){
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/p/itsco/:section?/:providerSlug?',component:Directory},{path:'/itsco/provider/:id',component:{template:'<div/>'}},{path:'/itsco/school-referral',component:{template:'<div/>'}}]});
 await router.push(url);await router.isReady();
 const wrapper=mount(Directory,{props:{providers,agencyId:1,...extraProps},global:{plugins:[router]}});await flushPromises();return {wrapper,router};
}
describe('provider discovery',()=>{
 it('defaults to unique-visitor popularity, retains inquiry and gates booking',async()=>{const {wrapper}=await render();const cards=wrapper.findAll('.its-provider-card');expect(cards[0].text()).toContain('Zeta Person');expect(cards[0].text()).toContain('Book now');expect(cards[0].text()).toContain('Inquire with our team');expect(cards[1].text()).not.toContain('Book now');expect(cards[0].find('a').attributes('href')).toContain('/providers/zeta-person-2');wrapper.unmount();});
 it('collapses filters, orders ages, and names Provider Status',async()=>{const {wrapper}=await render();expect(wrapper.find('#provider-search-filters').isVisible()).toBe(false);await wrapper.find('.its-filter-toggle').trigger('click');const labels=wrapper.findAll('.its-provider-filters label');expect(labels.some(l=>l.text().startsWith('Provider Status'))).toBe(true);expect(labels[0].findAll('option').map(o=>o.text())).toEqual(['All ages','Toddler (0–5)','Children (6–10)','Teen (14–18)','Adults (18+)']);wrapper.unmount();});
 it('applies homepage care, city and payment filters and handles friendly or legacy links',async()=>{const {wrapper,router}=await render('/p/itsco/providers?care=Families&city=Colorado%20Springs,%20CO&insurance=self-pay');expect(wrapper.findAll('.its-provider-card')).toHaveLength(2);await router.push('/p/itsco/providers/zeta-person-2');await flushPromises();expect(wrapper.find('.its-profile-top').text()).toContain('Zeta Person');await router.push('/p/itsco/providers?provider=1');await flushPromises();expect(wrapper.find('.its-profile-top').text()).toContain('Alpha Person');wrapper.unmount();});
 it('requires a specific office for in-office searches',async()=>{const {wrapper}=await render('/p/itsco/providers?setting=office');expect(wrapper.findAll('.its-provider-card')).toHaveLength(0);expect(wrapper.text()).toContain('Windchime');wrapper.unmount();});
 it('offers a single helpful network invitation while keeping school in its own mode',async()=>{
  const {wrapper}=await render('/p/itsco/providers?setting=virtual&state=CO');
  expect(wrapper.findAll('.its-provider-card')).toHaveLength(2);expect(wrapper.find('.its-collective-link a').attributes('href')).toContain('state=CO');
  expect(wrapper.findAll('.its-network-search')).toHaveLength(1);expect(wrapper.find('.its-network-search').text()).toContain('Haven’t found the right fit?');
  expect(wrapper.findAll('.its-provider-filters label').some(l=>l.text().startsWith('School'))).toBe(false);
  expect(wrapper.find('.its-format-icons svg').exists()).toBe(true);wrapper.unmount();
 });
 it('matches times, preserves preferences in the network link, and carries provider into inquiry',async()=>{
  const slots=[{startAt:'2030-01-07T23:00:00Z',programType:'VIRTUAL'}];
  const {wrapper}=await render('/p/itsco/providers?setting=virtual&day=Mon&timeFrom=16:00',{availability:{2:{virtual:{slots,nextAvailableAt:slots[0].startAt,hasPublishedOpenings:true}}}});
  expect(wrapper.findAll('.its-provider-card')).toHaveLength(1);expect(wrapper.find('.its-provider-card h3').text()).toContain('Zeta');
  expect(wrapper.find('.its-collective-link a').attributes('href')).toContain('timeFrom=16%3A00');
  const link=wrapper.findAll('.its-card-actions a').find(a=>a.text()==='Inquire with our team');expect(link.attributes('href')).toContain('provider=2');expect(link.attributes('href')).toContain('category=provider');wrapper.unmount();
 });
 it('searches all approaches and shows the matching term even beyond default specialty tags',async()=>{
  const {wrapper}=await render('/p/itsco/providers?search=EMDR',{providers:[{...providers[0],modalities:['EMDR']}]});
  expect(wrapper.findAll('.its-provider-card')).toHaveLength(1);expect(wrapper.find('.its-tags').text()).toContain('EMDR');wrapper.unmount();
 });

 it('excludes school capacity from public openings and status, while retaining school details',async()=>{
  const school={id:44,name:'Example School',hasOpenings:true,intakePublicKey:'school-intake'};
  const officeWaitlist={...providers[0],schools:[school],schoolOpenings:true,details:{officeAvailability:'waitlist',virtualAvailability:'unavailable'}};
  const schoolOnly={...providers[1],displayName:'School Only',office:false,officeLocations:[],schools:[school],schoolOpenings:true,details:{virtualEnabled:false}};
  const {wrapper}=await render('/p/itsco/providers',{providers:[officeWaitlist,schoolOnly],availability:{1:{hasPublishedOpenings:true,school:{hasPublishedOpenings:true}}}});
  const groups=wrapper.findAll('.its-opening-group');expect(groups[0].findAll('.its-provider-card')).toHaveLength(0);
  expect(groups[1].findAll('.its-provider-card')).toHaveLength(1);expect(groups[1].find('.its-status').text()).toBe('Waitlist');
  expect(wrapper.text()).not.toContain('School openings available');expect(wrapper.text()).not.toContain('School Only');expect(wrapper.text()).toContain('Example School');wrapper.unmount();
 });
 it('keeps office and virtual openings in All and follows ancillary school links',async()=>{
  const school={id:44,name:'Example Elementary',intakePublicKey:'school-intake'};
  const {wrapper,router}=await render('/p/itsco/providers',{schools:[school],providers:[{...providers[0],schools:[school],schoolOpenings:true}],availability:{1:{virtual:{hasPublishedOpenings:true,nextAvailableAt:'2030-01-07T23:00:00Z'}}}});
  expect(wrapper.findAll('.its-opening-group')[0].findAll('.its-provider-card')).toHaveLength(1);
  await wrapper.find('.its-profile-schools button').trigger('click');await flushPromises();
  expect(router.currentRoute.value.query.school).toBe('44');expect(wrapper.find('.school-details').text()).toContain('Example Elementary');
  expect(wrapper.find('.its-network-search a').attributes('href')).not.toContain('school=44');wrapper.unmount();
 });
 it('requires a school selection and offers school enrollment without booking buttons',async()=>{
  const schools=[{id:44,name:'Example Elementary',intakePublicKey:'school-intake'},{id:45,name:'Other School'}];
  const {wrapper,router}=await render('/p/itsco/providers?setting=school',{schools,providers:[{...providers[0],schools:[schools[0]],schoolOpenings:true}]});
  expect(wrapper.find('.school-team').exists()).toBe(false);expect(wrapper.text()).not.toContain('Providers with openings');
  await wrapper.find('.school-search input').setValue('Example');expect(wrapper.findAll('.school-options button')).toHaveLength(1);
  await wrapper.find('.school-options button').trigger('click');await flushPromises();
  expect(router.currentRoute.value.query.school).toBe('44');expect(wrapper.find('.school-team').text()).toContain('Alpha Person');
  expect(wrapper.find('.school-details>.its-button').attributes('href')).toContain('/intake/school-intake');
  expect(wrapper.text()).not.toContain('Book now');expect(wrapper.text()).not.toContain('Next opening');
  await wrapper.findAll('.its-provider-modes button')[0].trigger('click');await flushPromises();
  expect(wrapper.find('.school-search').exists()).toBe(false);expect(router.currentRoute.value.query.school).toBeUndefined();wrapper.unmount();
 });
 it('opens existing school links in the enrollment view and handles missing enrollment links',async()=>{
  const schools=[{id:45,name:'Other School'}];
  const {wrapper}=await render('/p/itsco/providers?school=45',{schools});
  expect(wrapper.find('.school-details').text()).toContain('Other School');
  expect(wrapper.find('.school-details>.its-button').attributes('href')).toBe('/itsco/school-referral');wrapper.unmount();
 });

});
