import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
const http=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:http}));
import Notice from '../ContractSchedulingNotice.vue';
const below={showNotice:true,status:'below_target',weekStart:'2026-10-12',weekEnd:'2026-10-19',timeZone:'America/Denver',agreement:{minimumHours:6,requiredHours:8},scheduledHours:5,scheduledShortfallHours:3,capacityHours:7,capacityShortfallHours:1,availabilityStatus:'checked'};
let wrapper;
beforeEach(()=>{vi.clearAllMocks();http.get.mockResolvedValue({data:below});});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
it('shows contract-derived scheduling and availability gaps with hour units',async()=>{
 wrapper=mount(Notice,{props:{providerId:9,agencyId:2}});await flushPromises();
 expect(wrapper.text()).toContain('6 hours/week');expect(wrapper.text()).toContain('8 hours/week each');
 expect(wrapper.text()).toContain('5 hours scheduled');expect(wrapper.text()).toContain('3 more hours');expect(wrapper.text()).toContain('Add 1 more available hours');
 await wrapper.findAll('button')[0].trigger('click');expect(wrapper.emitted('open')).toHaveLength(1);
});
it('automatically removes the notice when a focus refresh reaches the target',async()=>{
 wrapper=mount(Notice,{props:{providerId:9,agencyId:2}});await flushPromises();expect(wrapper.find('aside').exists()).toBe(true);
 http.get.mockResolvedValue({data:{...below,status:'met',showNotice:false,scheduledHours:8}});
 window.dispatchEvent(new Event('focus'));await flushPromises();expect(wrapper.find('aside').exists()).toBe(false);
});
it('refreshes on request after a schedule change',async()=>{
 wrapper=mount(Notice,{props:{providerId:9,agencyId:2}});await flushPromises();
 const button=wrapper.findAll('button').find(b=>b.text()==='Check again');
 http.get.mockResolvedValue({data:{...below,showNotice:false}});await button.trigger('click');await flushPromises();expect(wrapper.find('aside').exists()).toBe(false);
});
it('does not display an expectation when there is no signed minimum',async()=>{
 http.get.mockResolvedValue({data:{status:'no_expectation',showNotice:false}});
 wrapper=mount(Notice,{props:{providerId:9,agencyId:2}});await flushPromises();expect(wrapper.find('aside').exists()).toBe(false);
});
it('keeps calendar errors distinct from a zero-hour availability shortfall',async()=>{
 http.get.mockResolvedValue({data:{...below,capacityHours:null,capacityShortfallHours:null,availabilityStatus:'unavailable'}});
 wrapper=mount(Notice,{props:{providerId:9,agencyId:2}});await flushPromises();expect(wrapper.text()).toContain('could not be fully checked');expect(wrapper.text()).not.toContain('Add 0');
});
it('provides staff the same comparison without showing self-service actions',async()=>{
 wrapper=mount(Notice,{props:{providerId:9,agencyId:2,staff:true}});await flushPromises();expect(wrapper.text()).toContain('5 hours scheduled');expect(wrapper.text()).not.toContain('Review availability');
});
it('shows staff a retry if the check fails instead of a false shortfall',async()=>{
 http.get.mockRejectedValue(new Error('offline'));wrapper=mount(Notice,{props:{providerId:9,agencyId:2,staff:true}});await flushPromises();expect(wrapper.text()).toContain('could not be checked');expect(wrapper.text()).not.toContain('0 hours scheduled');
});
it('discards a response from a previously selected employee',async()=>{
 let resolveOld;http.get.mockReturnValueOnce(new Promise(resolve=>{resolveOld=resolve;}));
 wrapper=mount(Notice,{props:{providerId:9,agencyId:2}});await flushPromises();
 http.get.mockResolvedValue({data:{showNotice:false,status:'met'}});await wrapper.setProps({providerId:10});await flushPromises();
 resolveOld({data:below});await flushPromises();expect(wrapper.find('aside').exists()).toBe(false);
});
it('clears the notice on its automatic visible-page refresh',async()=>{
 vi.useFakeTimers({toFake:['setInterval','clearInterval']});
 vi.spyOn(document,'visibilityState','get').mockReturnValue('visible');
 wrapper=mount(Notice,{props:{providerId:9,agencyId:2}});await flushPromises();
 http.get.mockResolvedValue({data:{...below,showNotice:false}});
 await vi.advanceTimersByTimeAsync(60000);await flushPromises();expect(wrapper.find('aside').exists()).toBe(false);
});
