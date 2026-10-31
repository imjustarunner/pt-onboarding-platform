import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import EmployeeRelationsView from '../EmployeeRelationsView.vue';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn(),put:vi.fn()}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('vue-router',()=>({useRoute:()=>({query:{}})}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{role:'admin'}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>({currentAgencyId:7,userAgencies:[{id:7,name:'Agency'}]})}));
const sample=[
 {id:1,first_name:'Alex',last_name:'One',milestone_years:1,milestone_date:'2026-10-29',start_date:'2025-10-29',first_client_date:'2025-11-01',award_start_date:'2025-10-29',status:'owed',active_employee:1},
 {id:2,first_name:'Blair',last_name:'Two',milestone_years:2,milestone_date:'2026-11-01',status:'upcoming',active_employee:1},
 {id:3,first_name:'Casey',last_name:'Three',milestone_years:3,milestone_date:'2026-01-01',status:'gift_sent',gift_notes:'Blue, sent in January',active_employee:1},
 {id:4,first_name:'Drew',last_name:'Four',milestone_years:2,milestone_date:'2026-01-01',status:'owed',active_employee:1},
 {id:5,first_name:'Former',last_name:'Person',milestone_years:2,milestone_date:'2025-01-01',status:'owed',active_employee:0}
];
let wrapper,rows;
const definitions=[1,2,3,4,5,10].map(y=>({milestone_years:y,gift_name:({1:'Cup',2:'Dinner',3:'Pullover'}[y]||'Gift to confirm'),details:''}));
const findRow=name=>wrapper.findAll('tbody tr').find(row=>row.text().includes(name));
const button=text=>wrapper.findAll('button').find(b=>b.text()===text);
beforeEach(()=>{vi.resetAllMocks();rows=sample.map(r=>({...r}));api.get.mockImplementation(async url=>({data:url.endsWith('/notes')?{notes:[]}:{milestones:rows,definitions,dinners:[],missingStartDates:[],today:'2026-10-29'}}));api.post.mockResolvedValue({data:{}});api.patch.mockResolvedValue({data:{}});});
afterEach(()=>wrapper?.unmount());
async function open(){wrapper=mount(EmployeeRelationsView);await flushPromises();}
describe('Year Awards',()=>{
 it('shows separate dates and recorded completion history',async()=>{
  await open();expect(findRow('Alex').text()).toContain('Cup');expect(findRow('Alex').text()).toContain('Oct 29, 2025');expect(findRow('Casey').text()).toContain('Gift sent');expect(findRow('Casey').text()).toContain('Blue, sent in January');expect(findRow('Former')).toBeUndefined();expect(wrapper.text()).toContain('Gift to confirm');
 });
 it('sorts in both directions and filters by gift or notes',async()=>{
  await open();await wrapper.get('[aria-label="Search awards"]').setValue('January');expect(wrapper.findAll('tbody tr')).toHaveLength(1);await wrapper.get('[aria-label="Search awards"]').setValue('pullover');expect(findRow('Casey')).toBeDefined();await wrapper.get('[aria-label="Search awards"]').setValue('');const name=wrapper.findAll('th button')[0];await name.trigger('click');expect(wrapper.findAll('tbody tr')[0].text()).toContain('Alex');await name.trigger('click');expect(wrapper.findAll('tbody tr')[0].text()).toContain('Drew');
 });
 it('saves a per-person note',async()=>{
  await open();await findRow('Alex').get('.er-link').trigger('click');await flushPromises();const dialog=wrapper.get('[role="dialog"]');await dialog.findAll('textarea')[1].setValue('Left in kitchen');api.post.mockResolvedValue({data:{notes:[{id:1,note:'Left in kitchen',first_name:'Rachel',last_name:'Finch',created_at:'2026-10-29'}]}});await dialog.findAll('form')[1].trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/employee-relations/1/notes',{note:'Left in kitchen'});expect(dialog.text()).toContain('Left in kitchen');
 });
 it('saves fulfillment and gift details',async()=>{
  await open();await findRow('Alex').get('.er-link').trigger('click');await flushPromises();await wrapper.get('[aria-label="Person award status"]').setValue('gift_sent');await wrapper.get('[role="dialog"] textarea').setValue('Mailed it');await wrapper.get('[role="dialog"] form').trigger('submit');await flushPromises();expect(api.patch).toHaveBeenCalledWith('/employee-relations/1',{status:'gift_sent',fulfilledOn:'',giftNotes:'Mailed it'});
 });
 it('selects only visible two-year candidates and schedules a dinner without marking attendance',async()=>{
  await open();await wrapper.get('[aria-label="Select all visible dinner candidates"]').setValue(true);expect(wrapper.text()).toContain('2 people selected');await button('Schedule dinner / record invitations').trigger('click');const form=wrapper.get('[aria-labelledby="dinner-title"] form');await form.get('input[type="date"]').setValue('2026-11-03');await form.trigger('submit');await flushPromises();expect(api.post).toHaveBeenCalledWith('/employee-relations/dinners',expect.objectContaining({milestoneIds:expect.arrayContaining([2,4]),scheduledOn:'2026-11-03'}),{params:{agencyId:'7'}});expect(api.patch).not.toHaveBeenCalled();
 });
 it('edits the agency gift catalog',async()=>{
  await open();const form=wrapper.get('.er-gift-grid form');await form.get('input').setValue('Insulated cup');api.put.mockResolvedValue({data:{definitions:definitions.map(g=>g.milestone_years===1?{...g,gift_name:'Insulated cup'}:g)}});await form.trigger('submit');await flushPromises();expect(api.put).toHaveBeenCalledWith('/employee-relations/gifts/1',{giftName:'Insulated cup',details:''},{params:{agencyId:'7'}});expect(findRow('Alex').text()).toContain('Insulated cup');
 });
 it('filters dinner follow-up and shows accurate empty results',async()=>{
  await open();await button('Two-year dinner follow-up').trigger('click');expect(wrapper.findAll('tbody tr')).toHaveLength(1);expect(findRow('Drew')).toBeDefined();await wrapper.get('[aria-label="Search awards"]').setValue('nobody');expect(wrapper.get('tbody').text()).toContain('No awards match these filters.');
 });
 it('compares an anniversary date range without hiding or completing older award history',async()=>{
  await open();const dates=wrapper.findAll('.er-controls input[type="date"]');
  await dates[0].setValue('2026-10-01');await dates[1].setValue('2026-10-31');
  expect(wrapper.findAll('tbody tr')).toHaveLength(1);expect(wrapper.get('tbody').text()).toContain('Alex');
  expect(api.patch).not.toHaveBeenCalled();await button('All eligibility dates').trigger('click');
  expect(wrapper.findAll('tbody tr').length).toBeGreaterThan(1);
 });
});
