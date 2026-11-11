import { afterEach, expect, it, vi } from 'vitest';
import { notifyCompanyEventRsvpChanged, onCompanyEventRsvpChanged } from '../companyEventRsvpEvents';
const cleanup = [];
afterEach(() => { cleanup.splice(0).forEach(stop => stop()); });
it('updates dashboard subscribers and invalidates the schedule after a saved RSVP', () => {
  const dashboard = vi.fn(), schedule = vi.fn();
  cleanup.push(onCompanyEventRsvpChanged(dashboard));
  window.addEventListener('pt-schedule-refresh', schedule);
  cleanup.push(() => window.removeEventListener('pt-schedule-refresh', schedule));
  notifyCompanyEventRsvpChanged({ eventId: '42', agencyId: 2, response: 'NO', privateToken: 'never-broadcast' });
  expect(dashboard).toHaveBeenCalledWith({ eventId: 42, agencyId: 2, response: 'no' });
  expect(schedule).toHaveBeenCalledOnce();
  expect(schedule.mock.calls[0][0].detail).toEqual({ eventId: 42, agencyId: 2, response: 'no', reason: 'company-event-rsvp-changed' });
});
it('stops updates on unmount and ignores malformed messages', () => {
  const listener = vi.fn(), stop = onCompanyEventRsvpChanged(listener);
  for (const value of [{ eventId: -1, response: 'yes' }, { eventId: 3, response: 'invalid' }]) notifyCompanyEventRsvpChanged(value);
  expect(listener).not.toHaveBeenCalled();
  stop(); notifyCompanyEventRsvpChanged({ eventId: 3, response: 'maybe' });
  expect(listener).not.toHaveBeenCalled();
});
