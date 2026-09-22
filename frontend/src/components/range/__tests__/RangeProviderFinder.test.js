import {describe,it,expect,vi,beforeEach} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import {createRouter,createMemoryHistory} from 'vue-router';
import Finder from '../RangeProviderFinder.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const provider={id:9,agencyId:1,agencySlug:'itsco',agencyName:'ITSCO',service:'counseling',name:'Alex Provider',title:'Counselor',specialties:['Anxiety'],populations:['Individuals'],subjects:[],ages:['Adults (18+)'],insurances:['Aetna'],gender:'Male',languages:['English'],accepting:true,inPerson:true,virtual:true,schools:[],locations:[{id:7,name:'Windchime',city:'Colorado Springs',state:'CO'}],onlineScheduling:false};
const slot={startAt:'2099-01-01T17:00:00Z',endAt:'2099-01-01T18:00:00Z',format:'IN_PERSON',buildingId:7};
let schedule;
beforeEach(()=>{vi.resetAllMocks();schedule={slots:[slot],inPerson:{status:'accepting'},virtual:{status:'accepting'}};api.get.mockImplementation(async url=>({data:url.endsWith('/providers')?{providers:[provider,{...provider,agencyId:2,agencySlug:'nlu',agencyName:'Next Level Up',service:'tutoring',onlineScheduling:true}]}:schedule}));});
async function render(query=''){const router=createRouter({history:createMemoryHistory(),routes:[{path:'/p/range/:section?',component:Finder}]});await router.push('/p/range/providers'+query);await router.isReady();const w=mount(Finder,{global:{plugins:[router]}});await flushPromises();return {w,router};}
describe('network discovery',()=>{
 it('restores filters from ITSCO and shows published times even when online booking is disabled',async()=>{
 const{w}=await render('?gender=Male&setting=office&city=Colorado+Springs,+CO&age=Adults+(18%2B)&specialty=Anxiety&insurance=Aetna&service=counseling&openings=yes');
 expect(w.findAll('.range-provider-card')).toHaveLength(1);expect(w.find('.range-tenant-brand').text()).toContain('ITSCO');expect(w.text()).toContain('2099');expect(w.text()).not.toContain('Book now');
 await w.findAll('button').find(b=>b.text().includes('More filters')).trigger('click');expect(w.findAll('select').find(s=>s.element.value==='Male')).toBeTruthy();w.unmount();
 });
 it('keeps one provider’s agency-specific services separately branded and filters editable',async()=>{
 const{w,router}=await render();expect(w.findAll('.range-provider-card')).toHaveLength(2);expect(w.findAll('.range-tenant-brand').map(e=>e.text()).join(' ')).toContain('Next Level Up');
 const service=w.findAll('select').find(s=>s.findAll('option').some(o=>o.attributes('value')==='tutoring'));await service.setValue('tutoring');await flushPromises();expect(w.findAll('.range-provider-card')).toHaveLength(1);expect(router.currentRoute.value.query.service).toBe('tutoring');w.unmount();
 });
 it('does not treat failed calendar requests as confirmed lack of availability',async()=>{
 api.get.mockImplementation(async url=>{if(url.endsWith('/providers'))return {data:{providers:[provider]}};throw Error('offline');});
 const{w}=await render('?openings=no');expect(w.findAll('.range-provider-card')).toHaveLength(0);expect(w.text()).toContain('could not be checked');w.unmount();
 });
 it('applies time filters from ITSCO and lets visitors clear them',async()=>{
  schedule={...schedule,slots:[{...slot,startAt:'2030-01-07T23:00:00Z'}]};
  const {w,router}=await render('?day=weekdays&timeFrom=16:00&openings=yes');expect(w.findAll('.range-provider-card')).toHaveLength(2);
  await router.push('/p/range/providers?day=weekends&timeFrom=16:00&openings=yes');await flushPromises();expect(w.findAll('.range-provider-card')).toHaveLength(0);w.unmount();
 });

 it('refreshes the calendar when a visitor edits desired times in the filter controls',async()=>{
  schedule={...schedule,slots:[{...slot,startAt:'2030-01-07T23:00:00Z'}]};
  const {w}=await render('?day=weekends&timeFrom=16:00&openings=yes');expect(w.findAll('.range-provider-card')).toHaveLength(0);
  await w.findAll('button').find(b=>b.text().includes('More filters')).trigger('click');
  await w.findAll('label').find(l=>l.text().startsWith('Preferred day')).find('select').setValue('weekdays');await flushPromises();
  expect(w.findAll('.range-provider-card')).toHaveLength(2);expect(api.get.mock.calls.at(-1)[1].params.day).toBe('weekdays');w.unmount();
 });

});
