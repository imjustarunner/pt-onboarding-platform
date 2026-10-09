import {describe,it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import HiringNotificationChoices from '../HiringNotificationChoices.vue';
const context={available:true,disclosureHash:'hash',disclosure:{text:'Hiring texts are optional.',termsUrl:'https://example.org/terms',privacyUrl:'https://example.org/privacy'}};
describe('hiring notification choice',()=>{
 it('defaults to email only without assuming a phone number is consent',()=>{
  const w=mount(HiringNotificationChoices,{props:{context,phone:'7195550123',showSave:true}});
  expect(w.find('input[value=email]').element.checked).toBe(true);
  expect(w.find('input[value=email_sms]').element.checked).toBe(false);
  expect(w.findAll('input[type=checkbox]')).toHaveLength(0);
  expect(w.emitted('update:modelValue')[0][0]).toMatchObject({channel:'email',authorityAccepted:false,electronicSignatureAccepted:false});
 });
 it('requires fresh signed choices before saving email and text',async()=>{
  const w=mount(HiringNotificationChoices,{props:{context,showSave:true,phone:'7195550123'}});
  await w.find('input[value=email_sms]').setValue();
  expect(w.find('button').element.disabled).toBe(true);
  await w.find('input[autocomplete=name]').setValue('Taylor Example');
  for(const checkbox of w.findAll('input[type=checkbox]'))await checkbox.setValue(true);
  await w.find('button').trigger('click');
  expect(w.emitted('save')[0][0]).toMatchObject({channel:'email_sms',disclosureHash:'hash',signerName:'Taylor Example',authorityAccepted:true,electronicSignatureAccepted:true});
  await w.setProps({context:{...context,disclosureHash:'new'}});
  expect(w.find('button').element.disabled).toBe(true);
 });
 it('allows email when no registered program is ready',async()=>{
  const w=mount(HiringNotificationChoices,{props:{context:{available:false},showSave:true}});
  expect(w.find('input[value=email_sms]').element.disabled).toBe(true);
  await w.find('button').trigger('click');expect(w.emitted('save')[0][0].channel).toBe('email');
 });
});
