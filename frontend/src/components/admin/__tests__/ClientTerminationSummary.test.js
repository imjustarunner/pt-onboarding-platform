import { expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import Summary from '../ClientTerminationSummary.vue';
it('shows the selected historical provider, reason and exact calendar date', () => {
  const wrapper = mount(Summary, { props: { client: { termination_reason: 'Family moved away', termination_last_provider_name: 'Former Provider', termination_effective_date: '2025-03-02T00:00:00.000Z' } } });
  expect(wrapper.text()).toContain('Termination reason: Family moved away');
  expect(wrapper.text()).toContain('Last provider assigned: Former Provider');
  expect(wrapper.text()).toContain('Termination date: Mar 2, 2025');
  wrapper.unmount();
});
it('keeps unknown details separate from the date the action was recorded', () => {
  const wrapper = mount(Summary, { props: { client: { termination_last_provider_name: null, termination_effective_date: null, terminated_at: '2026-11-22T12:00:00Z' } } });
  expect(wrapper.text()).toContain('Last provider assigned: Not recorded');
  expect(wrapper.text()).toContain('Termination date: Not recorded');
  wrapper.unmount();
});
