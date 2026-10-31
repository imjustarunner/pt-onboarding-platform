import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import EmployeeRelationsView from '../EmployeeRelationsView.vue';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn(),patch:vi.fn(),put:vi.fn()}));
const context=vi.hoisted(()=>({agency:null,route:null}));
vi.mock('../../../services/api',()=>({default:api}));
vi.mock('vue-router',()=>({useRoute:()=>context.route}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{role:'admin'}})}));
vi.mock('../../../store/agency',()=>({useAgencyStore:()=>context.agency}));
vi.mock('../../../utils/orgScopedPath',()=>({resolvePortalSlug:params=>params?.organizationSlug || ''}));
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
beforeEach(()=>{vi.resetAllMocks();context.agency=reactive({currentAgencyId:7,userAgencies:[{id:7,name:'Agency'}]});context.route=reactive({query:{},params:{}});rows=sample.map(r=>({...r}));api.get.mockImplementation(async url=>({data:url.endsWith('/notes')?{notes:[]}:{milestones:rows,definitions,dinners:[],missingStartDates:[],today:'2026-10-29'}}));api.post.mockResolvedValue({data:{}});api.patch.mockResolvedValue({data:{}});});
afterEach(()=>wrapper?.unmount());
async function open({allAwards=true}={}){wrapper=mount(EmployeeRelationsView);await flushPromises();if(allAwards){await wrapper.get('[aria-label="Milestone year"]').setValue('');await wrapper.get('[aria-label="Eligibility"]').setValue('all');}}
describe('Year Awards',()=>{
 it('shows the selected agency logo beside the selector and updates it when switching',async()=>{
  context.agency.userAgencies=[{id:7,name:'Agency',logo_url:'https://example.test/work.svg'},{id:10,name:'Demo Playground',logo_url:'https://example.test/demo.svg'}];
  await open({allAwards:false});expect(wrapper.get('.er-agency-logo').attributes('src')).toBe('https://example.test/work.svg');
  await wrapper.get('[aria-label="Awards agency"]').setValue('10');await flushPromises();
  expect(wrapper.get('.er-agency-logo').attributes('src')).toBe('https://example.test/demo.svg');
  expect(wrapper.get('.er-agency-logo').attributes('alt')).toBe('Demo Playground logo');
  await wrapper.get('.er-agency-logo').trigger('error');expect(wrapper.find('.er-agency-logo').exists()).toBe(false);expect(wrapper.get('.er-agency-initials').text()).toBe('DP');
 });
 it('records an offer and reason from the visible row action without marking the dinner received',async()=>{
  await open({allAwards:false});await findRow('Drew').get('.er-note-action').trigger('click');await flushPromises();
  const form=wrapper.get('.er-offer-form');await form.get('select').setValue('unable_to_attend');await form.get('input[type="date"]').setValue('2026-10-20');await form.get('textarea').setValue('Could not attend due to another commitment.');
  api.post.mockImplementation(async(url,body)=>{if(url.endsWith('/dinner-offers'))Object.assign(rows.find(r=>r.id===4),{dinner_offer_status:body.outcome,dinner_offered_on:body.offeredOn,dinner_offer_note:body.note});return {data:{offer:{id:10}}};});
  await form.trigger('submit');await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/employee-relations/4/dinner-offers',{outcome:'unable_to_attend',offeredOn:'2026-10-20',note:'Could not attend due to another commitment.'});
  expect(api.patch).not.toHaveBeenCalled();expect(findRow('Drew').text()).toContain('Dinner still owed');expect(findRow('Drew').text()).toContain('Unable to attend');expect(rows.find(r=>r.id===4).status).toBe('owed');
 });
 it('separates offered outstanding dinners from dinners with no recorded offer',async()=>{
  rows.push({id:6,first_name:'Offered',last_name:'Person',milestone_years:2,milestone_date:'2026-01-01',status:'owed',active_employee:1,dinner_offer_status:'declined',dinner_offer_note:'Away that week'});
  await open({allAwards:false});await wrapper.get('[aria-label="Award status"]').setValue('offered_owed');expect(findRow('Offered')).toBeDefined();expect(findRow('Drew')).toBeUndefined();
  await wrapper.get('[aria-label="Award status"]').setValue('not_offered_owed');expect(findRow('Offered')).toBeUndefined();expect(findRow('Drew')).toBeDefined();
  await button('All eligible two-year dinners').trigger('click');await wrapper.get('[aria-label="Search awards"]').setValue('Away that week');expect(findRow('Offered')).toBeDefined();
 });
 it('keeps existing gift-owed notification links scoped to all award years',async()=>{
  context.route.query.status='owed';await open({allAwards:false});
  expect(findRow('Alex')).toBeDefined();expect(findRow('Drew')).toBeDefined();
  expect(findRow('Casey')).toBeUndefined();
  await button('All eligible two-year dinners').trigger('click');
  expect(findRow('Alex')).toBeUndefined();expect(findRow('Drew')).toBeDefined();
 });
 it('opens to every reached two-year anniversary, including received and still-owed dinners',async()=>{
  rows=Array.from({length:49},(_,i)=>({id:i+1,first_name:`Employee ${i+1}`,milestone_years:2,milestone_date:i<24?'2026-01-01':'2027-01-01',status:i<10?'gift_sent':i<24?'owed':'upcoming',active_employee:1}));
  await open({allAwards:false});
  expect(wrapper.findAll('tbody tr')).toHaveLength(24);
  expect(wrapper.get('.er-stats').text()).toContain('14 dinner still owed');
  expect(wrapper.get('.er-stats').text()).toContain('10 dinner received');
  expect(findRow('Employee 1').text()).toContain('Dinner received');
  expect(findRow('Employee 24').text()).toContain('Dinner still owed');
  expect(findRow('Employee 25')).toBeUndefined();
 });
 it('clears narrowing filters when opening all eligible dinners and retains former-employee history',async()=>{
  rows.push({id:6,first_name:'Received',last_name:'Dinner',milestone_years:2,milestone_date:'2025-02-01',status:'acknowledged',active_employee:1});
  await open();await button('Two-year dinner follow-up').trigger('click');
  await wrapper.get('[aria-label="Search awards"]').setValue('nobody');
  await wrapper.findAll('.er-controls input[type="date"]')[0].setValue('2026-10-01');
  await button('All eligible two-year dinners').trigger('click');
  expect(wrapper.findAll('tbody tr')).toHaveLength(2);
  expect(findRow('Received').text()).toContain('Dinner received');
  expect(findRow('Drew').text()).toContain('Dinner still owed');
  await wrapper.get('.er-check input').setValue(true);expect(findRow('Former')).toBeDefined();
  expect(api.patch).not.toHaveBeenCalled();
 });
 it('opens the work agency instead of a stale demo selection and shows the agency name',async()=>{
  context.agency.currentAgencyId=10;
  context.agency.userAgencies=[{id:10,name:'Demo Playground',slug:'demo-playground'},{id:7,name:'Work Agency',slug:'work'}];
  await open({allAwards:false});
  expect(api.get).toHaveBeenCalledWith('/employee-relations',{params:{agencyId:'7'}});
  expect(wrapper.get('.er-context').text()).toContain('Work Agency');
  await wrapper.get('[aria-label="Awards agency"]').setValue('10');await flushPromises();
  expect(wrapper.get('.er-warning').text()).toContain('demo awards');
 });
 it('loads when memberships arrive after mount and follows the global agency picker',async()=>{
  context.agency.currentAgencyId=null;context.agency.userAgencies=[];
  await open({allAwards:false});expect(api.get).not.toHaveBeenCalled();
  context.agency.userAgencies=[{id:7,name:'First Agency'},{id:8,name:'Second Agency'}];await flushPromises();
  expect(api.get).toHaveBeenLastCalledWith('/employee-relations',{params:{agencyId:'7'}});
  context.agency.currentAgencyId=8;await flushPromises();
  expect(api.get).toHaveBeenLastCalledWith('/employee-relations',{params:{agencyId:'8'}});
 });
 it('honors an explicit agency link and changes scope on same-page navigation',async()=>{
  context.agency.userAgencies=[{id:7,name:'Work Agency'},{id:10,name:'Demo Playground'}];context.route.query.agencyId='10';
  await open({allAwards:false});expect(wrapper.get('.er-warning').exists()).toBe(true);
  context.agency.currentAgencyId=7;await flushPromises();
  expect(api.get).toHaveBeenLastCalledWith('/employee-relations',{params:{agencyId:'10'}});
  context.route.query.agencyId='7';await flushPromises();
  expect(api.get).toHaveBeenLastCalledWith('/employee-relations',{params:{agencyId:'7'}});
 });
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
