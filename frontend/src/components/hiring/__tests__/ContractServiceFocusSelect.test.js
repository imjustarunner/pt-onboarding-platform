import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import Select from '../ContractServiceFocusSelect.vue';
import Editor from '../../careers/ContractExpectationsEditor.vue';
import { SERVICE_FOCUS_CATEGORIES } from '../../../constants/serviceFocusCategories.js';

describe('service-focus dropdowns', () => {
  it('offers every baseline service focus even when the API supplies an empty or partial list', async () => {
    const wrapper = mount(Select, { props: { options: [] } });
    const labels = () => wrapper.get('select').findAll('option').map(o => o.text()).slice(1);
    expect(labels()).toEqual(SERVICE_FOCUS_CATEGORIES);
    await wrapper.setProps({ options: ['Office-Based Counseling', 'Community Counseling'] });
    expect(labels()).toEqual([...SERVICE_FOCUS_CATEGORIES, 'Community Counseling']);
    wrapper.unmount();
  });

  it('saves multiple choices, prevents duplicate selections, and supports removing a choice', async () => {
    const wrapper = mount(Select, { props: { modelValue: 'Office-Based Counseling' } });
    await wrapper.get('.contract-focus > button').trigger('click');
    const second = wrapper.get('select[aria-label="Service focus 2"]');
    expect(second.findAll('option').find(o => o.text() === 'Office-Based Counseling').element.disabled).toBe(true);
    await second.setValue('Program Leadership');
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['Office-Based Counseling; Program Leadership']);
    await wrapper.get('button[aria-label="Remove service focus 1"]').trigger('click');
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['Program Leadership']);
    wrapper.unmount();
  });

  it('preserves unlisted legacy values and recognizes old school/office labels', async () => {
    const wrapper = mount(Select, { props: { modelValue: 'School-Based; Community visits' } });
    expect(wrapper.get('select').element.value).toBe('School-Based Counseling');
    expect(wrapper.get('select[aria-label="Service focus 2"]').element.value).toBe('Community visits');
    expect(wrapper.emitted('update:modelValue')).toBeUndefined();
    await wrapper.get('select').setValue('Training and Precepting Support');
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual(['Training and Precepting Support; Community visits']);
    wrapper.unmount();
  });

  it('uses dropdowns in posting defaults and preserves other contract expectations', async () => {
    const wrapper = mount(Editor, { props: { modelValue: { serviceFocus: '', schedule: 'Mondays' } } });
    await wrapper.get('select[aria-label="Service focus 1"]').setValue('Skill Development Coordination');
    expect(wrapper.emitted('update:modelValue').at(-1)).toEqual([{ serviceFocus: 'Skill Development Coordination', schedule: 'Mondays' }]);
    wrapper.unmount();
  });
});
