import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import Review from '../AssignmentCoverageReview.vue';
import ClientInsuranceEditor from '../ClientInsuranceEditor.vue';
import api from '../../../services/api.js';

vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../ClientInsuranceEditor.vue', () => ({ default: { props: { clientId: [Number, String], agencyId: [Number, String], assignmentReview: Boolean, startOpen: Boolean }, emits: ['saved'], template: '<div data-testid="insurance-details-editor">Insurance details</div>' } }));
const response = () => ({
  insuranceSummary: { patientName: 'DEMO QA Child', primary: { insurerName: 'Health First Colorado', memberId: 'DEMO123' }, secondary: null, hasMedicaidCoverage: true },
  reviewToken: 'coverage-snapshot-1', readyForAssignmentReview: true, missingAssignmentFields: [],
  review: { status: 'unresolved' }, admission: { ready: false }
});
async function setup(data = response()) { api.get.mockResolvedValue({ data }); const w = mount(Review, { props: { clientId: 22, agencyId: 450 } }); await flushPromises(); return w; }
async function fill(w) { await w.get('select').setValue('payer_portal'); await w.get('textarea').setValue('Portal active today; checked other coverage and payer order.'); await w.get('input[type=checkbox]').setValue(true); }
beforeEach(() => { vi.resetAllMocks(); api.post.mockResolvedValue({ data: { id: 18, status: 'verified', admission: { ready: true } } }); });

it('shows only the saved policy summary and requires a new explicit coverage attestation', async () => {
  const w = await setup();
  expect(api.get).toHaveBeenCalledWith('/medical-billing/clients/22/coverage', { params: { agencyId: 450, serviceDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), forAssignment: true }, skipGlobalLoading: true });
  expect(w.text()).toContain('DEMO QA Child'); expect(w.text()).toContain('Health First Colorado');
  expect(w.find('input[type=checkbox]').element.checked).toBe(false); expect(w.get('select').element.value).toBe('');
  expect(w.find('[data-testid="insurance-details-editor"]').exists()).toBe(false);
  expect(w.text()).not.toContain('Documentation outcome'); expect(w.text()).not.toContain('Billing office Select');
  expect(w.get('.verify-button').attributes('disabled')).toBeDefined(); expect(api.post).not.toHaveBeenCalled(); w.unmount();
});

it('records the displayed snapshot and all explicitly attested Medicaid checks without claim setup fields', async () => {
  const w = await setup(); await fill(w); await w.get('form').trigger('submit'); await flushPromises();
  expect(api.post).toHaveBeenCalledWith('/medical-billing/clients/22/coverage/review', {
    agencyId: 450, serviceDate: expect.any(String), assignmentReview: true, reviewToken: 'coverage-snapshot-1', status: 'verified', source: 'payer_portal',
    reference: 'Portal active today; checked other coverage and payer order.', primaryChecked: true, secondaryChecked: false,
    otherCoverageChecked: true, orderConfirmed: true, medicaidTplChecked: true
  }, { skipGlobalLoading: true });
  expect(api.post.mock.calls[0][1]).not.toHaveProperty('billingOfficeId'); expect(api.post.mock.calls[0][1]).not.toHaveProperty('payerId');
  expect(w.emitted('saved')).toHaveLength(1); expect(w.text()).toContain('Coverage verification saved'); expect(w.find('form').exists()).toBe(false); w.unmount();
});

it('requires applicable secondary coverage and does not attest Medicaid for non-Medicaid policies', async () => {
  const data = response(); data.insuranceSummary = { patientName: 'DEMO QA Adult', primary: { insurerName: 'Primary demo', memberId: 'ONE' }, secondary: { insurerName: 'Secondary demo', memberId: 'TWO' }, hasMedicaidCoverage: false };
  const w = await setup(data); expect(w.text()).toContain('Secondary demo'); expect(w.text()).not.toContain('Other Insurance / TPL');
  await fill(w); await w.get('select').setValue('payer_phone'); await w.get('form').trigger('submit'); await flushPromises();
  expect(api.post.mock.calls[0][1]).toMatchObject({ secondaryChecked: true, medicaidTplChecked: false, source: 'payer_phone' }); w.unmount();
});

