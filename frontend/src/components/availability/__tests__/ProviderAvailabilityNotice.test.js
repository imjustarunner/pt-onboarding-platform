import {mount,flushPromises} from '@vue/test-utils';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
vi.mock('../../../services/api',()=>({default:{get:vi.fn(),post:vi.fn()}}));
import api from '../../../services/api';
import Notice from '../ProviderAvailabilityNotice.vue';
let wrapper;
const reminder={providerId:9,agencyId:2,agencyName:'ITSCO',format:'VIRTUAL',checkedAt:'2026-10-14T12:00:00Z'};
const render=()=>wrapper=mount(Notice,{global:{stubs:{RouterLink:{props:['to'],template:'<a><slot/></a>'}}}});
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();api.get.mockResolvedValue({data:{reminders:[reminder]}});});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
it('describes conflict-free openings and the check window rather than claiming no hours were published',async()=>{
 render();await flushPromises();expect(wrapper.text()).toContain('no bookable virtual new-client openings found in the next four schedule weeks');
 expect(wrapper.text()).toContain('Published hours may still be occupied');expect(wrapper.text()).toContain('Last checked');expect(wrapper.text()).not.toContain('no virtual new-client openings published');
});
it('clears the banner when a new check finds openings without blocking the schedule',async()=>{
 render();await flushPromises();api.get.mockResolvedValue({data:{reminders:[]}});window.dispatchEvent(new Event('focus'));await flushPromises();
 expect(wrapper.find('aside').exists()).toBe(false);expect(api.get).toHaveBeenLastCalledWith('/availability/me/opening-reminders',expect.objectContaining({skipGlobalLoading:true}));
});
it('coalesces focus and polling while a check is in flight',async()=>{
 let resolve;api.get.mockReturnValue(new Promise(r=>resolve=r));render();window.dispatchEvent(new Event('focus'));vi.advanceTimersByTime(60000);
 expect(api.get).toHaveBeenCalledTimes(1);resolve({data:{reminders:[]}});await flushPromises();
});
it('does not leave an old no-openings claim visible if refresh fails',async()=>{
 render();await flushPromises();api.get.mockRejectedValue(Error('offline'));window.dispatchEvent(new Event('focus'));await flushPromises();expect(wrapper.find('aside').exists()).toBe(false);
});
