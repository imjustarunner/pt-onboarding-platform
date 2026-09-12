import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
const state = vi.hoisted(() => ({ user: null, rows: [] }));
vi.mock('../../store/auth', () => ({ useAuthStore: () => ({ get user() { return state.user; } }) }));
vi.mock('../../store/agency', () => ({ useAgencyStore: () => ({ agencies: [{ id: 1, name: 'Test organization' }] }) }));
vi.mock('../../services/api.js', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
import api from '../../services/api.js';
import Queue from '../../components/schedule/AppointmentWaiverReviewQueue.vue';
const pending = { appointment_id: 10, client_name: 'Synthetic Client', requested_by_name: 'Test Provider', request_reason: 'family_emergency', status: 'pending', start_at: '2026-09-12 17:00:00' };
beforeEach(() => {
  vi.clearAllMocks(); state.user = { id: 9, role: 'provider', billingAgencyIds: [1] }; state.rows = [{ ...pending }];
  api.get.mockImplementation(async (url) => ({ data: url.includes('/waiver-reviews') ? { reviews: state.rows, hasMore: false } : { workflow: { narrative: 'Original signed nonbillable note.', preview: { consequence: { model: 'package' } } } } }));
  api.post.mockResolvedValue({ data: { ok: true } });
});
async function open() {
  const wrapper = mount(Queue, { props: { agencyIds: [1] } }); await flushPromises();
  await wrapper.find('.queue-toggle').trigger('click'); await flushPromises();
  return wrapper;
}
const button = (w, label) => w.findAll('button').find((b) => b.text() === label);
describe('waiver review queue', () => {
  it('keeps the queue and its financial requests hidden from providers without billing access', async () => {
    state.user.billingAgencyIds = [];
    const wrapper = mount(Queue, { props: { agencyIds: [1] } }); await flushPromises();
    expect(wrapper.find('section').exists()).toBe(false); expect(api.get).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it('allows a provider with the additional billing permission to review and sign an approval', async () => {
    const wrapper = await open(); await button(wrapper, 'Review').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('Original signed nonbillable note.');
    expect(button(wrapper, 'Approve waiver & sign').attributes('disabled')).toBeDefined();
    await wrapper.find('textarea').setValue('Emergency verified'); await wrapper.find('input[type="checkbox"]').setValue(true);
    await button(wrapper, 'Approve waiver & sign').trigger('click'); await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/appointments/10/change/waiver-decision', { decision: 'approved', reason: 'Emergency verified', signatureConfirmed: true });
    expect(wrapper.emitted('reviewed')).toEqual([[10]]); wrapper.unmount();
  });
  it('reloads a partially saved decision and offers documentation recovery instead of another decision', async () => {
    const wrapper = await open(); await button(wrapper, 'Review').trigger('click'); await flushPromises();
    await wrapper.find('textarea').setValue('Emergency verified'); await wrapper.find('input[type="checkbox"]').setValue(true);
    api.post.mockImplementationOnce(async () => {
      state.rows = [{ ...pending, status: 'documenting', decision: 'approved', decision_reason: 'Emergency verified' }];
      throw new Error('Clinical storage unavailable');
    });
    await button(wrapper, 'Approve waiver & sign').trigger('click'); await flushPromises();
    expect(wrapper.text()).toContain('Finish saving approved decision'); expect(button(wrapper, 'Deny waiver & sign')).toBeUndefined();
    expect(wrapper.find('textarea').element.value).toBe('Emergency verified'); expect(wrapper.find('textarea').attributes('disabled')).toBeDefined();
    wrapper.unmount();
  });
});