it('cannot post without the source, concise evidence, explicit attestation and current saved coverage', async () => {
  const w = await setup(); await w.get('form').trigger('submit'); await flushPromises(); expect(api.post).not.toHaveBeenCalled();
  await w.get('select').setValue('payer_phone'); await w.get('textarea').setValue('abcd'); await w.get('input[type=checkbox]').setValue(true);
  await w.get('form').trigger('submit'); expect(api.post).not.toHaveBeenCalled();
  api.get.mockResolvedValue({ data: { ...response(), readyForAssignmentReview: false, missingAssignmentFields: ['Secondary coverage member ID is missing'] } });
  await w.findAll('button').find(b => b.text() === 'Reload saved coverage').trigger('click'); await flushPromises(); await fill(w);
  expect(w.text()).toContain('Secondary coverage member ID is missing'); expect(w.get('.verify-button').attributes('disabled')).toBeDefined();
  await w.get('form').trigger('submit'); expect(api.post).not.toHaveBeenCalled(); w.unmount();
});

it('keeps failed review evidence visible and forces a reload/re-attestation when the snapshot changed', async () => {
  api.post.mockRejectedValue({ response: { status: 409, data: { error: { code: 'COVERAGE_REVIEW_STALE', message: 'Coverage changed. Reload and review the current policy.' } } } });
  const w = await setup(); await fill(w); await w.get('form').trigger('submit'); await flushPromises();
  expect(w.get('textarea').element.value).toContain('Portal active'); expect(w.get('input[type=checkbox]').element.checked).toBe(false);
  expect(w.get('.verify-button').attributes('disabled')).toBeDefined(); expect(w.emitted('saved')).toBeUndefined();
  api.get.mockResolvedValue({ data: { ...response(), reviewToken: 'new-token' } });
  await w.findAll('button').find(b => b.text() === 'Reload saved coverage').trigger('click'); await flushPromises();
  expect(w.get('textarea').element.value).toBe(''); expect(w.get('select').element.value).toBe(''); expect(w.get('input[type=checkbox]').element.checked).toBe(false); w.unmount();
});

it('does not send a duplicate review while the first save is in flight', async () => {
  let finish; api.post.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const w = await setup(); await fill(w); await w.get('form').trigger('submit'); await w.get('form').trigger('submit');
  expect(api.post).toHaveBeenCalledTimes(1); finish({ data: { id: 18, status: 'verified' } }); await flushPromises(); expect(w.emitted('saved')).toHaveLength(1); w.unmount();
});

it('reloads and clears attestation after an explicit insurance correction without mounting unrelated review forms', async () => {
  const w = await setup(); await fill(w);
  await w.findAll('button').find(b => b.text() === 'Edit saved insurance details').trigger('click');
  const editor = w.findComponent(ClientInsuranceEditor); expect(editor.props()).toMatchObject({ clientId: 22, agencyId: 450, assignmentReview: true, startOpen: true });
  api.get.mockResolvedValue({ data: { ...response(), reviewToken: 'updated-policy' } });
  editor.vm.$emit('saved'); await flushPromises();
  expect(w.findComponent(ClientInsuranceEditor).exists()).toBe(false); expect(w.get('input[type=checkbox]').element.checked).toBe(false);
  expect(w.emitted('updated')).toHaveLength(1); expect(api.post).not.toHaveBeenCalled(); w.unmount();
});

it('discards late reads and does not retain another client’s policy or attestation', async () => {
  let finish; api.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const w = mount(Review, { props: { clientId: 22, agencyId: 450 } });
  api.get.mockResolvedValue({ data: { ...response(), insuranceSummary: { primary: { insurerName: 'New client policy', memberId: 'NEW' } } } });
  await w.setProps({ clientId: 23 }); await flushPromises(); finish({ data: response() }); await flushPromises();
  expect(w.text()).toContain('New client policy'); expect(w.text()).not.toContain('DEMO QA Child');
  expect(w.get('input[type=checkbox]').element.checked).toBe(false); w.unmount();
});
