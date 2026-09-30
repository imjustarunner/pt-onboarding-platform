import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const mocks = vi.hoisted(() => ({ post: vi.fn(), patch: vi.fn() }));
vi.mock('../../../../services/api', () => ({ default: mocks }));
import Panel from '../ClientEhrBringUpToDatePanel.vue';
const mountPanel = initialTexts => mount(Panel, { props: { open: true, clientId: 12, agencyId: 2, creationFlow: true, initialTexts }, global: { stubs: { NoteAidTreatmentPlanImportReview: true, Teleport: true } } });
beforeEach(() => { vi.clearAllMocks(); mocks.patch.mockResolvedValue({ data: {} }); });
it('imports supplied demographics and signals completion for the saved client', async () => {
  mocks.post.mockResolvedValue({ data: { parsed: { fullName: 'Synthetic Client' } } });
  const wrapper = mountPanel({ demographics: 'Legal Name: Synthetic Client' }); await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/clients/12/demographics/import', expect.objectContaining({ demographics: expect.objectContaining({ fullName: 'Synthetic Client' }) }), expect.anything());
  expect(wrapper.emitted('imported')).toHaveLength(1);
  expect(wrapper.findAll('button').some(b => b.text() === 'Mark done')).toBe(false);
  expect(mocks.post.mock.calls.some(([url]) => url.endsWith('/note-aid-setup-complete'))).toBe(false);
  wrapper.unmount();
});
it('does not finish or import a plan when intake fails, and retries without repeating successful demographics', async () => {
  let failIntake = true;
  mocks.post.mockImplementation(async url => {
    if (url.endsWith('/intake-note/import')) {
      if (failIntake) throw new Error('Unavailable');
      return { data: { draft: { id: 5, confirmedDiagnosis: { code: 'F41.1' }, sections: [{ key: 'Presenting Problem', body: 'Concern' }] } } };
    }
    if (url === '/medical-billing/treatment-plans/parse') return { data: { parsed: { presentingProblem: 'Concern', goals: [] } } };
    return { data: { parsed: { fullName: 'Synthetic Client' } } };
  });
  const wrapper = mountPanel({ demographics: 'Legal Name: Synthetic Client', intake: 'Presenting Problem: Concern', plan: 'Plan needing review' });
  await flushPromises(); expect(wrapper.emitted('imported')).toBeUndefined();
  expect(mocks.post.mock.calls.some(([url]) => url === '/medical-billing/treatment-plans/parse')).toBe(false);
  failIntake = false;
  await wrapper.findAll('button').find(b => b.text() === 'Import pasted chart content').trigger('click'); await flushPromises();
  expect(mocks.post.mock.calls.filter(([url]) => url.endsWith('/demographics/import'))).toHaveLength(1);
  expect(wrapper.emitted('imported')).toBeUndefined();
  const review = wrapper.findComponent({ name: 'NoteAidTreatmentPlanImportReview' });
  expect(review.exists()).toBe(true);
  review.vm.$emit('saved'); await flushPromises();
  expect(wrapper.emitted('imported')).toHaveLength(1);
  wrapper.unmount();
});
it('reuses an imported intake draft when finalization needs a retry', async () => {
  let failFinalize = true;
  mocks.post.mockImplementation(async url => {
    if (url.endsWith('/intake-note/import')) return { data: { draft: { id: 5, confirmedDiagnosis: { code: 'F41.1' }, sections: [{ key: 'Presenting Problem', body: 'Concern' }] } } };
    if (url.endsWith('/finalize') && failFinalize) throw new Error('Unavailable');
    return { data: {} };
  });
  const wrapper = mountPanel({ intake: 'Presenting Problem: Concern' }); await flushPromises();
  expect(wrapper.emitted('imported')).toBeUndefined(); failFinalize = false;
  await wrapper.findAll('button').find(b => b.text() === 'Import pasted chart content').trigger('click'); await flushPromises();
  expect(mocks.post.mock.calls.filter(([url]) => url.endsWith('/intake-note/import'))).toHaveLength(1);
  expect(wrapper.emitted('imported')).toHaveLength(1); wrapper.unmount();
});
it('preserves an intake without a diagnosis without falsely finalizing clinical setup', async () => {
  mocks.post.mockResolvedValue({ data: { draft: { id: 5, status: 'diagnosis_pending', sections: [{ key: 'Presenting Problem', body: 'Concern' }] } } });
  const wrapper = mountPanel({ intake: 'Presenting Problem: Concern' }); await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/clients/12/intake-note/import', expect.objectContaining({ sessionContext: { source: 'client_creation_record_import' } }), expect.anything());
  expect(mocks.post.mock.calls.some(([url]) => url.endsWith('/finalize') || url.endsWith('/note-aid-setup-complete'))).toBe(false);
  expect(wrapper.text()).toContain('clinical review remains pending');
  expect(wrapper.emitted('imported')).toHaveLength(1); wrapper.unmount();
});
it('saves a plan without a finalized intake for review and allows new-client completion', async () => {
  mocks.post.mockImplementation(async (url, payload) => {
    if (url.endsWith('/parse')) return { data: { parsed: { presentingProblem: 'Latest concern', dischargePlan: 'After goals met', goals: [{ goalText: 'Goal', objectives: [{ objectiveText: 'Objective', scaleCurrent: 3, scaleTarget: 8 }] }] } } };
    if (url === '/medical-billing/treatment-plans' && payload.finalize) throw { response: { data: { error: { code: 'intake_not_finalized' } } } };
    return { data: { plan: { id: 6, status: 'draft' } } };
  });
  const wrapper = mountPanel({ plan: 'Most recent plan' }); await flushPromises();
  expect(mocks.post).toHaveBeenCalledWith('/medical-billing/treatment-plans', expect.objectContaining({ status: 'draft', finalize: false, sourceToolId: 'client_creation_record_import', presentingProblem: 'Latest concern' }), expect.anything());
  expect(mocks.post.mock.calls.some(([url]) => url.endsWith('/note-aid-setup-complete'))).toBe(false);
  expect(wrapper.emitted('imported')).toHaveLength(1); wrapper.unmount();
});
