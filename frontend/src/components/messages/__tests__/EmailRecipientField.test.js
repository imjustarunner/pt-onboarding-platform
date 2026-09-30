import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { defineComponent, ref } from 'vue';
import EmailRecipientField from '../EmailRecipientField.vue';
function mountField(initial = '', required = false) {
  return mount(defineComponent({
    components: { EmailRecipientField },
    setup: () => ({ value: ref(initial), required }),
    template: '<form><EmailRecipientField v-model="value" label="To" :required="required" /></form>'
  }));
}
describe('email recipient entry', () => {
  it('adds several recipients with Enter without submitting, and keeps unfinished typing in the draft', async () => {
    const wrapper = mountField(); const input = wrapper.find('input');
    await input.setValue('alice@example.com');
    expect(wrapper.vm.value).toBe('alice@example.com');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.element.dispatchEvent(event); await wrapper.vm.$nextTick();
    expect(event.defaultPrevented).toBe(true);
    expect(wrapper.findAll('.recipient-chip')).toHaveLength(1);
    await input.setValue('bob@example.com'); await wrapper.find('.add-recipient').trigger('click');
    expect(wrapper.vm.value).toBe('alice@example.com, bob@example.com');
    expect(wrapper.findAll('.recipient-chip')).toHaveLength(2);
    expect(input.element.value).toBe(''); wrapper.unmount();
  });
  it('accepts pasted comma, semicolon, newline and space lists, deduplicating case insensitively', async () => {
    const wrapper = mountField('alice@example.com');
    await wrapper.find('input').trigger('paste', { clipboardData: { getData: () => 'ALICE@example.com; bob@example.com\r\ncarol@example.com dave@example.com' } });
    expect(wrapper.vm.value).toBe('alice@example.com, bob@example.com, carol@example.com, dave@example.com');
    expect(wrapper.findAll('.recipient-chip')).toHaveLength(4); wrapper.unmount();
  });
  it('accepts typed separators and Tab, and removes a chosen person', async () => {
    const wrapper = mountField(); const input = wrapper.find('input');
    await input.setValue('alice@example.com;bob@example.com,');
    await input.setValue('carol@example.com'); await input.trigger('keydown', { key: 'Tab' });
    expect(wrapper.vm.value).toBe('alice@example.com, bob@example.com, carol@example.com');
    await wrapper.find('[aria-label="Remove bob@example.com from To"]').trigger('click');
    expect(wrapper.vm.value).toBe('alice@example.com, carol@example.com'); wrapper.unmount();
  });
  it('restores recipients and permits sending when required To has chips but an empty input', async () => {
    const wrapper = mountField('alice@example.com, bob@example.com', true);
    expect(wrapper.findAll('.recipient-chip')).toHaveLength(2);
    expect(wrapper.find('form').element.checkValidity()).toBe(true);
    wrapper.vm.value = 'carol@example.com'; await wrapper.vm.$nextTick();
    expect(wrapper.findAll('.recipient-chip')).toHaveLength(1);
    expect(wrapper.text()).toContain('carol@example.com'); wrapper.unmount();
  });
  it('blocks invalid saved or typed addresses and clears validity after removal', async () => {
    const wrapper = mountField('not-an-email', true); await wrapper.vm.$nextTick();
    expect(wrapper.find('form').element.checkValidity()).toBe(false);
    await wrapper.find('.recipient-chip button').trigger('click');
    expect(wrapper.find('form').element.checkValidity()).toBe(false);
    await wrapper.find('input').setValue('alice@example.com');
    expect(wrapper.find('form').element.checkValidity()).toBe(true);
    await wrapper.find('input').setValue('alice@example.com, invalid');
    expect(wrapper.find('form').element.checkValidity()).toBe(false); wrapper.unmount();
  });
});
