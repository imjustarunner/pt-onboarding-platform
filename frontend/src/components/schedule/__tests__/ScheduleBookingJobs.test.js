import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
const m=vi.hoisted(()=>({get:vi.fn()}));
vi.mock('../../../services/api',()=>({default:{get:m.get}}));
import Jobs from '../ScheduleBookingJobs.vue';
let wrapper;const job={id:'job-1',status:'processing',phase:'saving',completed:7,total:26};
beforeEach(()=>{vi.useFakeTimers();vi.clearAllMocks();localStorage.clear();m.get.mockImplementation(async url=>({data:url.endsWith('/booking-jobs')?{jobs:[job]}:{job:{...job,status:'completed',completed:26,result:{appointmentIds:[1,2]}}}}));});
afterEach(()=>{wrapper?.unmount();vi.useRealTimers();});
it('recovers an actor’s active booking after a reload and reports completion outside the modal',async()=>{
 wrapper=mount(Jobs,{props:{actorUserId:501}});await flushPromises();expect(wrapper.text()).toContain('7 of 26');expect(wrapper.text()).toContain('keep using your schedule');
 await vi.advanceTimersByTimeAsync(2000);await flushPromises();expect(wrapper.text()).toContain('26 sessions scheduled');expect(wrapper.emitted('completed')).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(2000);expect(wrapper.emitted('completed')).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(8000);expect(wrapper.find('section').exists()).toBe(false);
});
it('keeps the accepted job visible if progress fails, without resubmitting or claiming failure',async()=>{
 wrapper=mount(Jobs,{props:{actorUserId:501}});await flushPromises();m.get.mockRejectedValue(new Error('offline'));
 await vi.advanceTimersByTimeAsync(2000);await flushPromises();expect(wrapper.text()).toContain('continues in the background');expect(wrapper.text()).not.toContain('needs attention');expect(wrapper.emitted('completed')).toBeUndefined();
});
it('shows a worker failure distinctly and clears the previous actor’s jobs on an account change',async()=>{
 wrapper=mount(Jobs,{props:{actorUserId:501}});await flushPromises();wrapper.vm.track({...job,status:'failed',error:'This room is no longer reserved to you.'});await flushPromises();
 expect(wrapper.text()).toContain('needs attention');expect(wrapper.text()).toContain('no longer reserved');
 m.get.mockResolvedValue({data:{jobs:[]}});await wrapper.setProps({actorUserId:999});await flushPromises();expect(wrapper.text()).not.toContain('no longer reserved');
});

it('publishes saved occurrences once while a series is still processing', async () => {
  wrapper=mount(Jobs,{props:{actorUserId:501}});await flushPromises();
  const first = {id:81,agencyId:2}, second = {id:82,agencyId:2};
  wrapper.vm.track({...job,result:{appointments:[first]}},{clientLabel:'Test client'});
  wrapper.vm.track({...job,status:'completed',result:{appointments:[first,second]}});
  expect(wrapper.emitted('appointments-saved')).toEqual([[[first],'Test client'],[[second],'Test client']]);
});
