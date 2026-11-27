import { it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Frequency from '../NoteAidFrequencySelect.vue';
import Interventions from '../NoteAidInterventionPicker.vue';
import PlanEditor from '../NoteAidTreatmentPlanImportReview.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
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
  await wrapper.get('button[aria-label="Recommend interventions"]').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-plans/recommend-interventions', { agencyId: 7, goalText: 'Manage worry', objectiveText: 'Reduce worry from 8 to 3.' }, expect.any(Object));
  expect(wrapper.props('modelValue')).toEqual(['Active Listening']);
  for (const choice of wrapper.findAll('.recommendations input')) await choice.setValue(true);
  await wrapper.findAll('button').find((button) => button.text() === 'Select recommended interventions').trigger('click');
  expect(wrapper.props('modelValue')).toEqual(['Active Listening', 'Mindfulness Training', 'Cognitive Refocusing']);
  expect(wrapper.emitted('ai-used')).toHaveLength(1);
  wrapper.unmount();
});

it('explains when the recommended interventions are already selected', async () => {
  vi.mocked(api.post).mockResolvedValue({ data: { interventions: ['Mindfulness Training'] } });
  const wrapper = mount(Interventions, { props: { agencyId: 7, modelValue: ['Mindfulness training'],
    goalText: 'Manage worry', objectiveText: 'Worry less.' } });
  await wrapper.get('button[aria-label="Recommend interventions"]').trigger('click');
  await flushPromises();
  expect(wrapper.get('[role=status]').text()).toBe('The recommended interventions are already selected.');
  expect(wrapper.emitted('update:modelValue')).toBeUndefined();
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

it('accepts a generated goal, treats an edited baseline as provider review, and signs the full-page plan', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { all: [] } });
  const plan = {
    title: 'Initial treatment plan', effectiveDate: '2026-09-05', aiGenerated: true,
    presentingProblem: 'Fictional sleep concern.', prescribedFrequency: 'Weekly',
    dischargePlan: 'Conditional on clinician review: Continue the established routine independently.',
    diagnoses: [{ icd10Code: 'F99', description: 'Synthetic diagnosis', justification: 'Fictional clinical justification.', isPrimary: true }],
    goals: [{ goalText: 'Clinician-reviewable priority: Establish a sleep routine', durationMonths: 3, objectives: [
      { objectiveText: 'Use a consistent evening routine.', scaleCurrent: 3, scaleTarget: 7, scaleDirection: 'increase' },
      { objectiveText: 'Record sleep quality each morning.', scaleCurrent: 3, scaleTarget: 6, scaleDirection: 'increase' }
    ] }]
  };
  vi.mocked(api.post).mockResolvedValue({ data: { plan: { id: 18 }, providerApproval: { providerApproved: true } } });
  const wrapper = mount(PlanEditor, { props: { open: true, fullPage: true, agencyId: 7, clientId: 9,
    mode: 'generated', sourceIntakeNoteId: 12, initialPlan: plan } });
  await flushPromises();
  const button = label => wrapper.findAll('button').find(item => item.text() === label);
  expect(button('Save draft')).toBeDefined();
  expect(wrapper.findAll('textarea').map(field => field.element.value).join(' ')).not.toMatch(/clinician-reviewable priority|conditional on clinician review/i);
  await button('Sign treatment plan').trigger('click');
  expect(api.post).not.toHaveBeenCalled();
  expect(wrapper.text()).toContain('Accept, edit, or remove goal 1.');
  await button('Accept goal').trigger('click');
  await wrapper.get('input[id$="-baseline"]').setValue(4);
  expect(wrapper.findAll('button').filter(item => item.text() === 'Accept objective')).toHaveLength(1);
  await button('Accept objective').trigger('click');
  await button('Sign treatment plan').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-plans', expect.objectContaining({
    sourceIntakeNoteId: 12, signPlan: true,
    goals: [expect.objectContaining({ reviewStatus: 'accepted', objectives: [
      expect.objectContaining({ scaleCurrent: 4, reviewStatus: 'edited' }),
      expect.objectContaining({ reviewStatus: 'accepted' })
    ] })]
  }));
  expect(wrapper.emitted('saved')?.[0]?.[1]).toMatchObject({ approval: { providerApproved: true } });
  wrapper.unmount();
});


it('focuses the first missing field in reading order and keeps later issues visible', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { all: [] } });
  const wrapper = mount(PlanEditor, { attachTo: document.body, props: {
    open: true, fullPage: true, agencyId: 7, clientId: 9, mode: 'generated',
    initialPlan: {
      effectiveDate: '2026-11-24', presentingProblem: 'Synthetic concern', dischargePlan: 'Synthetic discharge review.',
      diagnoses: [{ icd10Code: 'F99', justification: 'Synthetic justification', isPrimary: true }],
      goals: [
        { goalText: 'First goal', objectives: [] },
        { goalText: 'Second goal', durationMonths: 3, objectives: [{ objectiveText: 'Practice a routine.' }] }
      ]
    }
  } });
  try {
    await flushPromises();
    await wrapper.findAll('button').find(button => button.text() === 'Sign treatment plan').trigger('click');
    expect(document.activeElement).toBe(wrapper.get('select[aria-label="Duration for goal 1"]').element);
    expect(wrapper.get('[role="alert"]').text()).toContain('Select or enter the prescribed frequency.');
    expect(api.post).not.toHaveBeenCalled();
  } finally { wrapper.unmount(); }
});


