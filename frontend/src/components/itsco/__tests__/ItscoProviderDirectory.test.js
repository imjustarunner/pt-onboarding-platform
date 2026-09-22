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
 const router=createRouter({history:createMemoryHistory(),routes:[{path:'/p/itsco/:section?/:providerSlug?',component:Directory},{path:'/itsco/provider/:id',component:{template:'<div/>'}}]});
 await router.push(url);await router.isReady();
 const wrapper=mount(Directory,{props:{providers,agencyId:1,...extraProps},global:{plugins:[router]}});await flushPromises();return {wrapper,router};
}
describe('provider discovery',()=>{
 it('defaults to unique-visitor popularity, retains inquiry and gates booking',async()=>{const {wrapper}=await render();const cards=wrapper.findAll('.its-provider-card');expect(cards[0].text()).toContain('Zeta Person');expect(cards[0].text()).toContain('Book now');expect(cards[0].text()).toContain('Inquire with our team');expect(cards[1].text()).not.toContain('Book now');expect(cards[0].find('a').attributes('href')).toContain('/providers/zeta-person-2');wrapper.unmount();});
 it('collapses filters, orders ages, and names Provider Status',async()=>{const {wrapper}=await render();expect(wrapper.find('#provider-search-filters').isVisible()).toBe(false);await wrapper.find('.its-filter-toggle').trigger('click');const labels=wrapper.findAll('.its-provider-filters label');expect(labels.some(l=>l.text().startsWith('Provider Status'))).toBe(true);expect(labels[0].findAll('option').map(o=>o.text())).toEqual(['All ages','Toddler (0–5)','Children (6–10)','Teen (14–18)','Adults (18+)']);wrapper.unmount();});
 it('applies homepage care, city and payment filters and handles friendly or legacy links',async()=>{const {wrapper,router}=await render('/p/itsco/providers?care=Families&city=Colorado%20Springs,%20CO&insurance=self-pay');expect(wrapper.findAll('.its-provider-card')).toHaveLength(2);await router.push('/p/itsco/providers/zeta-person-2');await flushPromises();expect(wrapper.find('.its-profile-top').text()).toContain('Zeta Person');await router.push('/p/itsco/providers?provider=1');await flushPromises();expect(wrapper.find('.its-profile-top').text()).toContain('Alpha Person');wrapper.unmount();});
 it('requires a specific office for in-office searches',async()=>{const {wrapper}=await render('/p/itsco/providers?setting=office');expect(wrapper.findAll('.its-provider-card')).toHaveLength(0);expect(wrapper.text()).toContain('Windchime');wrapper.unmount();});
 it('keeps collective links visible with virtual matches and puts school last',async()=>{
  const {wrapper}=await render('/p/itsco/providers?setting=virtual&state=CO');
  expect(wrapper.findAll('.its-provider-card')).toHaveLength(2);expect(wrapper.find('.its-collective-link a').attributes('href')).toContain('state=CO');
  expect(wrapper.findAll('.its-network-search')).toHaveLength(2);
  expect(wrapper.findAll('.its-provider-filters label').at(-1).text()).toContain('School');
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

});
