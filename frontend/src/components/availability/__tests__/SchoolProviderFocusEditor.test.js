import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Editor from '../SchoolProviderFocusEditor.vue';
import api from '../../../services/api';
vi.mock('../../../services/api',()=>({default:{put:vi.fn()}}));
beforeEach(()=>vi.resetAllMocks());
const providers=[{id:7,first_name:'Alex',last_name:'Provider',service_focus:'Office-Based Counseling; Training and Precepting Support'},{id:8,first_name:'Demo',is_demo:1}];
const click=(w,text)=>w.findAll('button').find(b=>b.text().startsWith(text)).trigger('click');
it('finds non-school providers, excludes demos, and adds school counseling while preserving existing focuses',async()=>{
 const w=mount(Editor,{props:{providers,agencyId:2},global:{stubs:{Teleport:true}}});expect(w.find('.focus-people').text()).not.toContain('Demo');await click(w,'Alex Provider');await click(w,'Add School-Based Counseling');await flushPromises();
 api.put.mockResolvedValue({data:{serviceFocus:'Office-Based Counseling; Training and Precepting Support; School-Based Counseling'}});await w.find('form').trigger('submit');await flushPromises();
 expect(api.put).toHaveBeenCalledWith('/availability/providers/7/school-service-focus',expect.objectContaining({agencyId:2,serviceFocus:'Office-Based Counseling; Training and Precepting Support; School-Based Counseling',expectedServiceFocus:providers[0].service_focus}),expect.anything());expect(w.emitted('saved')).toHaveLength(1);
});
it('retains unsaved edits and shows concurrent-update failures',async()=>{
 const w=mount(Editor,{props:{providers,agencyId:2},global:{stubs:{Teleport:true}}});await click(w,'Alex Provider');await click(w,'Add School-Based Counseling');api.put.mockRejectedValue({response:{data:{error:{message:'Service focuses changed. Refresh.'}}}});await w.find('form').trigger('submit');await flushPromises();expect(w.find('[role="alert"]').text()).toContain('Service focuses changed');expect(w.emitted('saved')).toBeUndefined();
});
