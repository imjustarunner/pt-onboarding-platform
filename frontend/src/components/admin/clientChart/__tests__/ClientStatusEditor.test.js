import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn(),put:vi.fn(),post:vi.fn()}));
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
it('keeps inactive and termination actions out of ordinary status edits',async()=>{
 m.get.mockResolvedValue({data:[{id:12,label:'Terminated',status_key:'terminated'},{id:13,label:'Inactive',status_key:'inactive'},{id:14,label:'Archived',status_key:'archived'},{id:11,label:'Current',status_key:'current'}]});
 const w=mount(Editor,{props:{client},global:{stubs:{Teleport:true}}});await flushPromises();expect(w.findAll('option').map(o=>o.element.value)).toEqual(['','99','11']);expect(w.text()).toContain('bottom of the profile');w.unmount();
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

it('reactivates from the Inactive badge using the staff reactivation action and a reason', async () => {
 const inactive={...client,status:'ARCHIVED',client_status_label:'Inactive',client_status_key:'inactive'};
 const updated={id:7,status:'ACTIVE',client_status_id:11,client_status_key:'current',client_status_label:'Current'};
 m.post.mockResolvedValue({data:{reactivated:true,client:updated}});
 const w=mount(Editor,{props:{client:inactive},global:{stubs:{Teleport:true}}});
 await flushPromises();
 expect(w.find('select').exists()).toBe(false);
 expect(w.get('button[type=submit]').text()).toBe('Reactivate client');
 expect(w.get('button[type=submit]').element.disabled).toBe(true);
 await w.get('textarea').setValue('Client is receiving ongoing services.');
 await w.get('form').trigger('submit');
 await flushPromises();
 expect(m.post).toHaveBeenCalledWith('/clients/7/reactivate',expect.objectContaining({requestId:expect.any(String),reason:'Client is receiving ongoing services.'}),expect.objectContaining({headers:{'X-Agency-Id':'2'}}));
 expect(m.put).not.toHaveBeenCalled();
 expect(w.emitted('saved')).toEqual([[updated]]);
 w.unmount();
});
