import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ notify: vi.fn() }));
vi.mock('../notificationDispatcher.service.js', () => ({ createNotificationAndDispatch: m.notify }));
import { notifyAddedTeamMeetingAttendee } from '../teamMeetingAddedNotification.service.js';
import { NOTIFICATION_TYPES } from '../notificationCatalog.service.js';
const input = { event: { id: 9, agency_id: 2, title: 'Team sync', start_at: '2026-10-29 17:00:00', end_at: '2026-10-29 18:00:00' }, userId: 8, actorUserId: 7, actorName: 'Host' };
beforeEach(() => { vi.clearAllMocks(); m.notify.mockResolvedValue({ id: 1 }); });
it('creates a registered notification with persisted navigation data for a live invitation', async () => {
  await notifyAddedTeamMeetingAttendee({ ...input, now: new Date('2026-10-29T17:30:00Z') });
  const notification = m.notify.mock.calls[0][0];
  expect(NOTIFICATION_TYPES).toContain(notification.type);
  expect(notification).toMatchObject({ userId: 8, actorUserId: 7, relatedEntityType: 'provider_schedule_event', relatedEntityId: 9, audienceJson: { eventId: 9, live: true, refreshSchedule: true } });
  expect(notification.message).toContain('happening now');
});
it('does not describe a future meeting as live', async () => {
  await notifyAddedTeamMeetingAttendee({ ...input, now: new Date('2026-10-29T16:30:00Z') });
  expect(m.notify.mock.calls[0][0]).toMatchObject({ audienceJson: { live: false } });
  expect(m.notify.mock.calls[0][0].message).not.toContain('happening now');
});
it('propagates delivery failure so the caller can show an honest invitation warning', async () => {
  m.notify.mockRejectedValue(new Error('Database unavailable'));
  await expect(notifyAddedTeamMeetingAttendee(input)).rejects.toThrow('Database unavailable');
});
