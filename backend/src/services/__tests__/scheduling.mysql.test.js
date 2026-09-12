/** Opt-in tests for a disposable localhost MySQL container; never uses backend/.env. */
import { describe, it, expect, vi, beforeAll, beforeEach, afterAll } from 'vitest';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { splitSqlStatements, stripSqlLineComments } from '../../../../database/migrationSqlUtils.js';
vi.mock('../../config/database.js', async () => ({ onTableWrite: () => {}, default: (await import('mysql2/promise')).default.createPool({
  host: '127.0.0.1', port: Number(process.env.SCHEDULING_TEST_MYSQL_PORT || 1), user: 'root', password: '',
  database: 'codex_scheduling_validation_main', timezone: '+00:00', connectionLimit: 4
}) }));
vi.mock('../../config/clinicalDatabase.js', async () => ({ default: (await import('mysql2/promise')).default.createPool({
  host: '127.0.0.1', port: Number(process.env.SCHEDULING_TEST_MYSQL_PORT || 1), user: 'root', password: '',
  database: 'codex_scheduling_validation_clinical', timezone: '+00:00', connectionLimit: 2
}) }));
vi.mock('../schedulingBillingAccess.service.js', () => ({ hasSchedulingBillingAccess: async (user, agencyId) => user?.billingAgencies?.includes(Number(agencyId)) || false }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendNotificationEmail: vi.fn() }));
import { resolveSelfPayQuote, getAgencySelfPayOnly } from '../selfPayRates.service.js';
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import BookingPackage from '../../models/BookingPackage.model.js';
import ClinicalClaim from '../../models/clinical/ClinicalClaim.model.js';
import { applyMissedSessionPolicy } from '../practitionerPackage.service.js';
import { queueAppointmentWaiver, decideAppointmentWaiver, listAppointmentWaivers } from '../appointmentWaiver.service.js';
import { blockAppointmentChangeClaims, attachAppointmentChangeNotes } from '../appointmentChangeNote.service.js';
import { moveOfficeSessionOccurrence, moveOfficeSessionSeries } from '../officeSessionMove.service.js';

describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('disposable MySQL scheduling integration', () => {
  let admin;
  const created = [];
  beforeAll(async () => {
    admin = await mysql.createConnection({ host: '127.0.0.1', port: Number(process.env.SCHEDULING_TEST_MYSQL_PORT), user: 'root', password: '' });
    for (const name of ['codex_scheduling_validation_main', 'codex_scheduling_validation_clinical']) {
      // Deliberately no IF NOT EXISTS: do not take ownership of a pre-existing database.
      await admin.query(`CREATE DATABASE ${name}`);
      created.push(name);
    }
    const mainDdl = [
      `CREATE TABLE office_events (id INT PRIMARY KEY, office_location_id INT, room_id INT, start_at DATETIME, end_at DATETIME, status VARCHAR(30), status_outcome VARCHAR(30), standing_assignment_id INT, booking_plan_id INT, assigned_provider_id INT, booked_provider_id INT, client_id INT, clinical_session_id INT, updated_at DATETIME)`,
      `CREATE TABLE appointments (id INT PRIMARY KEY, agency_id INT, provider_user_id INT, office_event_id INT, provider_schedule_event_id INT, package_entitlement_id INT, room_id INT, start_at DATETIME, end_at DATETIME, title VARCHAR(200), cancellation_fee_cents INT, status VARCHAR(30), updated_by_user_id INT, updated_at DATETIME)`,
      `CREATE TABLE provider_schedule_events (id INT PRIMARY KEY, provider_id INT, start_at DATETIME, end_at DATETIME, status VARCHAR(30), updated_at DATETIME)`,
      `CREATE TABLE office_booking_plans (id INT PRIMARY KEY, standing_assignment_id INT, booking_start_date DATE, active_until_date DATE, skipped_dates_json JSON, is_active BOOLEAN DEFAULT TRUE)`,
      `CREATE TABLE office_booking_requests (id INT PRIMARY KEY)`,
      `CREATE TABLE office_standing_assignments (id INT PRIMARY KEY, room_id INT, weekday INT, hour INT, provider_id INT, available_since_date DATE, temporary_until_date DATE, last_two_week_confirmed_at DATETIME)`,
      `CREATE TABLE booking_packages (id INT PRIMARY KEY, name VARCHAR(100), consume_on VARCHAR(20), allowed_tenant_service_ids_json JSON, package_type VARCHAR(30), price_cents INT, domain_config_json JSON)`,
      `CREATE TABLE booking_package_entitlements (id INT PRIMARY KEY AUTO_INCREMENT, agency_id INT, package_id INT, client_id INT, business_type VARCHAR(64), learning_program_class_id INT, sessions_purchased INT, payment_status VARCHAR(30), practitioner_entitlement_id INT, purchaser_user_id INT, stripe_payment_intent_id VARCHAR(200), activated_at DATETIME, created_by_user_id INT, sessions_remaining INT, sessions_reserved INT, status VARCHAR(30))`,
      `CREATE TABLE booking_package_ledger (id INT PRIMARY KEY AUTO_INCREMENT, agency_id INT, entitlement_id INT, client_id INT, appointment_id INT, direction VARCHAR(20), quantity INT, reason_code VARCHAR(50), metadata_json JSON, created_by_user_id INT)`
    ];
    mainDdl.push(
      `CREATE TABLE users (id INT PRIMARY KEY, first_name VARCHAR(100), last_name VARCHAR(100))`,
      `CREATE TABLE clients (id INT PRIMARY KEY, first_name VARCHAR(100), last_name VARCHAR(100))`,
      `CREATE TABLE appointment_billing (id INT AUTO_INCREMENT PRIMARY KEY, appointment_id INT UNIQUE, payment_status VARCHAR(30), amount_cents INT)`,
      `CREATE TABLE clinical_record_refs (agency_id INT, client_id INT, office_event_id INT, clinical_session_id INT, record_type VARCHAR(30), clinical_record_id INT, updated_at TIMESTAMP NULL, UNIQUE KEY ref_key (record_type, clinical_record_id))`,
      `CREATE TABLE practitioner_session_packages (id INT PRIMARY KEY, agency_id INT, name VARCHAR(100), missed_session_policy_json JSON)`,
      `CREATE TABLE practitioner_client_package_entitlements (id INT PRIMARY KEY, agency_id INT, client_id INT, package_id INT, packet_id INT, sessions_remaining INT, free_rebooks_remaining INT, status VARCHAR(30), updated_at DATETIME)`,
      `CREATE TABLE practitioner_session_credit_ledger (id INT AUTO_INCREMENT PRIMARY KEY, agency_id INT, client_id INT, package_id INT, packet_id INT, entitlement_id INT, provider_schedule_event_id INT, direction VARCHAR(20), quantity INT, reason_code VARCHAR(64), metadata_json JSON, created_by_user_id INT)`
    );
    for (const sql of mainDdl) await pool.query(sql);
    await clinicalPool.query(`CREATE TABLE clinical_sessions (id INT PRIMARY KEY, agency_id INT, client_id INT, office_event_id INT, scheduled_start_at DATETIME, scheduled_end_at DATETIME, encounter_status VARCHAR(32) DEFAULT 'scheduled', claim_blocked_reason VARCHAR(255), updated_at DATETIME)`);
    await clinicalPool.query(`CREATE TABLE clinical_notes (id INT AUTO_INCREMENT PRIMARY KEY, clinical_session_id INT, agency_id INT, client_id INT, title VARCHAR(255), note_payload LONGTEXT, metadata_json JSON, created_by_user_id INT, note_type VARCHAR(80), content_hash VARCHAR(128), provider_signed_by_user_id INT, is_billable BOOLEAN DEFAULT FALSE, is_deleted BOOLEAN DEFAULT FALSE, provider_signed_at DATETIME)`);
    await clinicalPool.query(`CREATE TABLE clinical_claims (id INT AUTO_INCREMENT PRIMARY KEY, clinical_session_id INT, agency_id INT, client_id INT, claim_number VARCHAR(120), claim_status VARCHAR(60), amount_cents INT, currency_code VARCHAR(8), claim_payload LONGTEXT, metadata_json JSON, created_by_user_id INT)`);
    for (const [db, path] of [[pool, '../../../../database/migrations/1429_self_pay_service_rates.sql'], [pool, '../../../../database/migrations/1424_appointment_change_workflows.sql'], [pool, '../../../../database/migrations/1425_appointment_waivers_and_package_credits.sql'], [pool, '../../../../database/migrations/1419_recurring_session_context.sql'], [clinicalPool, '../../../../database/clinical_migrations/015_appointment_clinical_sessions.sql']]) {
      const sql = await readFile(new URL(path, import.meta.url), 'utf8');
      for (const statement of splitSqlStatements(stripSqlLineComments(sql))) await db.query(statement);
    }
  }, 20000);
  beforeEach(async () => {
    for (const table of ['self_pay_service_rates', 'agency_self_pay_settings', 'appointment_change_waivers', 'appointment_billing', 'clinical_record_refs', 'clients', 'users', 'practitioner_session_credit_ledger', 'practitioner_client_package_entitlements', 'practitioner_session_packages', 'appointment_change_workflows', 'office_events', 'appointments', 'provider_schedule_events', 'office_booking_plans', 'office_standing_assignments', 'booking_packages', 'booking_package_entitlements', 'booking_package_ledger']) await pool.query(`DELETE FROM ${table}`);
    await clinicalPool.query('DELETE FROM clinical_claims');
    await clinicalPool.query('DELETE FROM clinical_notes');
    await clinicalPool.query('DELETE FROM clinical_sessions');
    await pool.query(`INSERT INTO office_standing_assignments (id, room_id, weekday, hour, provider_id, available_since_date) VALUES (7, 4, 1, 10, 9, '2099-01-05')`);
    await pool.query(`INSERT INTO office_booking_plans (id, standing_assignment_id, booking_start_date, active_until_date, skipped_dates_json) VALUES (3, 7, '2099-01-05', '2099-01-19', '[]')`);
    await pool.query(`INSERT INTO office_events (id, office_location_id, room_id, start_at, end_at, status, standing_assignment_id, booking_plan_id, assigned_provider_id, booked_provider_id, client_id, clinical_session_id)
      VALUES (20, 2, 4, '2099-01-05 17:00:00', '2099-01-05 18:00:00', 'BOOKED', 7, 3, 9, 9, 8, 30)`);
    await pool.query(`INSERT INTO appointments (id, agency_id, provider_user_id, office_event_id, provider_schedule_event_id, room_id, start_at, end_at, status)
      VALUES (10, 1, 9, 20, 40, 4, '2099-01-05 17:00:00', '2099-01-05 18:00:00', 'scheduled')`);
    await pool.query(`INSERT INTO provider_schedule_events VALUES (40, 9, '2099-01-05 17:00:00', '2099-01-05 18:00:00', 'ACTIVE', NULL)`);
    await clinicalPool.query(`INSERT INTO clinical_sessions (id, agency_id, client_id, office_event_id, appointment_id, scheduled_start_at, scheduled_end_at) VALUES (30, 1, 8, 20, 10, '2099-01-05 17:00:00', '2099-01-05 18:00:00')`);
    await pool.query(`INSERT INTO booking_packages (id, name, consume_on) VALUES (2, 'Test package', 'reserve')`);
    await pool.query(`INSERT INTO booking_package_entitlements (id, agency_id, package_id, client_id, sessions_remaining, sessions_reserved, status) VALUES (6, 1, 2, 8, 1, 0, 'ACTIVE')`);
  });
  afterAll(async () => {
    await Promise.all([pool.end(), clinicalPool.end()]);
    if (admin) {
      for (const name of created) await admin.query(`DROP DATABASE ${name}`);
      await admin.end();
    }
  });
  const move = () => moveOfficeSessionOccurrence({ eventId: 20, newRoomId: 5, startAt: '2099-01-06 17:00:00', endAt: '2099-01-06 18:00:00', timeZone: 'America/Denver', actorUserId: 9 });
  it('applies both migrations and enforces appointment/client clinical uniqueness', async () => {
    await expect(clinicalPool.query(`INSERT INTO clinical_sessions (id, agency_id, client_id, appointment_id) VALUES (31, 1, 8, 10)`)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
  });
  it('isolates provider rates by agency and restores inheritance when an override is cleared', async () => {
    await pool.execute(`INSERT INTO self_pay_service_rates (agency_id, tenant_service_id, provider_user_id, rate_cents, rate_unit, updated_by_user_id)
      VALUES (1, 10, 0, 12000, 'hour', 9), (1, 10, 9, 0, 'session', 9), (2, 10, 9, 90000, 'session', 9)`);
    const args = { agencyId: 1, providerId: 9, service: { id: 10, priceCents: 5000 }, durationMinutes: 50 };
    expect(await resolveSelfPayQuote(args)).toMatchObject({ amountCents: 0, source: 'provider' });
    await pool.execute('DELETE FROM self_pay_service_rates WHERE agency_id = 1 AND provider_user_id = 9');
    expect(await resolveSelfPayQuote(args)).toMatchObject({ amountCents: 10000, source: 'agency' });
    await pool.execute('DELETE FROM self_pay_service_rates WHERE agency_id = 1');
    expect(await resolveSelfPayQuote(args)).toMatchObject({ amountCents: 5000, source: 'catalog' });
    expect(await getAgencySelfPayOnly(1)).toBe(false);
    await pool.execute('INSERT INTO agency_self_pay_settings (agency_id, self_pay_only, updated_by_user_id) VALUES (1, 1, 9)');
    expect(await getAgencySelfPayOnly(1)).toBe(true);
  });
  it('blocks claim creation for a self-pay-only clinical session', async () => {
    await clinicalPool.execute("UPDATE clinical_sessions SET claim_blocked_reason = 'SELF_PAY_ONLY: Insurance claims disabled' WHERE id = 30");
    await expect(ClinicalClaim.create({ clinicalSessionId: 30, agencyId: 1, clientId: 8, createdByUserId: 9 })).rejects.toMatchObject({ status: 409 });
    const [[row]] = await clinicalPool.query('SELECT COUNT(*) AS total FROM clinical_claims');
    expect(row.total).toBe(0);
  });
  it('persists a workflow draft without modifying appointment status', async () => {
    await pool.execute(`INSERT INTO appointment_change_workflows (appointment_id, agency_id, facts_json, updated_by_user_id) VALUES (?, ?, ?, ?)`,
      [10, 1, JSON.stringify({ eventType: 'canceled', reasons: ['illness'] }), 9]);
    const [[row]] = await pool.query('SELECT * FROM appointment_change_workflows WHERE appointment_id = 10');
    expect(row.status).toBe('draft'); expect(row.facts_json.reasons).toEqual(['illness']);
    const [[appointment]] = await pool.query('SELECT status FROM appointments WHERE id = 10');
    expect(appointment.status).toBe('scheduled');
  });
  it('attaches one signed nonbillable note on retry and blocks an explicit claim insert', async () => {
    const appointment = { id: 10, agencyId: 1, clinicalSessionId: 30, officeEventId: 20 };
    await blockAppointmentChangeClaims(appointment, 'no_show');
    const options = { appointment, eventType: 'no_show', narrative: 'Synthetic client did not attend.', actorUserId: 9, signedAt: '2026-09-12 16:00:00' };
    const first = await attachAppointmentChangeNotes(options);
    expect(await attachAppointmentChangeNotes(options)).toEqual(first);
    const [[note]] = await clinicalPool.query('SELECT * FROM clinical_notes WHERE id = ?', [first[0].id]);
    expect(note.is_billable).toBe(0); expect(note.provider_signed_by_user_id).toBe(9);
    expect(note.provider_signed_at.toISOString()).toBe('2026-09-12T16:00:00.000Z');
    expect(note.clinical_session_id).toBe(30); expect(note.note_type).toBe('APPOINTMENT_CHANGE');
    await expect(ClinicalClaim.create({ clinicalSessionId: 30, agencyId: 1, clientId: 8, createdByUserId: 9 })).rejects.toThrow('blocked');
    const [[count]] = await clinicalPool.query('SELECT COUNT(*) AS n FROM clinical_claims'); expect(count.n).toBe(0);
  });
  it('uses a practitioner free miss once across concurrent retries', async () => {
    await pool.query(`INSERT INTO practitioner_session_packages VALUES (7, 1, 'Synthetic package', '{"type":"free_rebook"}')`);
    await pool.query(`INSERT INTO practitioner_client_package_entitlements VALUES (8, 1, 8, 7, 1, 6, 1, 'ACTIVE', NULL)`);
    const options = { agencyId: 1, clientId: 8, entitlementId: 8, providerScheduleEventId: 40, createdByUserId: 9 };
    const results = await Promise.all([applyMissedSessionPolicy(options), applyMissedSessionPolicy(options)]);
    expect(results.map((r) => r.action).sort()).toEqual(['ALREADY_APPLIED', 'FREE_REBOOK']);
    const [[entitlement]] = await pool.query('SELECT * FROM practitioner_client_package_entitlements WHERE id = 8');
    expect(entitlement.sessions_remaining).toBe(6); expect(entitlement.free_rebooks_remaining).toBe(0);
    const [[count]] = await pool.query('SELECT COUNT(*) AS n FROM practitioner_session_credit_ledger'); expect(count.n).toBe(1);
  });
  it('moves the same session across all three records and records the original plan exception', async () => {
    await move();
    const [[event]] = await pool.query('SELECT * FROM office_events WHERE id = 20');
    const [[appointment]] = await pool.query('SELECT * FROM appointments WHERE id = 10');
    const [[session]] = await clinicalPool.query('SELECT * FROM clinical_sessions WHERE id = 30');
    const [[plan]] = await pool.query('SELECT * FROM office_booking_plans WHERE id = 3');
    expect(event.room_id).toBe(5);
    expect(event.standing_assignment_id).toBeNull();
    expect(appointment.start_at.toISOString()).toBe('2099-01-06T17:00:00.000Z');
    expect(session.scheduled_start_at.toISOString()).toBe(appointment.start_at.toISOString());
    expect(plan.skipped_dates_json).toEqual(['2099-01-05']);
  });
  it('rolls back every main record when the target room is occupied', async () => {
    await pool.query(`INSERT INTO office_events (id, room_id, start_at, end_at, status, booked_provider_id) VALUES (21, 5, '2099-01-06 17:30:00', '2099-01-06 18:30:00', 'BOOKED', 11)`);
    await expect(move()).rejects.toThrow('occupied');
    const [[event]] = await pool.query('SELECT room_id FROM office_events WHERE id = 20');
    expect(event.room_id).toBe(4);
  });
  it('blocks moving a signed clinical session', async () => {
    await clinicalPool.query(`INSERT INTO clinical_notes (id, clinical_session_id, is_deleted, provider_signed_at) VALUES (1, 30, FALSE, '2099-01-05 18:10:00')`);
    await expect(move()).rejects.toThrow('signed note');
  });
  it('moves a standing series while preserving its final date and IDs', async () => {
    await moveOfficeSessionSeries({ assignment: { id: 7, weekday: 1, provider_id: 9 }, newRoomId: 5, newWeekday: 2, newHour: 11, timeZone: 'America/Denver', actorUserId: 9 });
    const [[plan]] = await pool.query('SELECT * FROM office_booking_plans WHERE id = 3');
    expect(plan.active_until_date.toISOString().slice(0, 10)).toBe('2099-01-20');
    const [[event]] = await pool.query('SELECT id, room_id FROM office_events WHERE id = 20');
    expect(event).toMatchObject({ id: 20, room_id: 5 });
  });
  it('allows only one concurrent booking to reserve the last package session', async () => {
    const results = await Promise.allSettled([10, 11].map((appointmentId) => BookingPackage.applyAppointmentUsage({ entitlementId: 6, agencyId: 1, appointmentId, mode: 'reserve' })));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
    const [[ent]] = await pool.query('SELECT * FROM booking_package_entitlements WHERE id = 6');
    expect(ent).toMatchObject({ sessions_remaining: 0, sessions_reserved: 1 });
  });
  it('consumes once under concurrent completion and does not refund a consumed session on cancellation', async () => {
    const input = { entitlementId: 6, agencyId: 1, appointmentId: 10 };
    await BookingPackage.applyAppointmentUsage({ ...input, mode: 'reserve' });
    await Promise.all([BookingPackage.applyAppointmentUsage({ ...input, mode: 'complete' }), BookingPackage.applyAppointmentUsage({ ...input, mode: 'complete' })]);
    await BookingPackage.applyAppointmentUsage({ ...input, mode: 'release' });
    const [[count]] = await pool.query("SELECT COUNT(*) n FROM booking_package_ledger WHERE direction = 'CONSUME'");
    expect(Number(count.n)).toBe(1);
    const [[ent]] = await pool.query('SELECT * FROM booking_package_entitlements WHERE id = 6');
    expect(ent).toMatchObject({ sessions_remaining: 0, sessions_reserved: 0, status: 'EXHAUSTED' });
  });
  const reviewer = { id: 9, role: 'provider', billingAgencies: [1] };
  async function waiverFixture({ bucket = 'paid', fee = false } = {}) {
    const preview = { appointment: { clientId: 8 }, consequence: { model: fee ? 'fee' : 'package', feeCents: fee ? 2500 : 0 } };
    const facts = { clientId: 8, eventType: 'no_show', waiver: { action: 'recommend', reason: 'family_emergency' } };
    await pool.query(`INSERT INTO clients VALUES (8, 'Synthetic', 'Client')`);
    await pool.query(`INSERT INTO users VALUES (9, 'Test', 'Provider')`);
    await pool.execute(`INSERT INTO appointment_change_workflows (appointment_id, agency_id, status, facts_json, preview_json, narrative, signed_by_user_id, updated_by_user_id)
      VALUES (10, 1, 'completed', ?, ?, 'Original signed cancellation note.', 9, 9)`, [JSON.stringify(facts), JSON.stringify(preview)]);
    await queueAppointmentWaiver({ appointmentId: 10, agencyId: 1, facts, actorUserId: 9 });
    if (fee) await pool.query(`INSERT INTO appointment_billing (appointment_id, payment_status, amount_cents) VALUES (10, 'fee_pending', 2500)`);
    else {
      // The original appointment model obtains its package link from this column.
      await pool.query('UPDATE appointments SET package_entitlement_id = 6 WHERE id = 10');
      if (bucket === 'free_miss') await pool.query('UPDATE booking_package_entitlements SET free_misses_remaining = 1 WHERE id = 6');
      if (bucket === 'bonus') await pool.query('UPDATE booking_package_entitlements SET bonus_sessions_remaining = 1 WHERE id = 6');
      await BookingPackage.applyAppointmentUsage({ entitlementId: 6, agencyId: 1, appointmentId: 10, mode: 'reserve' });
      await BookingPackage.applyAppointmentUsage({ entitlementId: 6, agencyId: 1, appointmentId: 10, mode: 'forfeit' });
    }
  }
  it.each(['free_miss', 'bonus', 'paid'])('waiver approval restores the original %s bucket once and preserves the signed note', async (bucket) => {
    await waiverFixture({ bucket });
    const options = { appointmentId: 10, user: reviewer, decision: 'approved', reason: 'Family emergency reviewed' };
    expect(await decideAppointmentWaiver(options)).toMatchObject({ status: 'approved', adjustment: { creditBucket: bucket } });
    expect(await decideAppointmentWaiver(options)).toMatchObject({ status: 'approved' });
    const [[ent]] = await pool.query('SELECT * FROM booking_package_entitlements WHERE id = 6');
    expect(ent.sessions_remaining).toBe(1); expect(ent.sessions_reserved).toBe(0);
    expect(ent.free_misses_remaining).toBe(bucket === 'free_miss' ? 1 : 0);
    expect(ent.bonus_sessions_remaining).toBe(bucket === 'bonus' ? 1 : 0);
    const [[original]] = await pool.query('SELECT narrative FROM appointment_change_workflows WHERE appointment_id = 10');
    expect(original.narrative).toBe('Original signed cancellation note.');
    const [[notes]] = await clinicalPool.query("SELECT COUNT(*) AS n, MAX(is_billable) AS billable FROM clinical_notes WHERE note_type = 'APPOINTMENT_WAIVER'");
    expect(notes.n).toBe(1); expect(notes.billable).toBe(0);
    const [[claims]] = await clinicalPool.query('SELECT COUNT(*) AS n FROM clinical_claims'); expect(claims.n).toBe(0);
  });
  it('denial preserves the fee, requires billing access, and cannot be reversed by a repeat request', async () => {
    await waiverFixture({ fee: true });
    const options = { appointmentId: 10, user: reviewer, decision: 'denied', reason: 'Policy applies' };
    await expect(decideAppointmentWaiver({ ...options, user: { id: 9, role: 'provider' } })).rejects.toMatchObject({ status: 403 });
    expect(await decideAppointmentWaiver(options)).toMatchObject({ status: 'denied' });
    const [[billing]] = await pool.query('SELECT * FROM appointment_billing WHERE appointment_id = 10'); expect(billing.amount_cents).toBe(2500);
    await expect(decideAppointmentWaiver({ ...options, decision: 'approved' })).rejects.toThrow('different decision');
  });
  it('waives an unpaid fee and excludes resolved requests from the queue', async () => {
    await waiverFixture({ fee: true });
    expect((await listAppointmentWaivers({ agencyId: 1, user: reviewer })).reviews).toHaveLength(1);
    await decideAppointmentWaiver({ appointmentId: 10, user: reviewer, decision: 'approved', reason: 'Emergency verified' });
    const [[billing]] = await pool.query('SELECT * FROM appointment_billing WHERE appointment_id = 10');
    expect(billing).toMatchObject({ amount_cents: 0, payment_status: 'waived' });
    expect((await listAppointmentWaivers({ agencyId: 1, user: reviewer })).reviews).toHaveLength(0);
  });
  it('leaves paid fees and the pending review intact rather than losing payment history', async () => {
    await waiverFixture({ fee: true });
    await pool.query("UPDATE appointment_billing SET payment_status = 'paid' WHERE appointment_id = 10");
    await expect(decideAppointmentWaiver({ appointmentId: 10, user: reviewer, decision: 'approved', reason: 'Emergency' })).rejects.toThrow('refund or credit');
    const [[review]] = await pool.query('SELECT status FROM appointment_change_waivers WHERE appointment_id = 10'); expect(review.status).toBe('pending');
  });

  it('resumes a committed waiver after clinical storage fails without restoring the credit twice', async () => {
    await waiverFixture({ bucket: 'bonus' });
    const options = { appointmentId: 10, user: reviewer, decision: 'approved', reason: 'Emergency reviewed' };
    const original = clinicalPool.getConnection.bind(clinicalPool);
    const stub = vi.spyOn(clinicalPool, 'getConnection').mockRejectedValueOnce(new Error('clinical unavailable'));
    await expect(decideAppointmentWaiver(options)).rejects.toThrow('clinical unavailable');
    stub.mockImplementation(original);
    const [[review]] = await pool.query('SELECT status FROM appointment_change_waivers WHERE appointment_id = 10'); expect(review.status).toBe('documenting');
    expect(await decideAppointmentWaiver(options)).toMatchObject({ status: 'approved' });
    const [[ent]] = await pool.query('SELECT sessions_remaining, bonus_sessions_remaining FROM booking_package_entitlements WHERE id = 6');
    expect(ent).toEqual({ sessions_remaining: 1, bonus_sessions_remaining: 1 }); stub.mockRestore();
  });
  it('restores a practitioner free miss and keeps its session credit unchanged', async () => {
    await waiverFixture({ fee: true });
    await pool.query(`INSERT INTO practitioner_session_packages VALUES (7, 1, 'Synthetic package', '{"type":"free_rebook"}')`);
    await pool.query(`INSERT INTO practitioner_client_package_entitlements VALUES (8, 1, 8, 7, 1, 6, 1, 'ACTIVE', NULL)`);
    await applyMissedSessionPolicy({ agencyId: 1, clientId: 8, entitlementId: 8, providerScheduleEventId: 40, createdByUserId: 9 });
    await pool.execute('UPDATE appointment_change_workflows SET preview_json = ? WHERE appointment_id = 10', [JSON.stringify({ appointment: { clientId: 8 }, packageBalance: { source: 'practitioner_package', entitlementId: 8 }, consequence: { model: 'package' } })]);
    await decideAppointmentWaiver({ appointmentId: 10, user: reviewer, decision: 'approved', reason: 'Waiver approved' });
    const [[ent]] = await pool.query('SELECT sessions_remaining, free_rebooks_remaining FROM practitioner_client_package_entitlements WHERE id = 8');
    expect(ent).toEqual({ sessions_remaining: 6, free_rebooks_remaining: 1 });
  });

  it('grants new purchase allowances once and leaves existing entitlements untouched', async () => {
    const lookup = vi.spyOn(BookingPackage, 'findById').mockResolvedValue({ id: 2, agencyId: 1, businessType: 'tutoring', learningProgramClassId: null,
      isActive: true, sessionCount: 4, policies: { bonusSessions: 1, freeMisses: 2 } });
    const activated = await BookingPackage.activateEntitlement({ agencyId: 1, clientId: 8, packageId: 2, createdByUserId: 9 });
    expect(activated).toMatchObject({ sessionsPurchased: 4, sessionsRemaining: 5, freeMissesRemaining: 2, bonusSessionsRemaining: 1 });
    await BookingPackage.activateEntitlement({ agencyId: 1, clientId: 8, packageId: 2, entitlementId: activated.id, createdByUserId: 9 });
    const [[row]] = await pool.query('SELECT * FROM booking_package_entitlements WHERE id = ?', [activated.id]);
    expect(row.sessions_remaining).toBe(5); expect(row.free_misses_remaining).toBe(2);
    const [[old]] = await pool.query('SELECT * FROM booking_package_entitlements WHERE id = 6');
    expect(old.free_misses_remaining).toBe(0); expect(old.bonus_sessions_remaining).toBe(0); lookup.mockRestore();
  });

});
