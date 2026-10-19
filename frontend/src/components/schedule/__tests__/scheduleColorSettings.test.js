import { it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Editor from '../ScheduleColorSettings.vue';
import Legend from '../ScheduleColorLegend.vue';
import { defaultScheduleColors } from '../../../utils/scheduleAppearance.js';
it('finds individual types, changes their colors and resets the shared palette',async()=>{
 const wrapper=mount(Editor,{props:{modelValue:defaultScheduleColors()}});
 await wrapper.find('input[type="search"]').setValue('interview');
 expect(wrapper.findAll('input[type="color"]')).toHaveLength(1);
 await wrapper.find('input[type="color"]').setValue('#123456');
 expect(wrapper.emitted('update:modelValue').at(-1)[0].interview).toBe('#123456');
 await wrapper.find('button').trigger('click');
 expect(wrapper.emitted('update:modelValue').at(-1)[0]).toEqual(defaultScheduleColors());wrapper.unmount();
});
it('shows a labeled key using the same personal colors, with transparent fills', async () => {
 const wrapper=mount(Legend,{props:{colors:{interview:'#123456'}}});
 const interview=()=>wrapper.findAll('.legend-item').find(item=>item.text()==='Interview');
 expect(wrapper.text()).toContain('Office assigned');
 expect(wrapper.text()).toContain('Office booked');
 expect(wrapper.find('.legend-items').text()).toContain('Virtual opening');
 expect(wrapper.find('.legend-items').text()).toContain('In-person intake');
 expect(wrapper.text()).not.toContain('Office assigned available');
 expect(interview().find('.legend-swatch').attributes('style')).toContain('rgba(18, 52, 86, 0.22)');
 await wrapper.setProps({colors:{interview:'#654321'},dark:true});
 expect(interview().find('.legend-swatch').attributes('style')).toContain('rgba(101, 67, 33, 0.32)');
 expect(wrapper.find('details').text()).toContain('Google event');
 wrapper.unmount();
});