const completePlan = {
  id: 55, status: 'draft', effectiveDate: '2026-11-24', presentingProblem: 'Synthetic concern.',
  prescribedFrequency: 'Weekly', dischargePlan: 'Use the agreed routine independently.',
  diagnoses: [{ icd10Code: 'F99', description: 'Synthetic diagnosis', justification: 'Synthetic justification.', isPrimary: true }],
  goals: [{ goalText: 'Practice a routine', durationMonths: 3, objectives: [
    { objectiveText: 'Practice the routine.', scaleCurrent: 2, scaleTarget: 7, scaleDirection: 'increase' },
    { objectiveText: 'Record when the routine was used.', scaleCurrent: 3, scaleTarget: 6, scaleDirection: 'increase' }
  ] }]
};
const planProps = { open: true, fullPage: true, agencyId: 7, clientId: 9, mode: 'generated', initialPlan: completePlan };

async function startGoalSuggestion(wrapper) {
  await wrapper.get('[aria-label="Add goal with Narriva"]').trigger('click');
  await wrapper.get('.na-plan-action-form textarea').setValue('Practice an additional routine.');
  await wrapper.get('.na-plan-action-form').trigger('submit');
}

it('signs a complete plan while suggestions are pending and discards their late response', async () => {
  let finishSuggestion;
  vi.mocked(api.get).mockResolvedValue({ data: { all: [] } });
  vi.mocked(api.post).mockImplementation(url => url.endsWith('narriva-suggestions')
    ? new Promise(resolve => { finishSuggestion = resolve; })
    : Promise.resolve({ data: { plan: { id: 55 }, providerApproval: { providerApproved: true } } }));
  const wrapper = mount(PlanEditor, { props: planProps });
  try {
    await flushPromises();
    await startGoalSuggestion(wrapper);
    const signal = api.post.mock.calls.find(([url]) => url.endsWith('narriva-suggestions'))[2].signal;
    const sign = wrapper.findAll('button').find(button => button.text() === 'Sign treatment plan');
    expect(sign.element.disabled).toBe(false);
    await sign.trigger('click');
    await flushPromises();
    expect(signal.aborted).toBe(true);
    expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-plans', expect.objectContaining({ signPlan: true }));
    finishSuggestion({ data: { proposal: { goals: [{ ref: '1', goalText: 'Late suggestion' }] } } });
    await flushPromises();
    expect(wrapper.text()).not.toContain('Late suggestion');
    expect(wrapper.text()).not.toContain('Preparing suggestions');
  } finally { wrapper.unmount(); }
});

it('releases a hung suggestions request and lets the provider retry', async () => {
  vi.useFakeTimers();
  vi.mocked(api.get).mockResolvedValue({ data: { all: [] } });
  vi.mocked(api.post).mockImplementation(() => new Promise(() => {}));
  const wrapper = mount(PlanEditor, { props: planProps });
  try {
    await flushPromises();
    await startGoalSuggestion(wrapper);
    await vi.advanceTimersByTimeAsync(60000);
    await flushPromises();
    expect(wrapper.text()).toContain('Narriva took too long to respond');
    expect(wrapper.get('.na-plan-action-form button[type="submit"]').element.disabled).toBe(false);
  } finally { wrapper.unmount(); vi.useRealTimers(); }
});

it('keeps edits after failed persistence and auto-saves the next edit to the encrypted chart-draft endpoint', async () => {
  vi.useFakeTimers();
  vi.mocked(api.get).mockResolvedValue({ data: { all: [] } });
  vi.mocked(api.put).mockRejectedValueOnce(new Error('Storage unavailable')).mockResolvedValue({ data: { revision: 2 } });
  const wrapper = mount(PlanEditor, { props: { ...planProps, initialPlan: { ...completePlan, chartDraft: { revision: 1 } } } });
  try {
    await flushPromises();
    const presenting = wrapper.get('textarea[id$="-presenting-problem"]');
    await presenting.setValue('Retained concern');
    await vi.advanceTimersByTimeAsync(1800);
    await flushPromises();
    expect(wrapper.text()).toContain('Storage unavailable');
    expect(presenting.element.value).toBe('Retained concern');
    await presenting.setValue('Retained concern, updated.');
    await vi.advanceTimersByTimeAsync(1800);
    await flushPromises();
    expect(api.put).toHaveBeenLastCalledWith('/medical-billing/treatment-plans/55/chart-draft',
      expect.objectContaining({ revision: 1, draft: expect.objectContaining({ presentingProblem: 'Retained concern, updated.' }) }),
      { skipGlobalLoading: true });
    expect(wrapper.text()).toContain('Draft saved.');
  } finally { wrapper.unmount(); vi.useRealTimers(); }
});
