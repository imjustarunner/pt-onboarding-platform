import { it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Frequency from '../NoteAidFrequencySelect.vue';
import Interventions from '../NoteAidInterventionPicker.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

it('selects defaults, preserves imported values, and persists personal frequency additions', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { all: ['Every six weeks'] } });
  const wrapper = mount(Frequency, { props: { agencyId: 7, modelValue: 'Every ten days', 'onUpdate:modelValue': (value) => wrapper.setProps({ modelValue: value }) } });
  await flushPromises();
  expect(wrapper.find('select').element.value).toBe('Every ten days');
  for (const option of ['Twice per week', 'Weekly', 'Biweekly (every two weeks)', 'Monthly', 'Every six weeks']) expect(wrapper.text()).toContain(option);
  await wrapper.find('select').setValue('Weekly');
  expect(wrapper.props('modelValue')).toBe('Weekly');
  await wrapper.find('select').setValue('__custom__');
  await wrapper.find('input').setValue('Three times per week');
  vi.mocked(api.post).mockResolvedValue({ data: { all: ['Three times per week'] } });
  await wrapper.find('button').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-frequencies', { agencyId: 7, name: 'Three times per week' }, { skipGlobalLoading: true });
  expect(wrapper.find('select').element.value).toBe('Three times per week');
  expect(wrapper.find('input').exists()).toBe(false);
  wrapper.unmount();
});

it('keeps a custom frequency in the plan when saving the personal option fails', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { all: [] } });
  vi.mocked(api.post).mockRejectedValue(new Error('unavailable'));
  const wrapper = mount(Frequency, { props: { agencyId: 7, modelValue: 'Every ten days' } });
  await wrapper.find('select').setValue('__custom__');
  await wrapper.find('button').trigger('click');
  await flushPromises();
  expect(wrapper.find('input').element.value).toBe('Every ten days');
  expect(wrapper.text()).toContain('Could not add this frequency');
  wrapper.unmount();
});

it('offers AI interventions for the specific goal/objective and adds them only after review', async () => {
  vi.mocked(api.post).mockResolvedValue({ data: { interventions: ['Mindfulness Training', 'Cognitive Refocusing'] } });
  const wrapper = mount(Interventions, { props: { agencyId: 7, modelValue: ['Active Listening'], goalText: 'Manage worry', objectiveText: 'Reduce worry from 8 to 3.', 'onUpdate:modelValue': (value) => wrapper.setProps({ modelValue: value }) } });
  await wrapper.findAll('button').find((button) => button.text().includes('Recommend interventions')).trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-plans/recommend-interventions', { agencyId: 7, goalText: 'Manage worry', objectiveText: 'Reduce worry from 8 to 3.' }, expect.any(Object));
  expect(wrapper.props('modelValue')).toEqual(['Active Listening']);
  await wrapper.findAll('button').find((button) => button.text() === 'Select recommended interventions').trigger('click');
  expect(wrapper.props('modelValue')).toEqual(['Active Listening', 'Mindfulness Training', 'Cognitive Refocusing']);
  expect(wrapper.emitted('ai-used')).toHaveLength(1);
  wrapper.unmount();
});

it('discards a late AI recommendation after the objective changes', async () => {
  let resolve;
  vi.mocked(api.post).mockImplementation(() => new Promise((done) => { resolve = done; }));
  const wrapper = mount(Interventions, { props: { agencyId: 7, goalText: 'Manage worry', objectiveText: 'Worry less.' } });
  await wrapper.find('button').trigger('click');
  await wrapper.setProps({ objectiveText: 'Improve communication.' });
  resolve({ data: { interventions: ['Mindfulness Training'] } });
  await flushPromises();
  expect(wrapper.find('.recommendations').exists()).toBe(false);
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
  wrapper.unmount();
});
