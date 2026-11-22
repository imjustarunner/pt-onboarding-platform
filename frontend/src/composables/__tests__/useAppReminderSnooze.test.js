import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mount} from '@vue/test-utils';
import {toRef} from 'vue';
import {useAppReminderSnooze} from '../useAppReminderSnooze.js';
const wrappers=[];
const render=(userId=7)=>{const w=mount({props:['userId'],setup(props){return useAppReminderSnooze(toRef(props,'userId'));},template:'<div>{{snoozed}}</div>'},{props:{userId}});wrappers.push(w);return w;};
beforeEach(()=>{localStorage.clear();vi.useFakeTimers();vi.setSystemTime(new Date(2026,10,22,11));});
afterEach(()=>{wrappers.splice(0).forEach(w=>w.unmount());vi.useRealTimers();});
it('shares pause and resume across mounted reminders without marking notifications read',async()=>{
 const a=render(),b=render();a.vm.snoozeToday();expect(b.vm.snoozed).toBe(true);
 expect(new Date(b.vm.until).getHours()).toBe(0);expect(new Date(b.vm.until).getDate()).toBe(23);
 b.vm.resume();expect(a.vm.snoozed).toBe(false);expect(localStorage.length).toBe(1);
});
it('survives refresh, expires, and remains scoped to the signed-in account',async()=>{
 render().vm.snoozeHour();expect(render().vm.snoozed).toBe(true);
 const different=render(8);expect(different.vm.snoozed).toBe(false);
 await different.setProps({userId:7});expect(different.vm.snoozed).toBe(true);
 vi.advanceTimersByTime(3615000);expect(different.vm.snoozed).toBe(false);
});
