import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import InsuranceVerificationGate from '../InsuranceVerificationGate.vue';
import AssignmentCoverageReview from '../AssignmentCoverageReview.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../AssignmentCoverageReview.vue', () => ({ default: { props: ['clientId', 'agencyId'], emits: ['saved', 'updated'], template: '<div data-testid="coverage-review">Review {{ clientId }} / {{ agencyId }}<input aria-label="Draft reference" /></div>' } }));
const open = (clientId = 22) => window.dispatchEvent(new CustomEvent('pt:insurance-verification-required', { detail: { clientId, agencyId: 450, message: 'Verify coverage before assigning this client.' } }));
const button = text => [...document.querySelectorAll('button')].find(b => b.textContent === text);
beforeEach(() => { vi.resetAllMocks(); api.get.mockResolvedValue({ data: { canVerify: true, ready: false } }); });
afterEach(() => { document.body.innerHTML = ''; });

it('offers the focused review and returns to the preserved assignment without replaying it', async () => {
  const original = document.createElement('button'); original.textContent = 'Assign provider'; document.body.append(original); original.focus();
  const w = mount(InsuranceVerificationGate, { attachTo: document.body }); open(); await flushPromises();
  expect(document.querySelector('[role=dialog]').textContent).toContain('Review 22 / 450');
  expect(document.activeElement).toBe(document.querySelector('[role=dialog]'));
  api.get.mockResolvedValue({ data: { canVerify: true, ready: true, required: true } });
  w.findComponent(AssignmentCoverageReview).vm.$emit('saved'); await flushPromises();
  expect(document.body.textContent).toContain('Coverage is verified');
  expect(document.body.textContent).toContain('has not been saved yet');
  expect(document.querySelector('[data-testid=coverage-review]')).toBeNull();
  button('Return to provider assignment').click(); await flushPromises();
  expect(document.querySelector('[role=dialog]')).toBeNull(); expect(document.activeElement).toBe(original);
  expect(api.post).not.toHaveBeenCalled(); w.unmount();
});

it('keeps unsaved review input mounted during rechecks and recoverable network failures', async () => {
  const w = mount(InsuranceVerificationGate, { attachTo: document.body }); open(); await flushPromises();
  const originalInput = document.querySelector('[aria-label="Draft reference"]'); originalInput.value = 'Draft portal evidence';
  let finish; api.get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  button('Recheck verification').click(); await flushPromises();
  expect(document.querySelector('[aria-label="Draft reference"]')).toBe(originalInput);
  finish({ data: { canVerify: true, ready: false, reason: 'Coverage still needs review.' } }); await flushPromises();
  expect(document.querySelector('[aria-label="Draft reference"]').value).toBe('Draft portal evidence');
  api.get.mockRejectedValue(new Error('Offline')); button('Recheck verification').click(); await flushPromises();
  expect(document.querySelector('[aria-label="Draft reference"]')).toBe(originalInput);
  expect(document.body.textContent).toContain('could not be checked'); w.unmount();
});

it('gives nonbilling users a clear stopped request and no private review', async () => {
  api.get.mockResolvedValue({ data: { canVerify: false, ready: false } });
  const w = mount(InsuranceVerificationGate, { attachTo: document.body }); open(); await flushPromises();
  expect(document.body.textContent).toContain('Your assignment or Exchange request has not been saved');
  expect(document.querySelector('[data-testid=coverage-review]')).toBeNull(); expect(api.post).not.toHaveBeenCalled(); w.unmount();
});

it('clears revoked access and discards earlier clients’ replies', async () => {
  let old; api.get.mockImplementationOnce(() => new Promise(resolve => { old = resolve; }));
  const w = mount(InsuranceVerificationGate, { attachTo: document.body }); open(22); await flushPromises(); open(23); await flushPromises();
  expect(document.body.textContent).toContain('Review 23 / 450'); old({ data: { canVerify: false, ready: false } }); await flushPromises();
  expect(document.body.textContent).toContain('Review 23 / 450');
  api.get.mockRejectedValue({ response: { status: 403, data: { error: { message: 'Access denied' } } } });
  button('Recheck verification').click(); await flushPromises();
  expect(document.body.textContent).toContain('Access denied'); expect(document.querySelector('[data-testid=coverage-review]')).toBeNull(); w.unmount();
});

it('does not describe an explicit self-pay choice as insurance verified', async () => {
  api.get.mockResolvedValue({ data: { canVerify: true, ready: true, required: false, selfPay: true } });
  const w = mount(InsuranceVerificationGate, { attachTo: document.body }); open(); await flushPromises();
  expect(document.body.textContent).toContain('Insurance verification is not required'); expect(document.body.textContent).not.toContain('Coverage is verified'); w.unmount();
});

it('ignores invalid requests and restores focus on Escape', async () => {
  const original = document.createElement('button'); original.textContent = 'Assign'; document.body.append(original); original.focus();
  const w = mount(InsuranceVerificationGate, { attachTo: document.body }); open(-1); await flushPromises(); expect(api.get).not.toHaveBeenCalled();
  open(); await flushPromises(); document.querySelector('[role=dialog]').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await flushPromises();
  expect(document.querySelector('[role=dialog]')).toBeNull(); expect(document.activeElement).toBe(original); w.unmount();
});
