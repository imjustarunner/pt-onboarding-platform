import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Benefit from '../SchoolSupportCancellationBenefit.vue';
const benefit={eligible:true,label:'School Support Hours',balanceHours:2,pendingHours:1,availableHours:1,canRequest:true};
describe('school support cancellation choice',()=>{
 it('shows the real balance and asks for one hour without implying an immediate deduction',async()=>{
  const wrapper=mount(Benefit,{props:{benefit,eventType:'canceled'}});
  expect(wrapper.text()).toContain('School Support Hours');expect(wrapper.text()).toContain('Earned balance2 hours');
  expect(wrapper.text()).toContain('Use 1 hour for this canceled session');expect(wrapper.text()).toContain('only after approval');
  await wrapper.find('input').setValue(true);expect(wrapper.emitted('update:modelValue')).toEqual([[true]]);
 });
 it('disables new requests at zero available hours and permits clearing an invalid selection',async()=>{
  const wrapper=mount(Benefit,{props:{benefit:{...benefit,availableHours:0,canRequest:false}}});
  expect(wrapper.find('input').attributes('disabled')).toBeDefined();
  await wrapper.setProps({modelValue:true});expect(wrapper.find('input').attributes('disabled')).toBeUndefined();
  await wrapper.find('input').setValue(false);expect(wrapper.emitted('update:modelValue')).toEqual([[false]]);
 });
 it('shows the persisted request instead of a second request checkbox',()=>{
  const wrapper=mount(Benefit,{props:{benefit:{...benefit,request:{id:23,status:'submitted',hours:1}},readonly:true}});
  expect(wrapper.text()).toContain('Request #23 · Awaiting payroll review');expect(wrapper.find('input').exists()).toBe(false);
 });
 it('does not reveal a benefit panel to an ineligible viewer',()=>{
  const wrapper=mount(Benefit,{props:{benefit:{eligible:false}}});expect(wrapper.find('section').exists()).toBe(false);
 });
});
