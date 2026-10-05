import { mount } from '@vue/test-utils';
import { describe,it,expect } from 'vitest';
import PracticePicker from '../PracticePicker.vue';
const practices=[{id:2,name:'ITSCO',logoUrl:'/assets/itsco/logo.png'},{id:6,name:'Next Level Up',logoUrl:'/assets/nlu/logo.png'}];
describe('practice logo picker',()=>{
 it('shows logos for each choice and supports keyboard selection and escape',async()=>{
  const w=mount(PracticePicker,{props:{practices},attachTo:document.body});
  await w.get('[role=combobox]').trigger('keydown',{key:'ArrowDown'});
  expect(w.findAll('[role=option] img')).toHaveLength(2);
  expect(document.activeElement.textContent).toContain('ITSCO');
  await w.get('[role=option]').trigger('keydown',{key:'ArrowDown'});
  expect(document.activeElement.textContent).toContain('Next Level Up');
  await w.findAll('[role=option]')[1].trigger('click');
  expect(w.emitted('update:modelValue')[0]).toEqual(['6']);
  await w.setProps({modelValue:'6'});expect(w.get('[role=combobox] img').attributes('src')).toBe('/assets/nlu/logo.png');
  await w.get('[role=combobox]').trigger('click');await w.get('[role=listbox]').trigger('keydown',{key:'Escape'});
  expect(w.find('[role=listbox]').exists()).toBe(false);w.unmount();
 });
 it('retains a recognizable name if an image fails',async()=>{
  const w=mount(PracticePicker,{props:{practices,modelValue:'2'}});
  await w.get('img').trigger('error');expect(w.text()).toContain('ITSCO');expect(w.find('img').exists()).toBe(false);w.unmount();
 });
});
