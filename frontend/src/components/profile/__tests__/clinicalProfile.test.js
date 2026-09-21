// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import ClinicalMultiSelect from '../ClinicalMultiSelect.vue';
import HireClinicalProfile from '../../prehire/HireClinicalProfile.vue';
import { SPECIALTIES, CLIENT_AGES, POPULATIONS, THERAPY_APPROACHES } from '../../../constants/providerClinicalTaxonomy.js';
const step = () => ({ fields: [
  { key: 'specialties_general', label: 'Specialties', options: SPECIALTIES },
  { key: 'age_specialty', label: 'Client Ages', options: CLIENT_AGES },
  { key: 'groups', label: 'Populations Served', options: POPULATIONS },
  { key: 'modality', label: 'Therapy Approaches', options: THERAPY_APPROACHES }
], values: { specialties_general: ['Anxiety'], age_specialty: [], groups: [], modality: ['Play Therapy'] } });
describe('clinical profile choices', () => {
  it('searches without losing selections and allows removing a hidden selection', async () => {
    const wrapper = mount(ClinicalMultiSelect, { props: { label: 'Specialties', options: SPECIALTIES, modelValue: ['Anxiety'] } });
    await wrapper.get('input[type=search]').setValue('executive');
    expect(wrapper.findAll('.choice')).toHaveLength(1);
    expect(wrapper.get('.selected-values').text()).toContain('Anxiety');
    await wrapper.get('.choice input').setValue(true);
    expect(wrapper.emitted('update:modelValue')[0][0]).toEqual(['Anxiety', 'Executive Functioning']);
    await wrapper.get('button[aria-label="Remove Anxiety"]').trigger('click');
    expect(wrapper.emitted('update:modelValue')[1][0]).toEqual([]);
    wrapper.unmount();
  });
  it('saves all four categories and permits deliberate empty selections', async () => {
    const wrapper = mount(HireClinicalProfile, { props: { step: step() } });
    expect(wrapper.findAll('fieldset')).toHaveLength(4);
    expect(wrapper.get('button[type=submit]').attributes('disabled')).toBeDefined();
    await wrapper.get('button[aria-label="Remove Anxiety"]').trigger('click');
    await wrapper.get('.reviewed input').setValue(true);
    await wrapper.get('form').trigger('submit');
    expect(wrapper.emitted('save')[0][0]).toEqual({ values: { ...step().values, specialties_general: [] }, reviewed: true, complete: true });
    await wrapper.get('.form-actions button[type=button]').trigger('click');
    expect(wrapper.emitted('save')[1][0].complete).toBe(false);
    wrapper.unmount();
  });
  it('keeps unsaved edits when portal data refreshes and displays historical text safely', async () => {
    const data = step();
    const wrapper = mount(HireClinicalProfile, { props: { step: { ...data, reviewNeeded: [{ value: '<script>old narrative</script>' }] } } });
    await wrapper.get('button[aria-label="Remove Anxiety"]').trigger('click');
    await wrapper.setProps({ step: { ...data, values: { ...data.values, specialties_general: ['Stress'] } } });
    expect(wrapper.find('button[aria-label="Remove Stress"]').exists()).toBe(false);
    expect(wrapper.find('script').exists()).toBe(false);
    wrapper.unmount();
  });
  it('renders completed packages as read-only saved selections', () => {
    const wrapper = mount(HireClinicalProfile, { props: { step: step(), readonly: true } });
    expect(wrapper.findAll('input, button')).toHaveLength(0);
    expect(wrapper.text()).toContain('Anxiety');
    expect(wrapper.text()).toContain('Play Therapy');
    wrapper.unmount();
  });
});
