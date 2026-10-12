import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,expect,it,vi} from 'vitest';
import Modal from '../LibraryDistributeModal.vue';
vi.mock('../../../services/library.js',()=>({distributeLibraryResource:vi.fn()}));
import {distributeLibraryResource} from '../../../services/library.js';
const props={resource:{id:10,name:'Worksheet',resourceType:'branded_doc'},agencyId:2};
beforeEach(()=>{vi.clearAllMocks();distributeLibraryResource.mockResolvedValue({count:1});});
it('defaults providers to named coworkers and hides bulk audiences',async()=>{
 const wrapper=mount(Modal,{props});expect(wrapper.text()).not.toContain('All Providers');expect(wrapper.text()).not.toContain('All Staff');
 await wrapper.get('textarea').setValue('coworker@agency.org');await wrapper.get('button.btn-primary').trigger('click');await flushPromises();
 expect(distributeLibraryResource).toHaveBeenCalledWith(10,{agencyId:2,mode:'view_only',audience:'custom',emails:'coworker@agency.org'});wrapper.unmount();
});
it('requires a recipient and resets a bulk choice when manager capability is removed',async()=>{
 const wrapper=mount(Modal,{props:{...props,canManage:true}});expect(wrapper.text()).toContain('All Providers');
 await wrapper.get('input[value="staff"]').setValue();await wrapper.setProps({canManage:false});
 expect(wrapper.get('input[value="custom"]').element.checked).toBe(true);await wrapper.get('button.btn-primary').trigger('click');
 expect(distributeLibraryResource).not.toHaveBeenCalled();expect(wrapper.text()).toContain('Enter at least one coworker');wrapper.unmount();
});
