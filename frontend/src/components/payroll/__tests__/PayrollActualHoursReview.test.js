import { beforeEach, expect, it, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
vi.mock('../../../services/api.js', () => ({ default: { get: vi.fn(), put: vi.fn() } }));
import api from '../../../services/api.js';
import Review from '../PayrollActualHoursReview.vue';
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ data: { review: null, summaryFingerprint: 'abc', current: false, locked: false } }); api.put.mockResolvedValue({ data: {} }); });
it('starts with missing hours blank and submits an explicitly reviewed zero with concurrency tokens', async () => {
  const wrapper = mount(Review, { props: { periodId: 10, userId: 7 } }); await flushPromises();
  const inputs = wrapper.findAll('input'); expect(inputs[0].element.value).toBe('');
  await inputs[0].setValue('0'); await inputs[2].setValue('Daily time report 100');
  await wrapper.get('textarea').setValue('Verified no work occurred in this period.'); await inputs[3].setValue(true);
  await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(api.put).toHaveBeenCalledWith('/payroll/periods/10/actual-hours/7', expect.objectContaining({ actualWorkedHours: 0, attested: true, expectedReviewId: null, expectedSummaryFingerprint: 'abc' }));
  expect(wrapper.emitted('saved')).toHaveLength(1);
  expect(wrapper.text()).toContain('does not certify minimum wage or overtime'); wrapper.unmount();
});
it('shows posted reviews read-only and cannot submit changes', async () => {
  api.get.mockResolvedValue({ data: { locked: true, current: true, summaryFingerprint: 'abc', review: { id: 4, actual_worked_hours: 1, statutory_sick_basis_hours: 1, source_reference: 'Daily source', reconciliation_note: 'Reviewed entries.' } } });
  const wrapper = mount(Review, { props: { periodId: 10, userId: 7 } }); await flushPromises();
  expect(wrapper.find('button').exists()).toBe(false); expect(wrapper.findAll('input').every(input => input.element.disabled)).toBe(true);
  await wrapper.get('form').trigger('submit'); expect(api.put).not.toHaveBeenCalled(); wrapper.unmount();
});
it('surfaces a stale-review rejection instead of claiming the review saved', async () => {
  api.put.mockRejectedValue({ response: { data: { error: { message: 'The payroll calculation changed. Reload the worksheet.' } } } });
  const wrapper = mount(Review, { props: { periodId: 10, userId: 7 } }); await flushPromises();
  await wrapper.find('input[type="checkbox"]').setValue(true); await wrapper.get('form').trigger('submit'); await flushPromises();
  expect(wrapper.text()).toContain('payroll calculation changed'); expect(wrapper.emitted('saved')).toBeUndefined(); wrapper.unmount();
});
