import {afterEach,describe,it,expect,vi} from 'vitest';
import {mount} from '@vue/test-utils';
import Input from '../FamilyEventTitleInput.vue';
afterEach(()=>vi.useRealTimers());
describe('responsive family event title',()=>{
 it('keeps rapid keystrokes local, avoids native datalist, and bounds suggestions after a pause',async()=>{
  vi.useFakeTimers();const w=mount(Input,{props:{suggestEvents:true}});
  const input=w.find('input');expect(input.attributes('list')).toBeUndefined();expect(w.find('datalist').exists()).toBe(false);
  for(const word of ['s','sc','sch','sche','schee','scheel','scheels']){await input.setValue(word);await vi.advanceTimersByTimeAsync(30);expect(input.element.value).toBe(word);}
  expect(w.emitted('update:modelValue')).toBeUndefined();expect(w.findAll('button')).toHaveLength(0);
  await vi.advanceTimersByTimeAsync(250);
  expect(w.emitted('update:modelValue')).toEqual([['scheels']]);expect(w.text()).toContain('Shopping at SCHEELS');
  await input.setValue('school');await vi.advanceTimersByTimeAsync(250);expect(w.findAll('button')).toHaveLength(6);
  w.unmount();
 });
 it('flushes the latest letters before save or blur without waiting for suggestions',async()=>{
  vi.useFakeTimers();const w=mount(Input);
  await w.find('input').setValue('Immediate save');w.vm.flush();
  expect(w.emitted('update:modelValue')[0]).toEqual(['Immediate save']);
  await w.setProps({modelValue:'Immediate save'});await w.find('input').setValue('Changed');await w.find('input').trigger('blur');
  expect(w.emitted('update:modelValue')[1]).toEqual(['Changed']);w.unmount();
 });
 it('accepts voice/edit updates and discards pending typing when replaced or closed',async()=>{
  vi.useFakeTimers();const w=mount(Input);
  await w.find('input').setValue('Pending');await w.setProps({modelValue:'Voice draft'});await vi.advanceTimersByTimeAsync(300);
  expect(w.find('input').element.value).toBe('Voice draft');expect(w.emitted('update:modelValue')).toBeUndefined();
  await w.find('input').setValue('Closed draft');w.unmount();await vi.advanceTimersByTimeAsync(300);expect(w.emitted('update:modelValue')).toBeUndefined();
 });
 it('selects a suggested title without submitting the form',async()=>{
  vi.useFakeTimers();const w=mount(Input,{props:{suggestEvents:true}});
  await w.find('input').setValue('scheels');await vi.advanceTimersByTimeAsync(300);
  expect(w.find('button').attributes('type')).toBe('button');await w.find('button').trigger('click');
  expect(w.find('input').element.value).toBe('Shopping at SCHEELS');expect(w.emitted('update:modelValue').at(-1)).toEqual(['Shopping at SCHEELS']);expect(w.findAll('button')).toHaveLength(0);w.unmount();
 });
});
