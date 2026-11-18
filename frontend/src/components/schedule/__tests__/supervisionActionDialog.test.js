import {describe,it,expect,afterEach} from 'vitest';
import {mount} from '@vue/test-utils';
import Dialog from '../SupervisionScheduleActionDialog.vue';
const render=props=>mount(Dialog,{props,global:{stubs:{Teleport:true}}});
afterEach(()=>{document.body.innerHTML='';});
describe('supervision confirmation',()=>{
 it('requires attribution and reason, reviews a future-series cancellation, then submits exactly that scope',async()=>{
  const w=render({mode:'cancel',name:'Grace',recurring:true,future:true});
  expect(w.find('footer button').attributes('disabled')).toBeUndefined();
  await w.find('footer button').trigger('click');
  expect(w.find('[role="alert"]').text()).toContain('Complete the highlighted fields');
  expect(w.find('select').attributes('aria-invalid')).toBe('true');
  expect(w.find('textarea').attributes('aria-invalid')).toBe('true');
  expect(w.emitted('confirm')).toBeUndefined();
  await w.find('input[value="future"]').setValue();await w.find('select').setValue('supervisor');await w.find('textarea').setValue('Supervisor unavailable');
  await w.find('footer button').trigger('click');expect(w.text()).toContain('This and all future sessions');expect(w.text()).toContain('Supervisor unavailable');
  await w.find('footer .btn-danger').trigger('click');expect(w.emitted('confirm')[0][0]).toEqual({scope:'future',reason:'Supervisor unavailable',attribution:'supervisor',notify:true});w.unmount();
 });
 it('makes missed notification explicit, without offering to alter future appointments',async()=>{
  const w=render({mode:'missed',recurring:true});expect(w.find('fieldset').exists()).toBe(false);
  await w.find('textarea').setValue('Did not attend');await w.find('footer button').trigger('click');
  expect(w.text()).toContain('Future sessions are unchanged');expect(w.find('footer .btn-danger').text()).toBe('Save missed & notify');w.unmount();
 });
 it('explains and focuses the missing party after a reason is entered',async()=>{
  const w=mount(Dialog,{attachTo:document.body,props:{mode:'cancel'}});
  const dialog=document.querySelector('[role="dialog"]');
  expect(dialog).not.toBeNull();
  const textarea=dialog.querySelector('textarea');textarea.value='Scheduling conflict';textarea.dispatchEvent(new Event('input',{bubbles:true}));
  await w.vm.$nextTick();dialog.querySelector('footer button').click();await w.vm.$nextTick();await w.vm.$nextTick();
  expect(document.activeElement).toBe(dialog.querySelector('select'));
  expect(dialog.querySelector('select').getAttribute('aria-describedby')).toBe('supervision-attribution-error');
  expect(dialog.querySelector('textarea').hasAttribute('aria-invalid')).toBe(false);
  expect(w.emitted('confirm')).toBeUndefined();w.unmount();
 });
 it('prevents duplicate submission while saving and keeps the server failure visible',async()=>{
  const w=render({mode:'cancel'});
  await w.find('select').setValue('supervisor');await w.find('textarea').setValue('Unavailable');await w.find('footer button').trigger('click');
  await w.setProps({busy:true,error:'The cancellation could not be saved.'});
  expect(w.find('footer .btn-danger').attributes('disabled')).toBeDefined();
  expect(w.find('[role="alert"]').text()).toContain('could not be saved');
  await w.find('footer .btn-danger').trigger('click');expect(w.emitted('confirm')).toBeUndefined();w.unmount();
 });
 it('can render inside the fullscreen calendar and returns keyboard focus on close',async()=>{
  const opener=document.createElement('button');document.body.append(opener);opener.focus();
  const target=document.createElement('div');document.body.append(target);
  const w=mount(Dialog,{props:{mode:'cancel',teleportTo:target},attachTo:document.body});
  const dialog=target.querySelector('[role="dialog"]');expect(dialog).not.toBeNull();
  dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));expect(w.emitted('close')).toHaveLength(1);
  w.unmount();expect(document.activeElement).toBe(opener);
 });
});
