import {it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import InterviewSmsConsent from '../InterviewSmsConsent.vue';
it('uses the signed application preference without requesting another interview opt-in',()=>{
 const w=mount(InterviewSmsConsent,{props:{program:{available:true,consentSource:'application'}}});
 expect(w.text()).toContain('reviewed application text preference');expect(w.text()).toContain('email only');expect(w.find('input').exists()).toBe(false);
});
it('discards unsaved legacy verbal choices when switching to the application program',async()=>{
 const w=mount(InterviewSmsConsent,{props:{program:{available:true,script:'Synthetic interview-only script'}}});
 await w.find('input[type=checkbox]').setValue(true);await w.find('input[type=tel]').setValue('2025550101');await w.findAll('input[type=checkbox]')[1].setValue(true);
 expect(w.emitted('update:modelValue').at(-1)[0]).toMatchObject({verbalConsent:true});
 await w.setProps({program:{available:true,consentSource:'application'}});expect(w.emitted('update:modelValue').at(-1)[0]).toBeNull();expect(w.find('input').exists()).toBe(false);
});
