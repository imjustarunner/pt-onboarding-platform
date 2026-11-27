import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { applyCalendarCancellationVisibility, archiveCanceledCalendarItem, canSeeDeletedCalendarItems } from '../calendarCancellationArchive.service.js';

vi.mock('../../config/database.js', () => ({ default: {} }));
const port = Number(process.env.SCHEDULING_TEST_MYSQL_PORT);
const schema = `codex_calendar_archive_${process.pid}_${Date.now()}`;

describe.skipIf(!port)('calendar cancellation archive in isolated MySQL', () => {
  let db;
  const migration = new URL('../../../../database/migrations/1884_calendar_cancellation_archives.sql', import.meta.url);
  beforeAll(async () => {
    db = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', password: '' });
    await db.query(`CREATE DATABASE ${schema}`);
    await db.query(`USE ${schema}`);
    for (const sql of [
      'CREATE TABLE appointments (id INT PRIMARY KEY, agency_id INT, provider_user_id INT, status VARCHAR(32), start_at DATETIME, source VARCHAR(100), provider_schedule_event_id INT, office_event_id INT)',
      'CREATE TABLE provider_schedule_events (id INT PRIMARY KEY, agency_id INT, provider_id INT, recurrence_series_id VARCHAR(50), status VARCHAR(32), start_at DATETIME)',
      'CREATE TABLE office_events (id INT PRIMARY KEY, status VARCHAR(32), start_at DATETIME, booking_plan_id INT, booked_provider_id INT, assigned_provider_id INT, standing_assignment_id INT, session_context_json JSON)',
      'CREATE TABLE office_standing_assignments (id INT PRIMARY KEY, booking_agency_id INT)',
      'CREATE TABLE supervision_sessions (id INT PRIMARY KEY, agency_id INT, supervisor_user_id INT, status VARCHAR(32), start_at DATETIME, recurrence_series_id VARCHAR(50), calendar_deleted_at DATETIME)'
    ]) await db.query(sql);
    await db.query(await readFile(migration, 'utf8'));
    await db.query(`INSERT INTO provider_schedule_events VALUES (11,2,7,'series','CANCELLED','2026-11-04'),
      (12,2,7,'series','CANCELLED','2026-11-11'),(13,2,7,'series','ACTIVE','2026-11-18')`);
    await db.query(`INSERT INTO appointments VALUES (1,2,7,'canceled_by_provider','2026-11-04','app',11,NULL),
      (2,2,7,'late_canceled','2026-11-11','app',12,NULL),(3,2,7,'scheduled','2026-11-18','app',13,NULL),
      (4,3,7,'canceled_by_provider','2026-11-11','app',12,NULL)`);
    await db.query(`INSERT INTO supervision_sessions VALUES (31,2,7,'CANCELLED','2026-11-11',NULL,'2026-11-14')`);
    await db.query(`INSERT INTO office_events VALUES (21,'CANCELLED','2026-11-11',NULL,7,7,NULL,JSON_OBJECT('agencyId',2))`);
  });
  afterAll(async () => {
    if (!db) return;
    await db.query(`DROP DATABASE IF EXISTS ${schema}`);
    await db.end();
  });

  const entry = (id, appointmentStatus) => ({ appointmentId: id, appointmentStatus });
  const view = (events, options = {}) => applyCalendarCancellationVisibility(events,
    { showDeleted: false, canArchive: true, providerId: 7, allowedAgencies: [2], ...options }, db);

  it('hides the second occurrence even when it is the only one in the requested week', async () => {
    const events = [entry(2, 'late_canceled'), entry(3, 'scheduled'), entry(4, 'canceled_by_provider')];
    const { provider_event } = await view({ provider_event: events });
    expect(provider_event.map(row => row.appointmentId)).toEqual([3, 4]);
    const expanded = await view({ provider_event: events }, { showDeleted: true });
    expect(expanded.provider_event[0].calendarCancellation).toMatchObject({ hiddenRepeat: true, archived: false });
  });

  it('archives a cancellation idempotently, with actor attribution and agency visibility', async () => {
    const authorize = vi.fn(), authorizeAppointment = vi.fn();
    const request = { providerId: 7, type: 'appointment', id: 1, actor: { id: 7, role: 'provider' }, authorize, authorizeAppointment };
    expect(await archiveCanceledCalendarItem(request, db)).toMatchObject({ archived: true, agencyId: 2, newlyArchived: true });
    expect(await archiveCanceledCalendarItem(request, db)).toMatchObject({ archived: true, agencyId: 2, newlyArchived: false });
    expect(authorize).toHaveBeenCalledWith(request.actor, 7, [2]);
    const events = { provider_event: [entry(1, 'canceled_by_provider'), entry(2, 'late_canceled')] };
    expect((await view(events)).provider_event).toEqual([]);
    expect((await view(events, { showDeleted: true, allowedAgencies: [3] })).provider_event).toEqual([]);
    expect((await view(events, { showDeleted: true })).provider_event[0].calendarCancellation.archived).toBe(true);
    expect(canSeeDeletedCalendarItems('provider')).toBe(false);
    expect(canSeeDeletedCalendarItems('admin')).toBe(true);
    expect((await db.query('SELECT resource_id,archived_by_user_id FROM calendar_cancellation_archives'))[0])
      .toEqual([{ resource_id: 1, archived_by_user_id: 7 }]);
    expect((await db.query('SELECT status FROM appointments WHERE id=1'))[0][0].status).toBe('canceled_by_provider');
    await expect(archiveCanceledCalendarItem({ ...request, id: 3 }, db)).rejects.toMatchObject({ status: 409 });
    await expect(archiveCanceledCalendarItem({ ...request, actor: { id: 8, role: 'provider' } }, db)).rejects.toMatchObject({ status: 403 });
  });

  it('retains legacy supervision deletions and keeps a released office space out of the archive', async () => {
    const events = { supervision: [{ id: 31, status: 'CANCELLED' }], office_event: [
      { id: 21, status: 'CANCELLED' }, { id: 22, status: 'RELEASED', appointmentId: 1, appointmentStatus: 'canceled_by_provider' }
    ] };
    expect((await view(events)).supervision).toEqual([]);
    const expanded = await view(events, { showDeleted: true });
    expect(expanded.supervision[0].calendarCancellation).toMatchObject({ archived: true, canArchive: false });
    expect(expanded.office_event[0].calendarCancellation).toMatchObject({ archived: false, canArchive: true });
    expect(expanded.office_event[1]).toEqual(events.office_event[1]);
  });
});
