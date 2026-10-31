import { describe,it,expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Panel from '../SupervisionAttendeeMandatoryPanel.vue';
import { isWorkplaceSchedulePerson } from '../../../utils/workplacePeople';
describe('supervision attendee choices',()=>{
 it('shows qualifications while allowing mandatory selection and keeping presenters required',async()=>{
  const wrapper=mount(Panel,{props:{open:true,participants:[{id:1,label:'Intern',professionalDetails:{educationLabel:'Bachelor’s level',hcbsCategory:2,hcbsCategoryLabel:'Intern',isIntern:true}},{id:2,label:'Presenter'}],presenterIds:[2]}});
  expect(wrapper.text()).toContain('Bachelor’s level');expect(wrapper.text()).toContain('HCBS 2');expect(wrapper.text()).toContain('Unpaid indirect hours');
  const inputs=wrapper.findAll('input');expect(inputs[0].element.checked).toBe(false);expect(inputs[1].element.checked).toBe(true);expect(inputs[1].element.disabled).toBe(true);
  await inputs[0].setValue(true);expect(wrapper.emitted('update:mandatoryIds')[0]).toEqual([[1]]);wrapper.unmount();
 });
 it('excludes private family profiles and guardian-only accounts from workplace selectors',()=>{
  expect(isWorkplaceSchedulePerson({role:'provider',email:'family-id@members.invalid'})).toBe(false);
  expect(isWorkplaceSchedulePerson({role:null,email:'family-id@members.invalid'})).toBe(false);
  expect(isWorkplaceSchedulePerson({role:'client_guardian'})).toBe(false);
  expect(isWorkplaceSchedulePerson({role:'super_admin',email:'parent@example.com',status:'ACTIVE_EMPLOYEE'})).toBe(true);
  for(const patch of [{is_demo:1},{created_via_dev_fill:1},{is_active:0},{is_archived:1},{status:'INACTIVE_EMPLOYEE'},{status:'ONBOARDING'},{membership_active:0}])expect(isWorkplaceSchedulePerson({role:'provider',status:'ACTIVE_EMPLOYEE',...patch})).toBe(false);
 });
});
