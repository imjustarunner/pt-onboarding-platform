import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import Panel from '../GuardianPlanProgressPanel.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
const data = () => ({ hasActivePlan: true, clientType: 'clinical',
  plan: { id: 3, title: 'Care plan', status: 'active', revision: 'version', presentingProblem: 'Family reviewed concerns' },
  goals: [{ id: 4, goalIndex: 1, goalText: 'Coping', objectives: [{ id: 8, objectiveIndex: 1, objectiveText: 'Manage worry', scaleCurrent: 7, scaleTarget: 3,
    canRate: true, familyQuestion: 'Rate your child/dependent’s worry from 1 to 10.', previousOwnRating: { value: 6, ratedAt: '2026-10-01' } }] }],
  ratings: [], acknowledgments: [{ id: 20, status: 'issued' }] });
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: data() }); api.post.mockResolvedValue({ data: {} }); });
it('shows own prior score and submits an individual family observation', async () => {
  const w = mount(Panel, { props: { clientId: 5, agencyId: 2 } }); await flushPromises();
  expect(w.text()).toContain('Your previous rating: 6/10');
  await w.get('.gpp-family-rating select').setValue('5'); await w.get('.gpp-family-rating').trigger('submit'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/guardian-portal/dependents/5/plan-progress/ratings', expect.objectContaining({ agencyId: 2, planId: 3, objectiveId: 8, value: 5, revision: 'version' }));
  w.unmount();
});
it('requires explicit agreement and signer name for the personally addressed request', async () => {
  const w = mount(Panel, { props: { clientId: 5, agencyId: 2 } }); await flushPromises();
  const form = w.findAll('.gpp-review form')[0];
  expect(form.get('button').attributes('disabled')).toBeDefined();
  await form.get('input[type=checkbox]').setValue(true); await form.get('input[type=text]').setValue('Parent One');
  await form.trigger('submit'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/guardian-portal/dependents/5/plan-progress/acknowledgments/20', expect.objectContaining({ agree: true, signedByName: 'Parent One', revision: 'version' }));
  w.unmount();
});
it('does not offer rating controls without a provider-reviewed family question', async () => {
  const response = data(); response.goals[0].objectives[0].canRate = false; response.goals[0].objectives[0].familyQuestion = '';
  api.get.mockResolvedValue({ data: response });
  const w = mount(Panel, { props: { clientId: 5, agencyId: 2 } }); await flushPromises();
  expect(w.find('.gpp-family-rating').exists()).toBe(false); w.unmount();
});
it('uses learning plan actions without displaying clinical scales as tutor mastery', async () => {
  const response = data(); response.clientType = 'learning'; response.plan.kind = 'learning'; response.plan.title = 'Reading plan';
  response.availablePlans = [{ id: 3, title: 'Reading plan' }, { id: 9, title: 'Math plan' }];
  response.goals[0].objectives[0].providerStatus = 'developing'; api.get.mockResolvedValue({ data: response });
  const w = mount(Panel, { props: { clientId: 5, agencyId: 2 } }); await flushPromises();
  expect(w.find('.gpp-scale').exists()).toBe(false); expect(w.text()).toContain('Tutor assessment: developing');
  await w.get('.gpp-family-rating select').setValue('7'); await w.get('.gpp-family-rating').trigger('submit'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ planKind: 'learning', value: 7 }));
  w.unmount();
});
it('clears the first child’s pending signature and scores while another child loads', async () => {
  const w = mount(Panel, { props: { clientId: 5, agencyId: 2 } }); await flushPromises();
  let resolve; api.get.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
  await w.setProps({ clientId: 6 });
  expect(w.text()).not.toContain('Your previous rating'); expect(w.find('input[type=text]').exists()).toBe(false);
  resolve({ data: { hasActivePlan: false } }); await flushPromises(); w.unmount();
});
