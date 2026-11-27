import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: () => {} }));
import { projectWorkQueueSchedule } from '../../models/NoteAidWorkQueueItem.model.js';

it('uses the moved appointment time for an existing draft and hides it until documentation opens', () => {
  const item = { id: 'booked_session_18', draftId: 73, timeLabel: '4:00 AM', scheduledStart: '2026-11-21T11:00:00Z' };
  const row = {
    live_appointment_id: 5, live_start_at: '2026-11-21 18:00:00', live_end_at: '2026-11-21 19:00:00',
    live_source_timezone: 'America/Denver', live_status: 'scheduled'
  };
  expect(projectWorkQueueSchedule(row, item, Date.parse('2026-11-21T17:54:59Z'))).toBeNull();
  expect(projectWorkQueueSchedule(row, item, Date.parse('2026-11-21T17:55:00Z'))).toMatchObject({
    ...item, appointmentId: 5, date: '2026-11-21', timeLabel: '11:00 AM', scheduledStart: '2026-11-21T18:00:00.000Z', durationMinutes: 60
  });
  expect(projectWorkQueueSchedule({ ...row, live_status: 'canceled_by_provider' }, item, Date.parse('2026-11-21T18:00:00Z'))).toBeNull();
});


it('shows the exact scheduled H0004 on unfinished work and the recorded code on signed work', () => {
  const item = { id: 'booked_session_18', serviceCode: '90837', status: 'started' };
  const booking = { live_appointment_id: 5, live_start_at: '2026-11-21 18:00:00', live_end_at: '2026-11-21 19:00:00', live_status: 'scheduled', live_service_code: 'H0004' };
  const now = Date.parse('2026-11-21T18:00:00Z');
  expect(projectWorkQueueSchedule(booking, item, now)).toMatchObject({ serviceCode: 'H0004', durationMinutes: 60 });
  expect(projectWorkQueueSchedule(booking, { ...item, status: 'signed' }, now)).toMatchObject({ serviceCode: '90837' });
});
