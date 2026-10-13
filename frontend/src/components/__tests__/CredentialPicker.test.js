import {it,expect} from 'vitest';
import {mount} from '@vue/test-utils';
import {defineComponent,ref} from 'vue';
import Picker from '../CredentialPicker.vue';
it('adds distinct credentials individually, reorders and removes them',async()=>{
 const Host=defineComponent({components:{Picker},setup(){return{value:ref('MA')}},template:'<Picker v-model="value" />'});
 const w=mount(Host);
 await w.get('select').setValue('LPCC');
 expect(w.text()).toContain('Display: MA, LPCC');
 expect(w.find('option[value=MA]').exists()).toBe(false);
 await w.get('[aria-label="Move LPCC earlier"]').trigger('click');
 expect(w.text()).toContain('Display: LPCC, MA');
 await w.get('[aria-label="Remove MA"]').trigger('click');
 expect(w.vm.value).toBe('LPCC');
 expect(w.find('input').exists()).toBe(false);
});
it('shows an existing unknown credential for correction rather than silently erasing it',()=>{
 const w=mount(Picker,{props:{modelValue:'Custom-old'}});
 expect(w.text()).toContain('Custom-old');expect(w.text()).toContain('Choose a listed credential');
});
it('lets a provider restore LPSC alongside existing degrees and licenses',async()=>{
 const Host=defineComponent({components:{Picker},setup(){return{value:ref('MA, LPC')}},template:'<Picker v-model="value" />'});
 const w=mount(Host);
 await w.get('select').setValue('LPSC');
 expect(w.vm.value).toBe('MA, LPC, LPSC');
 expect(w.text()).toContain('Display: MA, LPC, LPSC');
 expect(w.text()).not.toContain('Choose a listed credential');
 await w.get('[aria-label="Move LPSC earlier"]').trigger('click');
 expect(w.vm.value).toBe('MA, LPSC, LPC');
});
