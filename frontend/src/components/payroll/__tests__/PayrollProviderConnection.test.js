import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Connection from '../PayrollProviderConnection.vue';
const api=vi.hoisted(()=>({get:vi.fn(),post:vi.fn()}));vi.mock('../../../services/api',()=>({default:api}));
const options={providers:[{name:'Synthetic Original-Name',rowCount:4}],candidates:[{id:474,name:'Synthetic Original-Name',archived:true}]};
const preview={providerName:'Synthetic Original-Name',target:options.candidates[0],currentRows:4,catchupRows:2,changedRows:6,reviewToken:'reviewed'};
beforeEach(()=>{vi.clearAllMocks();api.get.mockImplementation(async(_url,args)=>({data:args?.params?preview:options}));api.post.mockResolvedValue({data:{connected:true,changedRows:6,target:preview.target,requiresRerun:true}});});
const button=w=>w.findAll('button').find(b=>b.text()==='Connect provider');
const open=async w=>{w.get('details').element.open=true;await w.get('details').trigger('toggle');await flushPromises();};
const choose=async w=>{await w.findAll('select')[0].setValue('Synthetic Original-Name');await w.findAll('select')[1].setValue('474');await flushPromises();};
it('loads only when opened and requires explicit confirmation before connecting to archived payroll history',async()=>{
 const w=mount(Connection,{props:{periodId:149}});expect(api.get).not.toHaveBeenCalled();await open(w);await choose(w);expect(w.text()).toContain('This profile stays archived');expect(w.text()).toContain('4 current-report rows and 2 prior catch-up');expect(button(w).element.disabled).toBe(true);
 await w.get('input[type=checkbox]').setValue(true);await button(w).trigger('click');await flushPromises();expect(api.post).toHaveBeenCalledWith('/payroll/periods/149/provider-connection',{providerName:'Synthetic Original-Name',targetUserId:474,reviewToken:'reviewed',confirmedSamePerson:true});expect(w.emitted('connected')[0][0].requiresRerun).toBe(true);expect(w.text()).toContain('run payroll again');w.unmount();
});
it('discards a failed or stale confirmation and requires a new review',async()=>{
 api.post.mockRejectedValue({response:{data:{error:{message:'The report changed. Refresh.'}}}});const w=mount(Connection,{props:{periodId:149}});await open(w);await choose(w);await w.get('input').setValue(true);await button(w).trigger('click');await flushPromises();expect(w.get('[role=alert]').text()).toContain('report changed');expect(w.find('input[type=checkbox]').exists()).toBe(false);expect(w.emitted('connected')).toBeUndefined();w.unmount();
});
it('resets the selected employee and confirmation when the payroll period changes',async()=>{
 const w=mount(Connection,{props:{periodId:149}});await open(w);await choose(w);await w.get('input').setValue(true);await w.setProps({periodId:150});await flushPromises();expect(w.find('input[type=checkbox]').exists()).toBe(false);expect(w.findAll('select')[0].element.value).toBe('');expect(api.post).not.toHaveBeenCalled();w.unmount();
});
it('is unavailable for posted payroll',()=>{
 const w=mount(Connection,{props:{periodId:149,locked:true}});expect(w.find('details').exists()).toBe(false);expect(api.get).not.toHaveBeenCalled();w.unmount();
});
