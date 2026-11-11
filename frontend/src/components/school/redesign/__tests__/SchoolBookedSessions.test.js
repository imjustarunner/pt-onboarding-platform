import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {flushPromises,mount} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),post:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:m}));
import SchoolBookedSessions from '../SchoolBookedSessions.vue';
const state=()=>({canManage:true,transition:{effectiveDate:'2028-11-01',revision:2},timeZone:'America/Denver',today:'2028-11-06',startDate:'2028-11-06',endDate:'2028-11-13',slots:[{id:10,client_id:1,weekday:'Monday',start_time:'09:00',end_time:'10:00',identifier_code:'SYN-AA'}],candidates:[{id:102,client_id:1,start_at:'2028-11-13T16:00:00Z',end_at:'2028-11-13T17:00:00Z',linked_slot_id:null}],appointments:[{id:100,clientId:1,clientLabel:'SYN-AA',startAt:'2028-11-06T16:00:00Z',endAt:'2028-11-06T17:00:00Z',status:'scheduled',canMove:true,fingerprint:'reviewed-fingerprint'}]});
let wrapper;
beforeEach(()=>{vi.clearAllMocks();m.get.mockResolvedValue({data:state()});m.put.mockResolvedValue({data:{ok:true}});m.post.mockResolvedValue({data:{ok:true}});});
afterEach(()=>wrapper?.unmount());
it('edits the dated canonical appointment through the scoped endpoint, using the reviewed fingerprint',async()=>{
 wrapper=mount(SchoolBookedSessions,{props:{schoolOrganizationId:451,providerUserId:7}});await flushPromises();
 expect(wrapper.text()).toContain('SYN-AA');expect(wrapper.text()).toContain('Mon, Nov 6');
 await wrapper.findAll('button').find(button=>button.text()==='Change appointment time').trigger('click');
 await wrapper.find('.move input[type=date]').setValue('2028-11-07');const clocks=wrapper.findAll('.move input[type=time]');await clocks[0].setValue('10:00');await clocks[1].setValue('11:00');
 await wrapper.find('.move').trigger('submit');await flushPromises();
 expect(m.put).toHaveBeenCalledWith('/school-appointment-transition/451/providers/7/appointments/100',{date:'2028-11-07',startTime:'10:00',endTime:'11:00',fingerprint:'reviewed-fingerprint'});
 expect(wrapper.emitted('busy').slice(0,2)).toEqual([[true],[false]]);expect(wrapper.text()).toContain('actual appointment time changed');
});
it('requires explicit reviewed setup and matching-client links, and never includes clinical or billing data',async()=>{
 wrapper=mount(SchoolBookedSessions,{props:{schoolOrganizationId:451,providerUserId:7,allowSetup:true}});await flushPromises();
 expect(wrapper.find('.setup button').attributes('disabled')).toBeDefined();await wrapper.find('.setup input[type=checkbox]').setValue(true);await wrapper.find('.setup').trigger('submit');await flushPromises();
 expect(m.put).toHaveBeenCalledWith('/school-appointment-transition/451/providers/7',{effectiveDate:'2028-11-01',revision:2,reviewed:true});
 await wrapper.find('.links select').setValue('10');await flushPromises();const boxes=wrapper.findAll('.links input[type=checkbox]');expect(boxes).toHaveLength(2);await boxes[0].setValue(true);await boxes[1].setValue(true);await wrapper.find('.links').trigger('submit');await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/school-appointment-transition/451/providers/7/links',{slotId:10,appointmentIds:[102],reviewed:true});
});
it('rejects stale-load responses and does not show a saved response in a different provider context',async()=>{
 let resolveOld;const pending=new Promise(resolve=>{resolveOld=resolve;});m.get.mockReturnValueOnce(pending);
 wrapper=mount(SchoolBookedSessions,{props:{schoolOrganizationId:451,providerUserId:7}});
 await wrapper.setProps({providerUserId:8});await flushPromises();resolveOld({data:{...state(),appointments:[{...state().appointments[0],clientLabel:'OLD-CONTEXT'}]}});await flushPromises();
 expect(wrapper.text()).not.toContain('OLD-CONTEXT');
 let finish;m.put.mockReturnValueOnce(new Promise(resolve=>{finish=resolve;}));await wrapper.findAll('button').find(button=>button.text()==='Change appointment time').trigger('click');await wrapper.find('.move').trigger('submit');
 await wrapper.setProps({providerUserId:9});await flushPromises();finish({data:{ok:true}});await flushPromises();expect(wrapper.text()).not.toContain('actual appointment time changed');
});
it('shows migration or stale-write failures without optimistic success or a second booking',async()=>{
 m.put.mockRejectedValueOnce({response:{data:{error:{message:'The appointment changed. Refresh.'}}}});wrapper=mount(SchoolBookedSessions,{props:{schoolOrganizationId:451,providerUserId:7}});await flushPromises();
 await wrapper.findAll('button').find(button=>button.text()==='Change appointment time').trigger('click');await wrapper.find('.move').trigger('submit');await flushPromises();
 expect(wrapper.find('[role=alert]').text()).toContain('changed');expect(m.post).not.toHaveBeenCalled();
});
