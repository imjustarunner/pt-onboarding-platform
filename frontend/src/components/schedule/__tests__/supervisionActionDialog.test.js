import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import Dialog from '../SupervisionScheduleActionDialog.vue';
describe('supervision confirmation',()=>{
 it('requires attribution and reason, reviews a future-series cancellation, then submits exactly that scope',async()=>{
  const w=mount(Dialog,{props:{mode:'cancel',name:'Grace',recurring:true,future:true}});
  expect(w.find('footer button').attributes('disabled')).toBeDefined();
  await w.find('input[value="future"]').setValue();await w.find('select').setValue('supervisor');await w.find('textarea').setValue('Supervisor unavailable');
  await w.find('footer button').trigger('click');expect(w.text()).toContain('This and all future sessions');expect(w.text()).toContain('Supervisor unavailable');
  await w.find('footer .btn-danger').trigger('click');expect(w.emitted('confirm')[0][0]).toEqual({scope:'future',reason:'Supervisor unavailable',attribution:'supervisor',notify:true});w.unmount();
 });
 it('makes missed notification explicit, without offering to alter future appointments',async()=>{
  const w=mount(Dialog,{props:{mode:'missed',recurring:true}});expect(w.find('fieldset').exists()).toBe(false);
  await w.find('textarea').setValue('Did not attend');await w.find('footer button').trigger('click');
  expect(w.text()).toContain('Future sessions are unchanged');expect(w.find('footer .btn-danger').text()).toBe('Save missed & notify');w.unmount();
 });
});
