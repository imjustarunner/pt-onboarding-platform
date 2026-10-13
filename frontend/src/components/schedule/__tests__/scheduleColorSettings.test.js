import { it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Editor from '../ScheduleColorSettings.vue';
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
