import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
let Week,api;
vi.mock('../../../services/api',()=>({default:{get:vi.fn()}}));
const virtual={format:'VIRTUAL',startAt:'2030-01-09T17:00:00Z',endAt:'2030-01-09T18:00:00Z',frequency:'WEEKLY'};
const office={...virtual,format:'IN_PERSON',buildingId:7,buildingName:'Windchime'};
const summary={timeZone:'America/Denver',onlineScheduling:false,virtual:{status:'accepting'},inPerson:{status:'accepting'},locations:[{id:7,name:'Windchime',address:'123 Example St, Colorado Springs, CO'},{id:8,name:'North Office',address:'200 Example Ave, Denver, CO'}],slots:[virtual,office]};
let wrapper;
beforeEach(async()=>{vi.resetModules();sessionStorage.clear();({default:api}=await import('../../../services/api'));({default:Week}=await import('../PublicProviderAvailabilityWeek.vue'));vi.useFakeTimers();vi.setSystemTime(new Date('2030-01-09T15:00:00Z'));vi.resetAllMocks();api.get.mockImplementation(async(url,{params})=>({data:{...summary,weekStart:params.weekStart}}));});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
async function render(props={}){wrapper=mount(Week,{props:{agencySlug:'itsco',providerId:9,summary,...props}});await flushPromises();return wrapper;}
describe('compact provider availability',()=>{
 it('starts immediately without a full summary, shows progress, and does not refetch when that summary arrives',async()=>{
  let finish;api.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await render({summary:null});
  expect(api.get).toHaveBeenCalledTimes(1);expect(wrapper.get('[role=status]').text()).toContain('Loading current availability');expect(wrapper.find('.week-skeleton').exists()).toBe(true);expect(wrapper.find('.week-empty').exists()).toBe(false);
  await vi.advanceTimersByTimeAsync(8000);expect(wrapper.get('[role=status]').text()).toContain('Still checking this provider’s schedule');
  finish({data:{...summary,weekStart:'2030-01-07',checkedAt:'2030-01-09T15:00:00Z'}});await flushPromises();
  expect(wrapper.find('.week-opening').exists()).toBe(true);expect(wrapper.find('.availability-loading').exists()).toBe(false);expect(wrapper.emitted('loaded')).toHaveLength(1);
  expect(wrapper.get('.week-freshness').text()).toContain('Schedule checked Jan 9, 8:00 AM');
  await wrapper.setProps({summary:{...summary}});await flushPromises();expect(api.get).toHaveBeenCalledTimes(1);
  await wrapper.get('.week-freshness button').trigger('click');await flushPromises();expect(api.get).toHaveBeenCalledTimes(2);
 });
 it('corrects the first week to the returned agency timezone at the Sunday/Monday boundary',async()=>{
  vi.setSystemTime(new Date('2030-01-07T06:30:00Z'));
  api.get.mockImplementation(async(url,{params})=>({data:{...summary,timeZone:'America/New_York',weekStart:params.weekStart}}));
  await render({summary:null});expect(api.get).toHaveBeenCalledTimes(2);
  expect(api.get.mock.calls.map(call=>call[1].params.weekStart)).toEqual(['2029-12-31','2030-01-07']);
  expect(wrapper.emitted('loaded')).toHaveLength(1);expect(wrapper.emitted('loaded')[0][0].weekStart).toBe('2030-01-07');expect(wrapper.get('.week-zone').text()).toBe('America/New_York');
 });
 it('ignores a previous provider’s pending response',async()=>{
  let finish;api.get.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));await render({summary:null});
  await wrapper.setProps({providerId:10});await flushPromises();
  finish({data:{...summary,weekStart:'2030-01-07',slots:[]}});await flushPromises();expect(wrapper.find('.week-opening').exists()).toBe(true);expect(wrapper.emitted('loaded')).toHaveLength(1);
 });

 it('shows five days, grays past days and puts both meeting options on the same time',async()=>{
  await render();expect(wrapper.findAll('.week-day')).toHaveLength(5);expect(wrapper.findAll('.week-day-past')).toHaveLength(2);expect(wrapper.get('.week-day-today h3').text()).toContain('Today');
  const opening=wrapper.get('.week-opening');expect(opening.text()).toContain('10:00 AM');expect(opening.findAll('button')).toHaveLength(2);
  expect(opening.get('.week-office').attributes('aria-label')).toContain('Windchime, 123 Example St');expect(wrapper.get('.week-key').text()).toContain('200 Example Ave, Denver, CO');
  expect(wrapper.get('.week-office-address').attributes('href')).toContain('123%20Example%20St');expect(wrapper.get('button[aria-label="Previous week"]').element.disabled).toBe(true);
  await opening.get('.week-office').trigger('click');expect(wrapper.emitted('select')[0][0]).toMatchObject({slot:office,schedule:{weekStart:'2030-01-07'}});
  await opening.get('.week-virtual').trigger('click');expect(wrapper.emitted('select')[1][0].slot).toEqual(virtual);
 });
 it('adds weekends for a provider with weekend openings or published typical weekend hours',async()=>{
  const saturday={...virtual,startAt:'2030-01-12T17:00:00Z',endAt:'2030-01-12T18:00:00Z'};
  await render({summary:{...summary,slots:[saturday]}});expect(wrapper.findAll('.week-day')).toHaveLength(7);
  await wrapper.setProps({summary:{...summary,slots:[],typicalAvailability:['Saturday mornings']}});await flushPromises();expect(wrapper.findAll('.week-day')).toHaveLength(7);
 });
 it('loads the requested week beyond the initial summary and returns to this week',async()=>{
  await render();for(let i=0;i<6;i++){await wrapper.get('button[aria-label="Next week"]').trigger('click');await flushPromises();}
  expect(api.get).toHaveBeenLastCalledWith('/public/agency-services/itsco/providers/9/schedule-summary',expect.objectContaining({params:{serviceType:'counseling',weekStart:'2030-02-18'}}));
  expect(wrapper.get('.week-title').text()).toContain('Feb 18');await wrapper.findAll('.week-toolbar nav button')[1].trigger('click');await flushPromises();expect(wrapper.get('.week-title').text()).toContain('This week’s availability');
 });
 it('does not show a stale week when responses arrive out of order',async()=>{
  await render();let oldResult;api.get.mockImplementationOnce(()=>new Promise(resolve=>{oldResult=resolve;}));
  await wrapper.get('button[aria-label="Next week"]').trigger('click');await wrapper.get('button[aria-label="Next week"]').trigger('click');await flushPromises();
  oldResult({data:{...summary,weekStart:'2030-01-14',slots:[{...virtual,startAt:'2030-01-15T17:00:00Z',endAt:'2030-01-15T18:00:00Z'}]}});await flushPromises();
  expect(wrapper.get('.week-title').text()).toContain('Jan 21');expect(wrapper.find('.week-opening').exists()).toBe(false);
 });
 it('keeps virtual choices visible when a different office is selected',async()=>{
  await render({officeId:8});expect(wrapper.findAll('.week-opening button')).toHaveLength(1);expect(wrapper.get('.week-opening button').attributes('aria-label')).toContain('Virtual');
  await wrapper.get('.week-filter button').trigger('click');expect(wrapper.emitted('show-all-offices')).toHaveLength(1);
 });
 it('offers expansion for busy days and never hides openings permanently',async()=>{
  const slots=Array.from({length:6},(_,i)=>({...virtual,startAt:`2030-01-09T${16+i}:00:00Z`,endAt:`2030-01-09T${17+i}:00:00Z`}));
  api.get.mockImplementation(async(url,{params})=>({data:{...summary,weekStart:params.weekStart,slots}}));await render();expect(wrapper.findAll('.week-opening')).toHaveLength(3);
  await wrapper.get('.week-more').trigger('click');expect(wrapper.findAll('.week-opening')).toHaveLength(6);await wrapper.get('.week-less').trigger('click');expect(wrapper.findAll('.week-opening')).toHaveLength(3);
 });
 it('distinguishes a failed request from an empty week and supports retry',async()=>{
  api.get.mockRejectedValueOnce(new Error('Calendar temporarily unavailable'));await render();expect(wrapper.get('[role=alert]').text()).toContain('Calendar temporarily unavailable');expect(wrapper.find('.week-empty').exists()).toBe(false);
  await wrapper.get('[role=alert] button').trigger('click');await flushPromises();expect(wrapper.find('[role=alert]').exists()).toBe(false);expect(wrapper.find('.week-opening').exists()).toBe(true);
 });
 it('hides closed-format choices even if a response contains stale slots',async()=>{
  api.get.mockImplementation(async(url,{params})=>({data:{...summary,weekStart:params.weekStart,inPerson:{status:'waitlist'}}}));await render();expect(wrapper.find('.week-opening .week-office').exists()).toBe(false);expect(wrapper.find('.week-opening .week-virtual').exists()).toBe(true);
 });
});
