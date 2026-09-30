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
async function confirm() { await wrapper.find('.time').trigger('click'); await wrapper.find('.primary').trigger('click'); await wrapper.get('input[value=adult_self]').setValue(); await wrapper.find('.actions .primary').trigger('click'); await flushPromises(); }
describe('private office check-in', () => {
  it('formats office wall time without shifting for the device timezone', () => {
    expect(formatKioskTime(slot.startAt)).toBe('2:30 PM');
    expect(formatKioskTime('2026-09-29 00:15:00')).toBe('12:15 AM');
    expect(formatKioskTime('2026-09-29 12:00:00')).toBe('12:00 PM');
  });
  it('sends an opaque receipt and respondent type without client identifiers, then resets', async () => {
    api.post.mockResolvedValue({ data: { ok: true, notification: { inApp: true } } });
    await open();
    // A previous arrival is never publicly labeled; retries remain possible.
    expect(wrapper.text()).not.toContain('Checked in');
    expect(wrapper.findAll('input')).toHaveLength(0);
    await confirm();
    expect(api.post).toHaveBeenCalledExactlyOnceWith('/kiosk/3/checkin', { eventId: 9, providerId: 7, submissionKey:expect.any(String),respondentType:'adult_self' });
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
  it('keeps forms open, submits the same receipt, and offers explicit start over',async()=>{
    const form={id:'module:1',title:'Test form',fields:[{id:'a',label:'Test answer',type:'text',required:true}]};
    api.post.mockResolvedValueOnce({data:{ok:true,notification:{inApp:true},submission:{forms:[form]}}}).mockResolvedValueOnce({data:{ok:true}});
    await open();await confirm();expect(wrapper.find('form').exists()).toBe(true);await vi.advanceTimersByTimeAsync(13_000);expect(wrapper.emitted('close')).toBeUndefined();
    await wrapper.get('form input').setValue('Private fixture answer');await wrapper.get('form').trigger('submit');await flushPromises();
    expect(api.post.mock.calls[1][1]).toEqual({submissionKey:api.post.mock.calls[0][1].submissionKey,answers:{'module:1':{a:'Private fixture answer'}}});
    expect(wrapper.text()).toContain('You’re checked in.');expect(wrapper.find('form').exists()).toBe(false);
  });
  it('closes from the explicit Clear selection button',async()=>{await open();await wrapper.get('.start-over').trigger('click');expect(wrapper.emitted('close')).toHaveLength(1);});
  it('clears an abandoned selection after three idle minutes', async () => {
    await open(); await vi.advanceTimersByTimeAsync(181_000); expect(wrapper.emitted('close')).toHaveLength(1);
  });
});
