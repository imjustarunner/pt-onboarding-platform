import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import ReferralTotalsButton from '../ReferralTotalsButton.vue';
import api from '../../../services/api';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn() } }));

const period = { start: '2026-11-09', end: '2026-11-15', paper: 16, online: 5, total: 21 };
const report = {
  timezone: 'America/Denver', refreshedAt: '2026-11-14T01:56:00Z', today: '2026-11-13', selectedYear: 2026, years: [2026, 2025],
  currentWeek: period, currentMonth: { ...period, total: 40 }, yearTotal: { ...period, total: 100 },
  weekly: [period, { start: '2026-11-02', end: '2026-11-08', paper: 0, online: 0, total: 0 }],
  monthly: [{ start: '2026-11-01', end: '2026-11-30', paper: 30, online: 10, total: 40 }]
};
let wrapper;
beforeEach(() => {
  vi.resetAllMocks(); api.get.mockResolvedValue({ data: report });
  HTMLDialogElement.prototype.showModal = vi.fn(function () { this.open = true; });
  HTMLDialogElement.prototype.close = vi.fn(function () { this.open = false; this.dispatchEvent(new Event('close')); });
});
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });
const render = async () => { wrapper = mount(ReferralTotalsButton, { props: { agencyId: 2 } }); await flushPromises(); };

it('shows the prominent weekly total with paper and online counts and opens history', async () => {
  await render();
  expect(wrapper.find('.referral-total').text()).toBe('21');
  expect(wrapper.find('.referral-breakdown').text()).toContain('Paper 16');
  expect(wrapper.find('.referral-breakdown').text()).toContain('Online 5');
  expect(api.get).toHaveBeenCalledWith('/dashboard/referral-totals', expect.objectContaining({ params: { agencyId: 2 } }));
  await wrapper.find('.referral-button').trigger('click');
  expect(wrapper.find('dialog').element.open).toBe(true);
  expect(wrapper.findAll('tbody tr')).toHaveLength(2);
  expect(wrapper.find('tbody tr').text()).toContain('so far');
  expect(wrapper.findAll('tbody tr')[1].text()).toContain('0');
  await wrapper.find('.referral-close').trigger('click');
  expect(wrapper.find('dialog').element.open).toBe(false);
});

it('switches weekly/monthly history and fetches a selected year', async () => {
  await render();
  await wrapper.findAll('.referral-period-switch button')[1].trigger('click');
  expect(wrapper.find('caption').text()).toBe('Monthly referrals · 2026');
  expect(wrapper.find('tbody th').text()).toContain('November');
  expect(wrapper.findAll('tbody tr')).toHaveLength(1);
  api.get.mockResolvedValueOnce({ data: { ...report, selectedYear: 2025 } });
  await wrapper.find('select').setValue(2025);
  await flushPromises();
  expect(api.get.mock.lastCall[1].params).toEqual({ agencyId: 2, year: 2025 });
  expect(wrapper.find('caption').text()).toContain('2025');
  expect(wrapper.find('.referral-total').text()).toBe('21');
});

it('shows errors instead of a false zero and can retry', async () => {
  api.get.mockRejectedValueOnce(new Error('offline'));
  await render();
  expect(wrapper.find('.referral-total').text()).toBe('—');
  expect(wrapper.find('.referral-button').attributes('disabled')).toBeDefined();
  expect(wrapper.find('[role="alert"]').text()).toContain('Unable to load');
  await wrapper.find('.referral-error button').trigger('click');
  await flushPromises();
  expect(wrapper.find('.referral-total').text()).toBe('21');
});

it('discards stale responses after switching agencies and closes the prior history', async () => {
  let finishOld;
  api.get.mockReturnValueOnce(new Promise(resolve => { finishOld = resolve; }));
  wrapper = mount(ReferralTotalsButton, { props: { agencyId: 2 } });
  await wrapper.setProps({ agencyId: 3 });
  await flushPromises();
  finishOld({ data: { ...report, currentWeek: { ...period, total: 999 } } });
  await flushPromises();
  expect(wrapper.find('.referral-total').text()).toBe('21');
  await wrapper.find('.referral-button').trigger('click');
  await wrapper.setProps({ agencyId: 4 });
  expect(wrapper.find('dialog').element.open).toBe(false);
});

it('exports the displayed periods as a CSV', async () => {
  const createObjectURL = vi.fn().mockReturnValue('blob:referrals');
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL: vi.fn() });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await render();
  const csv = wrapper.findAll('.referral-controls > button').find(button => button.text() === 'Export CSV');
  await csv.trigger('click');
  expect(createObjectURL).toHaveBeenCalledOnce();
  expect(click).toHaveBeenCalledOnce();
  click.mockRestore();
});
