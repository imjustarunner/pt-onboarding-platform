import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import api from '../../../services/api';
import DashboardScheduleDialog from '../DashboardScheduleDialog.vue';

vi.mock('../../../services/api', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { organizationSlug: 'agency' } }) }));
const future = new Date(Date.now() + 3600000);
const visit = { appointmentId: 14, title: 'Example Client', timeLabel: '2–3 PM', dateYmd: '2026-11-28' };
const appointment = { id: 14, providerUserId: 7, status: 'scheduled', startAt: future.toISOString(), endAt: new Date(+future + 3600000).toISOString(),
  serviceSetting: { requiresConfirmation: true }, participants: [{ clientId: 11 }], officeEventId: 40 };
let wrapper;
function button(label) { return wrapper.findAll('button').find(node => node.text() === label); }
async function open(item = visit) {
  wrapper = mount(DashboardScheduleDialog, { props: { item, providerId: 7 }, global: { stubs: { RouterLink: true, Teleport: true } } });
  await flushPromises();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('HTMLDialogElement', window.HTMLDialogElement);
  HTMLDialogElement.prototype.showModal ||= function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close ||= function () { this.removeAttribute('open'); };
  api.get.mockResolvedValue({ data: { appointment } });
  api.post.mockResolvedValue({ data: { ok: true } });
});
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals(); });

describe('dashboard schedule details', () => {
  it('records a confirmed conversation after review and refreshes the schedule', async () => {
    await open();
    expect(wrapper.text()).toContain('No RSVP recorded');
    await button('Record confirmation').trigger('click');
    expect(api.post).not.toHaveBeenCalled();
    api.get.mockResolvedValue({ data: { appointment: { ...appointment, status: 'client_confirmed',
      cancellationRecommendationJson: { staffConfirmationRecordedAt: 'recorded' } } } });
    await button('Yes, record confirmation').trigger('click');
    await flushPromises();
    expect(api.post).toHaveBeenCalledWith('/appointments/14/staff-confirmation', { clientConfirmedWithStaff: true }, expect.any(Object));
    expect(wrapper.text()).toContain('Confirmed with staff');
    expect(wrapper.emitted('changed')).toHaveLength(1);
  });

  it('starts the signed cancellation workflow with room release selected', async () => {
    api.get.mockImplementation(async url => ({ data: url.endsWith('/cancellation-options') ? { officeReservationAvailable: true }
      : url.endsWith('/change') ? { workflow: null } : { appointment } }));
    api.post.mockResolvedValue({ data: { preview: {} } });
    await open();
    await button('Cancel & review room release').trigger('click');
    await vi.waitFor(() => expect(button('Continue →').element.disabled).toBe(false));
    await button('Continue →').trigger('click');
    await vi.waitFor(() => expect(wrapper.findAll('[data-cancellation-scope] select')[1].element.value).toBe('release'));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/appointments/14/change/preview', expect.objectContaining({
      eventType: 'canceled', officeReservationDisposition: 'release'
    }), expect.any(Object));
  });

  it('uses the office occupancy endpoint for a standalone reservation', async () => {
    await open({ title: 'Reserved room', endMs: +future, roomReservation: { officeId: 2, eventId: 40, date: '2026-11-28' } });
    await button('Mark room vacant').trigger('click');
    await button('Release room').trigger('click');
    await flushPromises();
    expect(api.get).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledWith('/office-slots/2/events/40/occupancy', { usage: 'vacant', date: '2026-11-28' }, expect.any(Object));
    expect(wrapper.emitted('close')).toHaveLength(1);
  });

  it('keeps reminder history accessible for past appointments', async () => {
    api.get.mockResolvedValue({ data: { appointment: { ...appointment, startAt: '2026-01-01T12:00:00Z', status: 'completed' } } });
    await open();
    expect(wrapper.text()).toContain('Reminders & communication history');
    expect(button('Record confirmation')).toBeUndefined();
    expect(button('Cancel appointment')).toBeUndefined();
  });
});
