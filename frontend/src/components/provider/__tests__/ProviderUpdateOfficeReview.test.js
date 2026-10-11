import {beforeEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Review from '../ProviderUpdateOfficeReview.vue';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
const item={id:10,title:'Windchime · Room 204 · Counseling Office',weekday:3,when:'Wed · 2:00 PM · Weekly',timeZone:'America/Denver'};
const button=(w,text)=>w.findAll('button').find(b=>b.text()===text);
const render=()=>mount(Review,{props:{mode:'token',token:'invite',agencyId:2}});
beforeEach(()=>{vi.clearAllMocks();api.get.mockResolvedValue({data:{items:[item]}});api.post.mockResolvedValue({data:{ok:true}});});
it('removes a released row immediately, prevents duplicate clicks, and enables continuing without a second refresh',async()=>{
 const w=render();await flushPromises();let finish;api.post.mockImplementation(()=>new Promise(r=>finish=r));
 await button(w,'Incorrect — remove reservation').trigger('click');await button(w,'Release this reservation').trigger('click');await button(w,'Releasing…').trigger('click');expect(api.post).toHaveBeenCalledOnce();
 finish({data:{ok:true}});await flushPromises();expect(w.find('article').exists()).toBe(false);expect(w.text()).toContain('It has been removed');expect(api.get).toHaveBeenCalledOnce();expect(button(w,'Save and continue').element.disabled).toBe(false);w.unmount();
});
it('keeps the reservation and displays the error when a linked appointment blocks release',async()=>{
 const w=render();await flushPromises();api.post.mockRejectedValue({response:{data:{error:{message:'Handle the client appointment first.'}}}});
 await button(w,'Incorrect — remove reservation').trigger('click');await button(w,'Release this reservation').trigger('click');await flushPromises();expect(w.find('article').exists()).toBe(true);expect(w.get('[role=alert]').text()).toContain('client appointment');expect(button(w,'Save and continue').element.disabled).toBe(true);w.unmount();
});
it('explains that new room requests belong later and ignores a stale refresh completing after release',async()=>{
 const w=render();await flushPromises();expect(w.text()).toContain('New days, times, and room requests come later');expect(w.emitted('navigate')).toBeUndefined();let finish;api.get.mockImplementationOnce(()=>new Promise(r=>finish=r));
 await button(w,'Refresh reservations').trigger('click');await button(w,'Incorrect — remove reservation').trigger('click');await button(w,'Release this reservation').trigger('click');await flushPromises();finish({data:{items:[item]}});await flushPromises();expect(w.find('article').exists()).toBe(false);w.unmount();
});
