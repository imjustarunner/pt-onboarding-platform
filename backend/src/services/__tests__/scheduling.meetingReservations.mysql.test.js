import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../appointmentConflict.service.js', () => ({ assertAppointmentWindowAvailable: vi.fn() }));
vi.mock('../supervisionReviewTime.service.js', () => ({ assertNoReviewTimeOverlap: vi.fn() }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeEncryptNotePayload: s => s, maybeDecryptNotePayload: s => s }));
import { createMeetingReservationService } from '../meetingReservations.service.js';

const socketPath = process.env.MEETING_RESERVATIONS_TEST_SOCKET;
describe.skipIf(!socketPath)('meeting reservations with real SQL transactions and locks', () => {
  let db, service;
  const host = { id: 7, role: 'provider' }, employee = { id: 8, role: 'staff' };
  const draft = () => ({ agencyId: 2, title: 'Synthetic evaluation', type: 'evaluation', timeZone: 'America/Denver',
    modality: 'BOTH', location: 'Synthetic office', meetingUrl: 'https://example.invalid/room',
    windows: [{ localStart: '2035-01-04T10:00', localEnd: '2035-01-04T12:00', durationMinutes: 45, gapMinutes: 15 }],
    selectedStarts: ['2035-01-04T17:00:00.000Z', '2035-01-04T18:00:00.000Z'], expiresLocal: '2035-01-03T17:00',
    recipients: [{ userId: 8, sendEmail: false }, { name: 'Synthetic external', email: 'external@example.invalid' }],
    subject: 'Choose a time', message: 'Synthetic test only.' });
  const publish = async () => {
    const saved = await service.save(draft(), host);
    return service.publish(saved.id, { revision: saved.revision, reviewed: true, commitment: true }, host);
  };
  beforeAll(async () => {
    if (!/^\/private\/tmp\/pt-release-mysql-[^/]+\/mysql\.sock$/.test(socketPath)) throw new Error('Disposable socket required.');
    const setup = await mysql.createConnection({ socketPath, user: 'root' });
    await setup.query('CREATE DATABASE meeting_reservations_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
    await setup.end();
    db = mysql.createPool({ socketPath, user: 'root', database: 'meeting_reservations_test', timezone: 'Z', connectionLimit: 8 });
    const migration = await fs.readFile(new URL('../../../../database/migrations/1693_meeting_reservation_offers.sql', import.meta.url), 'utf8');
    for (const sql of migration.split(';').map(s => s.trim()).filter(Boolean)) await db.query(sql);
    await db.query(`CREATE TABLE users (id INT PRIMARY KEY, preferred_name VARCHAR(100), first_name VARCHAR(100), last_name VARCHAR(100),
      work_email VARCHAR(255), email VARCHAR(255), is_active BOOLEAN DEFAULT 1, is_archived BOOLEAN DEFAULT 0,
      is_demo BOOLEAN DEFAULT 0, status VARCHAR(40), role VARCHAR(40))`);
    await db.query('CREATE TABLE user_agencies (user_id INT, agency_id INT, is_active BOOLEAN DEFAULT 1)');
    await db.query('CREATE TABLE user_communications (id INT PRIMARY KEY, opened_at DATETIME)');
    await db.query(`CREATE TABLE provider_schedule_events (id INT AUTO_INCREMENT PRIMARY KEY, agency_id INT, provider_id INT,
      kind VARCHAR(40), title VARCHAR(255), description TEXT, is_private BOOLEAN, all_day BOOLEAN, start_at DATETIME, end_at DATETIME,
      event_timezone VARCHAR(100), status VARCHAR(40), created_by_user_id INT, updated_by_user_id INT,
      meeting_subtype VARCHAR(40), location_text TEXT, google_meet_link TEXT, platform_video_link BOOLEAN DEFAULT 0,
      notify_participants BOOLEAN DEFAULT 0, attendance_tracking_enabled BOOLEAN DEFAULT 0, meeting_settings_json JSON) ENGINE=InnoDB`);
    await db.query('CREATE TABLE provider_schedule_event_attendees (event_id INT, user_id INT, PRIMARY KEY(event_id,user_id))');
    await db.query("INSERT INTO users(id,first_name,last_name,email,status,role) VALUES (7,'Test','Host','host@example.invalid','ACTIVE_EMPLOYEE','provider'),(8,'Test','Employee','employee@example.invalid','ACTIVE_EMPLOYEE','staff')");
    await db.query('INSERT INTO user_agencies VALUES (7,2,1),(8,2,1)');
    service = createMeetingReservationService({ database: db, now: () => new Date('2035-01-01T10:00:00Z'),
      membership: async (agencyId, userId) => (await db.execute('SELECT 1 FROM user_agencies WHERE agency_id=? AND user_id=? AND is_active=1', [agencyId, userId]))[0].length > 0,
      checkWindow: async (connection, { providerUserId, startAt, endAt, providerScheduleEventId }) => {
        const [overlaps] = await connection.execute("SELECT id FROM provider_schedule_events WHERE provider_id=? AND status='ACTIVE' AND start_at<? AND end_at>? AND (? IS NULL OR id<>?)", [providerUserId, endAt, startAt, providerScheduleEventId, providerScheduleEventId]);
        if (overlaps.length) throw Object.assign(new Error('Calendar conflict'), { status: 409 });
      }, checkReview: async () => {}, invalidate: async () => {}, encrypt: s => s, decrypt: s => s });
  });
  beforeEach(async () => {
    for (const table of ['meeting_reservation_deliveries', 'meeting_reservation_invitees', 'meeting_reservation_slots', 'meeting_reservation_offers', 'provider_schedule_event_attendees', 'provider_schedule_events']) await db.query(`DELETE FROM ${table}`);
  });
  afterAll(async () => { await db?.end(); });
  it('persists a reviewed offer and books exactly one meeting with a separate gap', async () => {
    const offer = await publish();
    expect(offer.slots).toHaveLength(2);
    expect(offer.deliveries).toHaveLength(2);
    const invitee = offer.recipients.find(r => r.user_id === 8);
    const result = await service.claim(invitee.id, { slotId: offer.slots[0].id, modality: 'IN_PERSON' }, employee);
    expect(result.booking).toMatchObject({ status: 'ACTIVE', startAt: '2035-01-04T17:00:00.000Z', endAt: '2035-01-04T17:45:00.000Z' });
    const [attendees] = await db.query('SELECT * FROM provider_schedule_event_attendees');
    expect(attendees).toEqual([{ event_id: result.booking.eventId, user_id: 8 }]);
    const [gaps] = await db.query("SELECT * FROM provider_schedule_events WHERE title='Gap after reserved meeting'");
    expect(gaps).toHaveLength(1);
  });
  it('allows only one simultaneous claimant and keeps the result idempotent', async () => {
    const offer = await publish();
    const [recipients] = await db.execute('SELECT * FROM meeting_reservation_invitees WHERE offer_id=? ORDER BY id', [offer.id]);
    const internal = recipients.find(r => r.user_id === 8), external = recipients.find(r => !r.user_id);
    const input = { slotId: offer.slots[0].id, modality: 'VIRTUAL' };
    const results = await Promise.allSettled([service.claim(internal.id, input, employee), service.claim(external.token_payload, input)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')[0].reason.status).toBe(409);
    const [claims] = await db.query('SELECT * FROM meeting_reservation_invitees WHERE slot_id IS NOT NULL');
    expect(claims).toHaveLength(1);
    const winner = claims[0];
    await service.claim(winner.user_id ? winner.id : winner.token_payload, input, winner.user_id ? employee : undefined);
    expect((await db.query("SELECT * FROM provider_schedule_events WHERE kind='TEAM_MEETING'"))[0]).toHaveLength(1);
  });
  it('rolls back all holds if a conflict appears before publication', async () => {
    const saved = await service.save(draft(), host);
    await db.query("INSERT INTO provider_schedule_events(provider_id,kind,status,start_at,end_at) VALUES(7,'SCHEDULE_HOLD','ACTIVE','2035-01-04 18:00:00','2035-01-04 19:00:00')");
    await expect(service.publish(saved.id, { revision: 1, reviewed: true, commitment: true }, host)).rejects.toMatchObject({ status: 409 });
    expect((await db.query('SELECT * FROM meeting_reservation_slots'))[0]).toHaveLength(0);
    expect((await db.query('SELECT * FROM provider_schedule_events'))[0]).toHaveLength(1);
    expect((await service.detail(saved.id, host)).status).toBe('draft');
  });
  it('closes unused slots while preserving booked meetings', async () => {
    const offer = await publish(), invitee = offer.recipients.find(r => r.user_id === 8);
    const result = await service.claim(invitee.id, { slotId: offer.slots[0].id, modality: 'IN_PERSON' }, employee);
    await service.close(offer.id, host);
    expect((await service.view(invitee.id, employee)).booking.eventId).toBe(result.booking.eventId);
    expect((await db.query("SELECT * FROM provider_schedule_events WHERE kind='TEAM_MEETING' AND status='ACTIVE'"))[0]).toHaveLength(1);
    expect((await db.query("SELECT * FROM meeting_reservation_slots WHERE status='open'"))[0]).toHaveLength(0);
  });
});
