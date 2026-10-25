import {mount} from '@vue/test-utils';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {nextTick} from 'vue';
import DashboardLearningTips from '../DashboardLearningTips.vue';
let target,wrapper;
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));localStorage.clear();
 target=document.createElement('button');target.dataset.tour='dash-search';document.body.append(target);
 target.getBoundingClientRect=()=>({left:20,right:220,top:100,bottom:140,width:200,height:40});
});
afterEach(()=>{wrapper?.unmount();target.remove();vi.useRealTimers();});
const mountTip=(role='provider',created_at='2026-01-01T00:00:00Z')=>wrapper=mount(DashboardLearningTips,{props:{user:{id:7,role,created_at},enabled:true},attachTo:document.body});
const hover=async()=>{target.dispatchEvent(new Event('pointerover',{bubbles:true}));await vi.advanceTimersByTimeAsync(2000);await nextTick();};
it('shows a two-second hover tip beyond day 60; outside clicks dismiss temporarily and understanding persists',async()=>{
 mountTip();await vi.advanceTimersByTimeAsync(6000);expect(document.querySelector('[role="dialog"]')).toBeNull();
 await hover();expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Search');
 document.body.dispatchEvent(new Event('pointerdown',{bubbles:true}));await nextTick();expect(document.querySelector('[role="dialog"]')).toBeNull();
 await hover();const button=[...document.querySelectorAll('.tip-actions button')].find(b=>b.textContent==='I understand');button.click();await nextTick();
 wrapper.unmount();mountTip();await hover();expect(document.querySelector('[role="dialog"]')).toBeNull();
});
it('automatically suggests visible features during the first sixty days',async()=>{
 mountTip('staff','2026-10-01T00:00:00Z');await vi.advanceTimersByTimeAsync(5000);expect(document.querySelector('[role="dialog"]')).not.toBeNull();
});
it('never presents provider tutorials to a guardian',async()=>{
 mountTip('client_guardian','2026-10-01T00:00:00Z');await hover();await vi.advanceTimersByTimeAsync(100000);expect(document.querySelector('[role="dialog"]')).toBeNull();
});
