import {expect,it} from 'vitest';
import {mount} from '@vue/test-utils';
import RecurrenceControls from '../RecurrenceControls.vue';
it('lets staff set an opening end date even when recurrence guidance is displayed',async()=>{
 const w=mount(RecurrenceControls,{props:{frequency:'WEEKLY',endMode:'until',endModes:['until','indefinite'],untilDate:'2026-12-15',openSlotHint:'Choose an end date to limit this opening series.'}});
 expect(w.text()).toContain('Ends');expect(w.find('input[type=date]').element.value).toBe('2026-12-15');
 await w.find('input[type=date]').setValue('2026-12-22');expect(w.emitted('update:untilDate')[0]).toEqual(['2026-12-22']);
 w.unmount();
});
it('keeps a retained one-time opening one-time without offering a recurrence end date',()=>{
 const w=mount(RecurrenceControls,{props:{frequency:'ONCE',openSlotHint:'One-time opening'}});expect(w.find('input[type=date]').exists()).toBe(false);expect(w.find('select').element.value).toBe('ONCE');w.unmount();
});
