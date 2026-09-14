import { it, expect, vi, beforeEach } from 'vitest';
import { mount, shallowMount, flushPromises } from '@vue/test-utils';
import Review from '../NoteAidTreatmentPlanImportReview.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { post: vi.fn(), get: vi.fn() } }));
beforeEach(() => vi.resetAllMocks());

it('reviews generated objective scores and persists an intake-generated plan with diagnosis and interventions', async () => {
  const plan = {
    title: 'Intake-generated Treatment Plan', sourceToolId: 'note_aid_intake_generated', aiGenerated: true,
    effectiveDate: '2026-08-20', presentingProblem: 'Difficulty coping.', prescribedFrequency: 'Weekly', dischargePlan: 'Sustained independent coping.',
    diagnosticJustification: 'Updated formulation.', diagnoses: [{ icd10Code: 'F42.9', description: 'Synthetic diagnosis', isPrimary: true }],
    goals: [{ goalText: 'Improve coping.', durationMonths: 6, objectives: [{ objectiveText: 'Current baseline is a 4, with a target of 8.', interventions: ['Skills rehearsal'] }] }]
  };
  const wrapper = shallowMount(Review, { props: { open: false, agencyId: 7, clientId: 202, mode: 'generated', initialPlan: plan } });
  await wrapper.setProps({ open: true });
  await flushPromises();
  const state = wrapper.vm.$.setupState;
  expect(state.model.goals[0].objectives[0]).toMatchObject({ scaleCurrent: 4, scaleTarget: 8, scaleDirection: 'increase' });
  state.model.goals[0].durationMonths = 8;
  state.onGoalDurationChange(state.model.goals[0]);
  expect(state.model.goals[0].objectives[0].objectiveText).toContain('Within 8 months');
  expect(state.aiContentUsed).toBe(true);
  await state.save({ finalize: true });
  expect(api.post).not.toHaveBeenCalled();
  state.attestAiReviewed = true;
  vi.mocked(api.post).mockResolvedValue({ data: { plan: { id: 55, status: 'active', ...plan } } });
  await state.save({ finalize: true });
  expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-plans', expect.objectContaining({
    title: 'Intake-generated Treatment Plan', sourceToolId: 'note_aid_intake_generated', effectiveDate: '2026-08-20',
    status: 'active', diagnoses: [expect.objectContaining({ icd10Code: 'F42.9', justification: 'Updated formulation.' })],
    goals: [expect.objectContaining({ projectedCompletion: '2027-04-20', objectives: [expect.objectContaining({ objectiveText: expect.stringContaining('Within 8 months'), scaleCurrent: 4, scaleTarget: 8, interventions: ['Skills rehearsal'] })] })]
  }));
  expect(wrapper.emitted('saved')[0][0].id).toBe(55);
  wrapper.unmount();
});

it('selects shared and custom interventions and saves corrected decreasing scores', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { all: ['Agency intervention', 'Personal intervention'] } });
  const plan = {
    sourceToolId: 'note_aid_intake_generated', aiGenerated: true, effectiveDate: '2026-08-20',
    diagnoses: [{ icd10Code: 'F42.9', description: 'Revised formulation', isPrimary: true }],
    goals: [{ goalText: 'Revised focus', durationMonths: 6, objectives: [{
      objectiveText: 'Within 6 months, reduce time worrying from 2 hours to 30 minutes. The client currently rates their coping as an 8 on a 10-point scale, where 10 represents severe difficulty and 1 represents none. Reduce this self-reported rating to a 3 or lower.',
      interventions: ['Previously selected custom intervention']
    }] }]
  };
  const wrapper = mount(Review, { props: { open: false, agencyId: 7, clientId: 202, mode: 'generated', initialPlan: plan } });
  await wrapper.setProps({ open: true });
  await flushPromises();
  const state = wrapper.vm.$.setupState;
  const objective = state.model.goals[0].objectives[0];
  expect(objective).toMatchObject({ scaleCurrent: 8, scaleTarget: 3, scaleDirection: 'decrease', scaleNeedsRewrite: false });
  expect(wrapper.text()).not.toContain('not on a clear');
  expect(api.get).toHaveBeenCalledWith('/medical-billing/interventions', expect.objectContaining({ params: { agencyId: 7 } }));
  const picker = wrapper.find('.intervention-picker');
  for (const name of ['Active Listening', 'Agency intervention', 'Personal intervention', 'Previously selected custom intervention']) {
    expect(picker.text()).toContain(name);
  }
  const active = picker.findAll('label').find((label) => label.text().trim() === 'Active Listening');
  await active.find('input').setValue(true);
  expect(objective.interventions).toEqual(['Previously selected custom intervention', 'Active Listening']);
  await picker.find('input[placeholder="Intervention name"]').setValue('New personal technique');
  vi.mocked(api.post).mockResolvedValueOnce({ data: { all: ['New personal technique'] } });
  await picker.find('button').trigger('click');
  await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/interventions', { agencyId: 7, scope: 'user', names: ['New personal technique'] }, { skipGlobalLoading: true });
  expect(objective.interventions).toContain('New personal technique');
  state.attestAiReviewed = true;
  vi.mocked(api.post).mockResolvedValueOnce({ data: { plan: { id: 56 } } });
  await state.save({ finalize: false });
  expect(api.post).toHaveBeenLastCalledWith('/medical-billing/treatment-plans', expect.objectContaining({
    effectiveDate: '2026-08-20', goals: [expect.objectContaining({ objectives: [expect.objectContaining({ scaleCurrent: 8, scaleTarget: 3, scaleDirection: 'decrease', interventions: ['Previously selected custom intervention', 'Active Listening', 'New personal technique'] })] })]
  }));
  wrapper.unmount();
});
