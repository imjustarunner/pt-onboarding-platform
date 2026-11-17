import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import Days from '../ProviderSchoolDays.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../../store/auth', () => ({ useAuthStore: () => ({ user: { id: 99, role: 'admin' } }) }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'itsco' } }) }));
const weekdays = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
const roster = [
  { id: 1, first_name: 'Alex', last_name: 'Assigned', title: 'Counselor', service_focus:'School-Based Counseling; Office-Based Counseling', schoolAssignments: [{schoolOrganizationId:10,schoolName:'Cedar',days:['Monday']}], schoolWeekdays: { eligible:true, days:weekdays.map((day,i)=>({day,status:i===0?'assigned':i===1?'unavailable':'available'})) } },
  { id: 2, first_name: 'Blair', last_name: 'NoSchools', service_focus:'School-Based Counseling', schoolAssignments: [], schoolWeekdays: {eligible:true, days:weekdays.map(day=>({day,status:'available'}))} },
  { id: 3, first_name: 'Casey', last_name: 'NoFocus', schoolAssignments: [{schoolOrganizationId:11,schoolName:'Maple',days:['Monday']}], schoolWeekdays: {eligible:false,days:[]} },
  { id: 4, first_name: 'Drew', last_name: 'Demo', is_demo:1, service_focus:'School-Based Counseling', schoolAssignments:[], schoolWeekdays:{eligible:true,days:weekdays.map(day=>({day,status:'available'}))} }
];
const routerStub = { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' };
const progress = { counts: {pending:1,opened:0,completed:1}, providers: [{providerId:1,name:'Alex Assigned',status:'pending',invitationStatus:'sent',invitationSentAt:'2026-11-11T17:38:34Z'},{providerId:2,name:'Blair NoSchools',status:'completed',accounted:5,invitationStatus:'not_sent'}] };
let wrappers=[];
async function render(props={}) { const wrapper=mount(Days,{props:{agencyId:2,...props},global:{stubs:{RouterLink:routerStub,SchoolProviderFocusEditor:true}}});wrappers.push(wrapper);await flushPromises();return wrapper; }
const click=(wrapper,text)=>wrapper.findAll('button').find(button=>button.text()===text).trigger('click');
const defaultGet=path=>Promise.resolve({data:structuredClone(path.endsWith('/progress')?progress:roster)});
beforeEach(()=>{vi.resetAllMocks();api.get.mockImplementation(defaultGet);});
afterEach(()=>{wrappers.forEach(w=>w.unmount());wrappers=[];vi.useRealTimers();});
it('shows only non-demo school-focus providers, including those with no assignments',async()=>{
 const w=await render();expect(w.findAll('tbody tr')).toHaveLength(2);expect(w.text()).toContain('Blair NoSchools');expect(w.find('tbody').text()).not.toContain('Casey');expect(w.find('tbody').text()).not.toContain('Demo');expect(w.findAll('[role="tab"]')).toHaveLength(5);
 await w.find('input').setValue('Casey');expect(w.findAll('tbody tr')).toHaveLength(0);
});
it('filters using saved unavailability and reservations rather than treating every weekday gap as available',async()=>{
 const w=await render();expect(w.findAll('td.available')).toHaveLength(8);expect(w.findAll('td.unavailable')).toHaveLength(1);expect(w.findAll('td.assigned')).toHaveLength(1);
 await w.findAll('[role="tab"]')[1].trigger('click');expect(w.findAll('tbody tr')).toHaveLength(1);expect(w.find('tbody').text()).toContain('Blair');
});
it('requests one provider or all eligible providers and reports failed recipients',async()=>{
 api.post.mockResolvedValue({data:{requested:[1],failed:[2],skipped:[]}});const w=await render();await click(w,'Request update');await flushPromises();expect(api.post).toHaveBeenCalledWith('/availability/admin/school-weekdays/request',{agencyId:2,providerId:1},expect.anything());expect(w.text()).toContain('1 failed');
 await click(w,'Request update from all school providers');await flushPromises();expect(api.post).toHaveBeenLastCalledWith('/availability/admin/school-weekdays/request',{agencyId:2},expect.anything());
});
it('opens focus editing from the directory and keeps non-focus providers available to that editor',async()=>{
 const w=await render();await click(w,'Edit service focuses');const editor=w.findComponent({name:'SchoolProviderFocusEditor'});expect(editor.exists()).toBe(true);expect(editor.props('providers')).toHaveLength(4);
});
it('keeps messages and calendar links agency-scoped',async()=>{
 const w=await render();expect(JSON.parse(w.find('[aria-label="Message Alex Assigned"]').attributes('data-to')).path).toBe('/itsco/messages');expect(JSON.parse(w.find('[aria-label="View schedule for Alex Assigned"]').attributes('data-to')).query).toMatchObject({agencyId:'2',scheduleViewAs:'1'});
});
it('shows failed loads with retry instead of inventing availability',async()=>{
 let offline=true;api.get.mockImplementation(path=>{if(path.endsWith('/providers')&&offline){offline=false;return Promise.reject(new Error('offline'));}return defaultGet(path);});const w=await render();expect(w.find('table').exists()).toBe(false);await click(w,'Try again');await flushPromises();expect(w.findAll('tbody tr')).toHaveLength(2);
});
it('rejects stale responses when switching agencies',async()=>{
 const w=await render();let stale;api.get.mockImplementation((path,options)=>{if(path.endsWith('/progress'))return defaultGet(path);if(options.params.agencyId===3)return new Promise(resolve=>{stale=resolve;});return Promise.resolve({data:[{...roster[0],first_name:'Current'}]});});await w.setProps({agencyId:3});await w.setProps({agencyId:4});await flushPromises();stale({data:roster});await flushPromises();expect(w.find('tbody').text()).toContain('Current');
});
it('shows a sent timestamp and request receipt beside the provider even when already pending',async()=>{
 api.post.mockResolvedValue({data:{requested:[],skipped:[1],failed:[],outcomes:[{providerId:1,outcome:'skipped',reason:'already_pending'}]}});
 const w=await render();expect(w.text()).toContain('1 complete · 0 opened and unfinished · 1 pending');
 await w.find('[aria-label="Request update from Alex Assigned"]').trigger('click');await flushPromises();
 const row=w.findAll('tbody tr')[0];expect(row.text()).toContain('An update is already pending. Another email was not sent.');expect(row.text()).toContain('Email sent Nov 11');expect(row.text()).toContain('Mountain');
 expect(w.text()).not.toContain('update requests sent');expect(w.text()).toContain('Complete · all five weekdays');
});
it('shows progress at the clicked button and distinguishes queueing from email delivery',async()=>{
 api.get.mockImplementation(path=>Promise.resolve({data:path.endsWith('/progress')?{counts:{pending:1,opened:0,completed:0},providers:[{providerId:1,status:'pending',invitationStatus:'pending'}]}:roster}));
 let finish;api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));const w=await render();await w.find('[aria-label="Request update from Alex Assigned"]').trigger('click');
 expect(w.findAll('tbody tr')[0].text()).toContain('Requesting update…');expect(api.post).toHaveBeenCalledTimes(1);
 finish({data:{requested:[1],skipped:[],failed:[],outcomes:[{providerId:1,outcome:'requested',emailFollowupEnabled:true}]}});await flushPromises();
 expect(w.findAll('tbody tr')[0].text()).toContain('Email follow-up is queued');expect(w.findAll('tbody tr')[0].text()).toContain('Email queued · awaiting delivery.');
});
it('does not apply a late request receipt to another agency and preserves status when refresh fails',async()=>{
 const w=await render();let finish;api.post.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));await w.find('[aria-label="Request update from Alex Assigned"]').trigger('click');
 await w.setProps({agencyId:3});await flushPromises();finish({data:{requested:[],skipped:[],failed:[1]}});await flushPromises();expect(w.text()).not.toContain('Could not confirm the request.');
 api.get.mockImplementation(path=>path.endsWith('/progress')?Promise.reject(new Error('offline')):defaultGet(path));await click(w,'Refresh providers');await flushPromises();
 expect(w.find('[role=alert]').text()).toContain('Delivery status could not be refreshed');expect(w.findAll('tbody tr')[0].text()).toContain('Email sent Nov 11');
});
