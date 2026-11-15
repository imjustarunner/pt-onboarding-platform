import { afterEach, describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import ProviderSearchSelect from '../ProviderSearchSelect.vue';

const options = [
  { id: 1, name: 'Alex Rivera', agencies: [{ id: 10, name: 'Inner Strength' }] },
  { id: 2, name: 'Jamie Chen', agencies: [{ id: 20, name: 'Windchime' }] },
  { id: 3, name: 'Morgan Lee', agencies: [{ id: 10, name: 'Inner Strength' }] }
];
let wrapper;
afterEach(() => wrapper?.unmount());

describe('provider assignment search', () => {
  it('searches provider names and agency names and selects with the keyboard', async () => {
    wrapper = mount(ProviderSearchSelect, { props: { options, inputId: 'assignment-provider' } });
    const input = wrapper.get('input');
    expect(input.attributes('id')).toBe('assignment-provider');
    await input.setValue('Inner');
    expect(wrapper.findAll('[role="option"]').map(option => option.text())).toEqual(['Alex RiveraInner Strength', 'Morgan LeeInner Strength']);
    await input.trigger('keydown', { key: 'ArrowDown' });
    expect(input.attributes('aria-activedescendant')).toBe(wrapper.findAll('[role="option"]')[1].attributes('id'));
    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([3]);
    await wrapper.setProps({ modelValue: 3 });
    expect(input.element.value).toBe('Morgan Lee');
    expect(input.attributes('aria-expanded')).toBe('false');
    await input.trigger('focus');
    await input.setValue('Jamie Chen');
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1);
    expect(wrapper.get('[role="option"]').text()).toContain('Windchime');
  });

  it('retains a typed search when clearing a previous selection and reports no matches', async () => {
    wrapper = mount(ProviderSearchSelect, { props: { options, modelValue: 1 } });
    await wrapper.get('input').setValue('Jamie');
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['']);
    await wrapper.setProps({ modelValue: '' });
    expect(wrapper.get('input').element.value).toBe('Jamie');
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1);
    await wrapper.get('input').setValue('Nobody');
    expect(wrapper.get('[role="status"]').text()).toBe('No providers match your search.');
    await wrapper.get('input').trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false);
  });

  it('keeps every provider searchable in a long list and disables loading input', async () => {
    wrapper = mount(ProviderSearchSelect, { props: { options: Array.from({ length: 250 }, (_, index) => ({ id: index + 1, name: `Provider ${index + 1}` })) } });
    await wrapper.get('input').setValue('Provider 250');
    expect(wrapper.findAll('[role="option"]')).toHaveLength(1);
    await wrapper.get('[role="option"]').trigger('click');
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([250]);
    await wrapper.setProps({ loading: true });
    expect(wrapper.get('input').attributes('disabled')).toBeDefined();
  });
});
