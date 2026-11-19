import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),put:vi.fn()}));
vi.mock('../../../../services/api',()=>({default:m}));
import Editor from '../ClientStatusEditor.vue';
const client={id:7,agency_id:2,client_status_id:99,client_status_label:'Fall Confirmation Pending',full_name:'Synthetic Client',gender:'male',organization_id:null};
beforeEach(()=>{vi.clearAllMocks();m.get.mockResolvedValue({data:[{id:11,label:'Current',status_key:'current',is_active:1}]});m.put.mockResolvedValue({data:{...client,client_status_id:11,client_status_label:'Current'}});});
it('keeps a legacy status visible and saves only the explicitly selected status',async()=>{
 const w=mount(Editor,{props:{client},global:{stubs:{Teleport:true}}});await flushPromises();
 expect(w.get('select').element.value).toBe('99');expect(w.get('select').element.selectedOptions[0].textContent).toContain('Fall Confirmation Pending');expect(w.get('button[type=submit]').element.disabled).toBe(true);
 await w.get('select').setValue('11');await w.get('form').trigger('submit');await flushPromises();
 expect(m.put).toHaveBeenCalledWith('/clients/7',{client_status_id:11},expect.objectContaining({headers:{'X-Agency-Id':'2'}}));expect(w.emitted('saved')[0][0]).toMatchObject({client_status_id:11,gender:'male',organization_id:null});w.unmount();
});
it('keeps a failed status selection editable and shows the server error inline',async()=>{
 m.put.mockRejectedValue({response:{data:{error:{message:'Status could not be saved'}}}});const w=mount(Editor,{props:{client},global:{stubs:{Teleport:true}}});await flushPromises();await w.get('select').setValue('11');await w.get('form').trigger('submit');await flushPromises();expect(w.get('[role=alert]').text()).toBe('Status could not be saved');expect(w.get('select').element.value).toBe('11');expect(w.emitted('saved')).toBeUndefined();w.unmount();
});
it('requires an explicit reason when choosing Terminated',async()=>{
 m.get.mockResolvedValue({data:[{id:12,label:'Terminated',status_key:'terminated'}]});const w=mount(Editor,{props:{client},global:{stubs:{Teleport:true}}});await flushPromises();await w.get('select').setValue('12');expect(w.get('button[type=submit]').element.disabled).toBe(true);await w.get('textarea').setValue('Synthetic closure reason');await w.get('form').trigger('submit');await flushPromises();expect(m.put.mock.calls[0][1]).toEqual({client_status_id:12,termination_reason:'Synthetic closure reason'});w.unmount();
});

it('keeps the selection visible if a successful response still reports the old status', async () => {
 m.put.mockResolvedValue({data:client});
 const wrapper=mount(Editor,{props:{client},global:{stubs:{Teleport:true}}});
 await flushPromises(); await wrapper.get('select').setValue('11');
 await wrapper.get('form').trigger('submit'); await flushPromises();
 expect(wrapper.emitted('saved')).toBeUndefined();
 expect(wrapper.get('[role=alert]').text()).toContain('previous status');
 wrapper.unmount();
});
