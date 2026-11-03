import {mount,flushPromises} from '@vue/test-utils';
import {it,expect,vi} from 'vitest';
const mocks=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:mocks.get}}));
vi.mock('../../../store/auth',()=>({useAuthStore:()=>({user:{id:9,role:'super_admin'}})}));
import Picker from '../TeamSchedulePicker.vue';
it('resolves a deep link only through the permitted staff directory, including historical providers',async()=>{
 mocks.get.mockResolvedValue({data:{staff:[{id:10,displayName:'DEMO QA Jordan'}]}});
 const wrapper=mount(Picker,{props:{modelValue:0,agencyId:450,initialUserId:10},global:{stubs:{PersonSearchSelect:true}}});await flushPromises();
 expect(mocks.get).toHaveBeenCalledWith('/staff/directory',expect.objectContaining({params:{agencyId:450,activeOnly:false}}));
 expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([10]);await wrapper.setProps({initialUserId:11});await flushPromises();expect(wrapper.emitted('update:modelValue').at(-1)).not.toEqual([11]);wrapper.unmount();
});
