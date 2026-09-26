import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { defineComponent, ref } from 'vue';
import TaxIdInput from '../TaxIdInput.vue';
import { formatTaxId } from '../../../utils/taxId';
describe('tax ID editing', () => {
  it('formats existing undashed values without changing the saved value on render', () => {
    const w=mount(TaxIdInput,{props:{modelValue:'001234567'}});
    expect(w.find('input').element.value).toBe('00-1234567');
    expect(w.emitted('update:modelValue')).toBeUndefined();
  });
  it('accepts paste and edits with leading zeros, and preserves the cursor', async () => {
    const Host=defineComponent({components:{TaxIdInput},setup(){return {value:ref('')};},template:'<TaxIdInput v-model="value" />'});
    const w=mount(Host), input=w.find('input');
    input.element.value='001234567'; input.element.setSelectionRange(9,9); await input.trigger('input');
    expect(input.element.value).toBe('00-1234567');expect(w.vm.value).toBe('001234567');expect(input.element.selectionStart).toBe(10);
    input.element.value='00-9234567';input.element.setSelectionRange(4,4);await input.trigger('input');
    expect(w.vm.value).toBe('009234567');expect(input.element.selectionStart).toBe(4);
  });
  it('reformats when the type changes and rejects incomplete or excess digits', async () => {
    const w=mount(TaxIdInput,{props:{modelValue:'123456789'}});
    await w.setProps({type:'ssn'});expect(w.find('input').element.value).toBe('123-45-6789');
    expect(w.find('input').element.checkValidity()).toBe(true);
    await w.setProps({modelValue:'12345678'});expect(w.find('input').element.checkValidity()).toBe(false);
    await w.setProps({modelValue:'1234567890'});expect(w.find('input').element.checkValidity()).toBe(false);
    expect(formatTaxId('1234567890')).toBe('12-34567890');
  });
});
