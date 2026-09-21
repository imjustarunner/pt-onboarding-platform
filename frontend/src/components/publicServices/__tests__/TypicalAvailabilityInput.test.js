import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Input from '../TypicalAvailabilityInput.vue';

describe('typical in-office availability choices', () => {
  it('combines broad hours and specific days while preserving saved descriptions', async () => {
    const wrapper = mount(Input, { props: { modelValue: 'By arrangement', 'onUpdate:modelValue': value => wrapper.setProps({ modelValue: value }) } });
    await wrapper.find('input[aria-label="Thursday afternoons"]').setValue(true);
    await wrapper.findAll('label').find(label => label.text() === 'Weekends').find('input').setValue(true);
    expect(wrapper.props('modelValue')).toBe('By arrangement, Thursday afternoons, Weekends');
    await wrapper.findAll('.saved-times input')[0].setValue(false);
    expect(wrapper.props('modelValue')).toBe('Thursday afternoons, Weekends');
    await wrapper.setProps({ disabled: true });
    expect(wrapper.find('fieldset').attributes()).toHaveProperty('disabled');
    wrapper.unmount();
  });
});
