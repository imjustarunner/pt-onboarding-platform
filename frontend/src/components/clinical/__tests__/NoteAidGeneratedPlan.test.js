import { it, expect, vi } from 'vitest';
import { shallowMount, flushPromises } from '@vue/test-utils';
import Review from '../NoteAidTreatmentPlanImportReview.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { post: vi.fn(), get: vi.fn() } }));

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
  expect(state.aiContentUsed).toBe(true);
  await state.save({ finalize: true });
  expect(api.post).not.toHaveBeenCalled();
  state.attestAiReviewed = true;
  vi.mocked(api.post).mockResolvedValue({ data: { plan: { id: 55, status: 'active', ...plan } } });
  await state.save({ finalize: true });
  expect(api.post).toHaveBeenCalledWith('/medical-billing/treatment-plans', expect.objectContaining({
    title: 'Intake-generated Treatment Plan', sourceToolId: 'note_aid_intake_generated', effectiveDate: '2026-08-20',
    status: 'active', diagnoses: [expect.objectContaining({ icd10Code: 'F42.9', justification: 'Updated formulation.' })],
    goals: [expect.objectContaining({ projectedCompletion: '2027-02-20', objectives: [expect.objectContaining({ scaleCurrent: 4, scaleTarget: 8, interventions: ['Skills rehearsal'] })] })]
  }));
  expect(wrapper.emitted('saved')[0][0].id).toBe(55);
  wrapper.unmount();
});
