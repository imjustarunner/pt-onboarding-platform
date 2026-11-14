import {expect,it} from 'vitest';
import {mount} from '@vue/test-utils';
import Opening from '../OpenSlotPlusOfficeRequestBody.vue';
const options=[{value:'tutoring',label:'Tutoring'},{value:'counseling',label:'Counseling'},{value:'childcare',label:'Childcare'}];
it('uses tutoring wording without clinical care types, preserving new/current student availability',async()=>{
 const w=mount(Opening,{props:{serviceType:'tutoring',serviceOptions:options,frequency:'ONCE',availableForIntake:true}});
 expect(w.text()).not.toMatch(/COUPLES|FAMILY|Single intake|care team/);expect(w.text()).toContain('One-time tutoring');expect(w.text()).toContain('student');
 await w.find('select').setValue('counseling');expect(w.emitted('update:serviceType')[0]).toEqual(['counseling']);await w.setProps({serviceType:'counseling'});expect(w.text()).toContain('COUPLES');w.unmount();
});
it('routes childcare to shifts rather than publishing patient availability',async()=>{
 const w=mount(Opening,{props:{serviceType:'childcare',serviceOptions:options}});expect(w.text()).toContain('planned child count');expect(w.find('input[type=checkbox]').exists()).toBe(false);await w.get('button').trigger('click');expect(w.emitted('open-childcare')).toHaveLength(1);w.unmount();
});
