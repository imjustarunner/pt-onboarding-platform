import {afterEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Presence from '../QuickViewPresence.vue';
let wrapper;
afterEach(()=>wrapper?.unmount());
describe('Quick View team presence',()=>{
 it('shows timedown and inactive teammates and saves an Away return time',async()=>{
   const http={get:vi.fn().mockResolvedValue({data:{enabled:true,people:[{id:1,first_name:'Pat',status:'idle',session_phase:'timedown'},{id:2,first_name:'Chris',status:'offline'}]}}),post:vi.fn().mockResolvedValue({data:{}})};
   wrapper=mount(Presence,{props:{http}});await flushPromises();
   expect(wrapper.text()).toContain('Timedown · signed in, inactive');expect(wrapper.text()).toContain('Inactive (offline or timed out)');
   await wrapper.find('form').trigger('submit');await flushPromises();
   expect(http.post).toHaveBeenCalledWith('/presence/away',expect.objectContaining({reason:'personal',durationMinutes:30}));
   await wrapper.findAll('button').find(b=>b.text()==='I’m back').trigger('click');await flushPromises();
   expect(http.post).toHaveBeenCalledWith('/presence/clear',{});
 });
 it('does not expose status controls when the server denies presence access',async()=>{
   wrapper=mount(Presence,{props:{http:{get:vi.fn().mockResolvedValue({data:{enabled:false,people:[]}})}}});await flushPromises();
   expect(wrapper.find('form').exists()).toBe(false);
 });
});
