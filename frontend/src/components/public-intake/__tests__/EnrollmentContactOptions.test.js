import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import EnrollmentContactOptions from '../EnrollmentContactOptions.vue';
const choices={noRoutineCalls:false,noAutomaticEmail:false,alternativeContactInstructions:'',smsPreference:'no'};
it('keeps extra contact instructions collapsed and makes neither choice for the parent',()=>{
 const wrapper=mount(EnrollmentContactOptions,{props:{choices}});
 expect(wrapper.find('details').attributes('open')).toBeUndefined();expect(wrapper.findAll('input').every(x=>!x.element.checked)).toBe(true);
 expect(wrapper.text()).toContain('You can still request a sign-in or password recovery email');
});
it('changes only the selected contact option and never changes SMS consent',async()=>{
 const wrapper=mount(EnrollmentContactOptions,{props:{choices}});
 await wrapper.findAll('input')[0].setValue(true);await wrapper.findAll('input')[1].setValue(true);await wrapper.find('textarea').setValue('Please use the portal');
 expect(wrapper.emitted('change')).toEqual([[{noRoutineCalls:true}],[{noAutomaticEmail:true}],[{alternativeContactInstructions:'Please use the portal'}]]);expect(choices.smsPreference).toBe('no');
});
it('shows saved safe-contact instructions and Spanish copy',()=>{
 const wrapper=mount(EnrollmentContactOptions,{props:{choices:{...choices,noAutomaticEmail:true,alternativeContactInstructions:'Use portal'},es:true}});
 expect(wrapper.find('details').attributes('open')).toBeDefined();expect(wrapper.find('textarea').element.value).toBe('Use portal');expect(wrapper.text()).toContain('recuperación de contraseña');
});
