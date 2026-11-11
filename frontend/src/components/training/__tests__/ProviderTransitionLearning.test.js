import { mount } from '@vue/test-utils';
import { describe, it, expect } from 'vitest';
import Guide from '../ProviderTransitionLearning.vue';
import content from '../../../content/provider-transition.json';
import { FAMILY_COMMUNICATION_NOTICE } from '../../../navigation/familyCommunicationPolicy';

describe('Provider transition reference', () => {
  it('keeps reference reading separate from assigned training and supports category plus topic search', async () => {
    const wrapper = mount(Guide);
    expect(wrapper.text()).toContain('does not change assigned-course progress');
    expect(wrapper.find('#provider-manual').exists()).toBe(false);
    await wrapper.get('button.primary').trigger('click');
    expect(wrapper.findAll('details')).toHaveLength(content.modules.length);
    await wrapper.get('select').setValue('Communication');
    await wrapper.get('input[type=search]').setValue('Personalize');
    expect(wrapper.findAll('details')).toHaveLength(1);
    expect(wrapper.text()).toContain('Family Welcome & Follow-Up');
    expect(wrapper.emitted('completed')).toBeUndefined();
  });

  it('opens a linked guide and clears temporary practice checks when closed', async () => {
    const wrapper = mount(Guide, { props: { initiallyOpen: true, search: 'group appointment membership' } });
    expect(wrapper.get('#provider-manual').exists()).toBe(true);
    expect(wrapper.findAll('details')).toHaveLength(1);
    expect(wrapper.text()).toContain('live acceptance pending');
    expect(wrapper.text()).toContain(FAMILY_COMMUNICATION_NOTICE.statements[0]);
    expect(wrapper.text()).toContain('250 Unicode characters');
    expect(wrapper.text()).toContain('Edit my comment');
    const checkbox = wrapper.get('input[type=checkbox]');
    await checkbox.setValue(true);
    expect(checkbox.element.checked).toBe(true);
    await wrapper.get('button.primary').trigger('click');
    await wrapper.get('button.primary').trigger('click');
    expect(wrapper.get('input[type=checkbox]').element.checked).toBe(false);
    expect(wrapper.get('a[download]').attributes('href')).toContain('/auricwell/provider-training/');
    expect(wrapper.emitted('completed')).toBeUndefined();
  });

  it('supplies a role-aware exercise and result check for every topic', () => {
    expect(new Set(content.modules.map(m => m.id)).size).toBe(content.modules.length);
    for (const module of content.modules) {
      expect(module.steps.length).toBeGreaterThanOrEqual(4);
      expect(module.practice.length).toBeGreaterThan(50);
      expect(module.check.length).toBeGreaterThan(50);
      expect(module.sources.length).toBeGreaterThan(1);
    }
  });
});
