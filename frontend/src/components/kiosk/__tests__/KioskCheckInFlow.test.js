import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import KioskCheckInFlow from '../KioskCheckInFlow.vue';
import { formatKioskTime } from '../../../utils/kioskTime';
vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
import api from '../../../services/api';
const provider = { id: 7, firstName: 'Jordan', lastName: 'Rivera' };
const slot = { eventId: 9, startAt: '2026-09-29 14:30:00', roomNumber: '204', alreadyCheckedIn: true };
let wrapper;
beforeEach(() => { vi.useFakeTimers(); vi.resetAllMocks(); api.get.mockResolvedValue({ data: { slots: [slot] } }); });
afterEach(() => { wrapper?.unmount(); vi.useRealTimers(); });
async function open() { wrapper = mount(KioskCheckInFlow, { props: { provider, locationId: 3 } }); await flushPromises(); }
async function confirm() { await wrapper.find('.time').trigger('click'); await wrapper.find('.primary').trigger('click'); await wrapper.find('.actions .primary').trigger('click'); await flushPromises(); }
describe('private office check-in', () => {
  it('formats office wall time without shifting for the device timezone', () => {
    expect(formatKioskTime(slot.startAt)).toBe('2:30 PM');
    expect(formatKioskTime('2026-09-29 00:15:00')).toBe('12:15 AM');
    expect(formatKioskTime('2026-09-29 12:00:00')).toBe('12:00 PM');
  });
  it('sends only the appointment and provider and resets after success', async () => {
    api.post.mockResolvedValue({ data: { ok: true, notification: { inApp: true } } });
    await open();
    // A previous arrival is never publicly labeled; retries remain possible.
    expect(wrapper.text()).not.toContain('Checked in');
    expect(wrapper.findAll('input')).toHaveLength(0);
    await confirm();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/kiosk/3/checkin', { eventId: 9, providerId: 7 });
    expect(api.get).toHaveBeenCalledTimes(1); // No clinical information loaded on the shared tablet.
    expect(wrapper.text()).toContain('You’re checked in.');
    await vi.advanceTimersByTimeAsync(12_000);
    expect(wrapper.emitted('close')).toHaveLength(1);
  });
  it('keeps a failed check-in visible and does not claim notification success', async () => {
    api.post.mockRejectedValue({ response: { data: { error: { message: 'This appointment has changed.' } } } });
    await open(); await confirm();
    expect(wrapper.get('[role="alert"]').text()).toContain('This appointment has changed.');
    expect(wrapper.text()).not.toContain('You’re checked in.');
  });
  it('distinguishes a loading failure from an empty schedule and offers retry', async () => {
    api.get.mockRejectedValueOnce(new Error('offline')); await open();
    expect(wrapper.get('[role="alert"]').text()).toContain('couldn’t load');
    await wrapper.get('.state button').trigger('click'); await flushPromises();
    expect(wrapper.findAll('.time')).toHaveLength(1);
  });
  it('clears an abandoned selection after 90 seconds', async () => {
    await open(); await vi.advanceTimersByTimeAsync(91_000); expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
