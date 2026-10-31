import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Panel from '../AppointmentClinicalPanel.vue';

it('shows chart context and directs documentation to the single Session note source', async () => {
  const wrapper = mount(Panel, { props: {
    clinicalSessionId: 167,
    diagnoses: [{ id: 1, icd10_code: 'F41.9', description: 'Synthetic example' }],
    latestPlan: { id: 5, status: 'active', goals: [{ goal_text: 'Practice coping skills', objectives: [{ objective_text: 'Identify two skills' }] }] }
  } });
  expect(wrapper.text()).toContain('F41.9');
  expect(wrapper.text()).toContain('Practice coping skills');
  expect(wrapper.text()).toContain('Identify two skills');
  expect(wrapper.find('textarea').exists()).toBe(false);
  expect(wrapper.find('select').exists()).toBe(false);
  await wrapper.findAll('button').find(button => button.text() === 'Open Session note').trigger('click');
  expect(wrapper.emitted('open-session-note')).toHaveLength(1);
  await wrapper.findAll('button').find(button => button.text() === 'Open treatment plan').trigger('click');
  expect(wrapper.emitted('open-treatment-plan')).toHaveLength(1);
  expect(wrapper.emitted('open-billing')).toBeUndefined();
  wrapper.unmount();
});

it('retains the canonical full-note action and handles an empty chart', async () => {
  const wrapper = mount(Panel, { props: { clinicalSessionId: 167 } });
  expect(wrapper.text()).toContain('No treatment plan on file');
  expect(wrapper.text()).toContain('No active diagnoses');
  await wrapper.findAll('button').find(button => button.text() === 'Open clinical note').trigger('click');
  expect(wrapper.emitted('open-note')).toHaveLength(1);
  wrapper.unmount();
});
