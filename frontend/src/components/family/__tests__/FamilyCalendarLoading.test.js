import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {mount,flushPromises} from '@vue/test-utils';
import Calendar from '../FamilyCalendarView.vue';
let wrapper;
beforeEach(()=>{vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});});
afterEach(()=>{wrapper?.unmount();vi.unstubAllGlobals();});
describe('calendar updates while Google is slow',()=>{
 it('shows a newly saved Get Vince immediately and coalesces refreshes instead of discarding every slow response',async()=>{
   let resolve;
   const http={get:vi.fn(()=>new Promise(r=>{resolve=r;}))};
   wrapper=mount(Calendar,{props:{http,householdId:7,now:new Date('2026-09-24T17:45:00Z'),timezone:'America/Denver'}});
   await flushPromises();const initial=http.get.mock.calls.length;
   const entry={id:42,kind:'event',title:'Get Vince',start_at:'2026-09-24T18:15:00Z',end_at:'2026-09-24T21:15:00Z',metadata:{eventType:'airport'}};
   await wrapper.setProps({entries:[entry],revision:1});await wrapper.setProps({revision:2});
   expect(wrapper.text()).toContain('Get Vince');expect(http.get).toHaveBeenCalledTimes(initial);
   resolve({data:{events:[],warnings:[]}});await flushPromises();
   expect(wrapper.text()).toContain('Get Vince');expect(http.get).toHaveBeenCalledTimes(initial+1);
 });
});
