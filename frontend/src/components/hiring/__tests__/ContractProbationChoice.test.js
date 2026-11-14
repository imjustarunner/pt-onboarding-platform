import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import ContractProbationChoice from '../ContractProbationChoice.vue';
describe('required individual probation choice',()=>{
 it('starts without a selection and requires a conscious Yes or No',async()=>{
  const wrapper=mount(ContractProbationChoice);
  expect(wrapper.findAll('input:checked')).toHaveLength(0);
  expect(wrapper.findAll('input[required]')).toHaveLength(2);
  await wrapper.find('input[value="no"]').setValue(true);
  expect(wrapper.emitted('update:modelValue')).toEqual([['no']]);
  expect(wrapper.text()).toContain('Minimum-workload rate reductions are not activated');
 });
 it('requires actual individual probation terms when ISI explicitly selects Yes',async()=>{
  const wrapper=mount(ContractProbationChoice,{props:{modelValue:'yes',individual:true}});
  expect(wrapper.find('textarea[required]').exists()).toBe(true);
  await wrapper.find('textarea').setValue('Approved original 30-day period and individual rates.');
  expect(wrapper.emitted('update:terms')[0]).toEqual(['Approved original 30-day period and individual rates.']);
  await wrapper.setProps({modelValue:'no'});expect(wrapper.find('textarea').exists()).toBe(false);
 });
});
