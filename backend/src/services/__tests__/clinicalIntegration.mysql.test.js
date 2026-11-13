// Opt-in disposable localhost database; never loads production credentials.
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { splitSqlStatements, stripSqlLineComments } from '../../../../database/migrationSqlUtils.js';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { ensureSchedulingCatalogEntry } from '../schedulingCatalogSync.service.js';
import { readAppointmentNotificationRules, saveAppointmentNotificationRules } from '../appointmentNotificationCustomization.service.js';
import { refreshClientSessionNotifications } from '../sessionPreferenceSchedule.service.js';
describe.skipIf(!process.env.CLINICAL_INTEGRATION_MYSQL_PORT)('clinical integration against migration-defined MySQL tables', () => {
  let admin, db, created = false;
  const name = `codex_clinical_integrations_${process.pid}`;
  const delivery = { kind: 'standard_reminder', ruleKey: 'tenant:standard', channel: 'email', offsetMinutes: 1440, recipientClientId: 21, recipientGuardianUserId: 10 };
  let plan;
  beforeAll(async () => {
    const settings = { host: '127.0.0.1', port: Number(process.env.CLINICAL_INTEGRATION_MYSQL_PORT), user: 'root', password: '', timezone: '+00:00' };
    admin = await mysql.createConnection(settings);
    await admin.query(`CREATE DATABASE ${name}`); created = true;
    db = mysql.createPool({ ...settings, database: name, connectionLimit: 6 });
    await db.query('CREATE TABLE agencies (id INT PRIMARY KEY)');
    await db.query("CREATE TABLE appointments (id INT UNSIGNED PRIMARY KEY, agency_id INT, start_at DATETIME, status VARCHAR(40), product_origin VARCHAR(40))");
    await db.query('CREATE TABLE appointment_participants (appointment_id INT UNSIGNED, client_id INT)');
    for (const [file, pattern] of [
      ['445_scheduling_taxonomy_and_service_code_eligibility.sql', /^CREATE TABLE IF NOT EXISTS (scheduling_service_codes|credential_service_code_eligibility) /],
      ['447_scheduling_service_code_duration_rules.sql', /^ALTER TABLE scheduling_service_codes /],
      ['982_appointment_reminders.sql', /^CREATE TABLE IF NOT EXISTS appointment_reminders /],
      ['983_session_notification_system.sql', /^ALTER TABLE appointment_reminders /],
      ['1702_appointment_guardian_recipients.sql', /^ALTER TABLE appointment_reminders /],
      ['1723_contact_reminder_sms_consent.sql', /^ALTER TABLE appointment_reminders /],
      ['1816_appointment_notification_customizations.sql', /^CREATE TABLE IF NOT EXISTS appointment_notification_customizations /],
      ['1817_owned_office_session_jobs.sql', /^CREATE TABLE IF NOT EXISTS owned_office_session_jobs /]
    ]) {
      const source = await readFile(new URL(`../../../../database/migrations/${file}`, import.meta.url), 'utf8');
      for (const sql of splitSqlStatements(stripSqlLineComments(source))) if (pattern.test(sql.replace(/\s+/g, ' ').trim())) await db.query(sql);
    }
    await db.query('INSERT INTO agencies VALUES (377),(378)');
    await db.query("INSERT INTO appointments VALUES (8,377,'2080-11-29 18:00:00','scheduled',NULL),(9,378,'2080-11-29 18:00:00','scheduled',NULL),(10,377,'2080-11-29 18:00:00','canceled',NULL),(11,377,'2020-01-01 18:00:00','scheduled',NULL)");
    await db.query('INSERT INTO appointment_participants VALUES (8,21),(9,21),(10,21),(11,21)');
  });
  beforeEach(async () => {
    await db.query('DELETE FROM appointment_reminders');
    await db.query('DELETE FROM appointment_notification_customizations');
    plan = { appointment: { id: 8, agencyId: 377, startAt: '2080-11-29 18:00:00' }, deliveries: [delivery] };
  });
  afterAll(async () => {
    if (db) await db.end();
    if (created) await admin.query(`DROP DATABASE ${name}`);
    if (admin) await admin.end();
  });
  const refresh = () => refreshClientSessionNotifications(377, 21, 10, { db, getPlan: async () => plan });
  it('persists and atomically leases a booking job without duplicating retries',async()=>{
    await db.execute(`INSERT INTO owned_office_session_jobs (id,agency_id,provider_user_id,created_by_user_id,booking_key,total_count,input_json)
      VALUES ('job-test',377,501,501,?,26,?) ON DUPLICATE KEY UPDATE id=id`,['a'.repeat(64),JSON.stringify({office:{id:1}})]);
    await db.execute(`INSERT INTO owned_office_session_jobs (id,agency_id,provider_user_id,created_by_user_id,booking_key,total_count,input_json)
      VALUES ('job-duplicate',377,501,501,?,26,?) ON DUPLICATE KEY UPDATE id=id`,['a'.repeat(64),'{}']);
    const [claim]=await db.execute(`UPDATE owned_office_session_jobs SET status='processing',lease_token='test-lease',lease_until=DATE_ADD(UTC_TIMESTAMP(),INTERVAL 15 MINUTE)
      WHERE (status='queued' AND available_at<=UTC_TIMESTAMP()) OR (status='processing' AND lease_until<UTC_TIMESTAMP()) ORDER BY available_at LIMIT 1`);
    expect(claim.affectedRows).toBe(1);const [[count]]=await db.query('SELECT COUNT(*) AS n FROM owned_office_session_jobs');expect(count.n).toBe(1);
    const [[job]]=await db.query("SELECT * FROM owned_office_session_jobs WHERE lease_token='test-lease'");expect(job.id).toBe('job-test');
  });
  it('persists session-specific choices, keeps agency boundaries and supports returning to defaults', async () => {
    const rules=[{id:'day-before',channel:'email',offsetMinutes:1440,message:'Please arrive early.',askConfirmation:true}];
    await saveAppointmentNotificationRules(8,377,rules,501,db);
    expect(await readAppointmentNotificationRules(8,377,db)).toEqual(rules);
    expect(await readAppointmentNotificationRules(8,378,db)).toEqual([]);
    await saveAppointmentNotificationRules(8,378,[{...rules[0],message:'Foreign change'}],507,db);
    expect(await readAppointmentNotificationRules(8,377,db)).toEqual(rules);
    await saveAppointmentNotificationRules(8,377,[],501,db);
    expect(await readAppointmentNotificationRules(8,377,db)).toEqual([]);
  });
  it('uses actual dictionary columns and preserves saved global restrictions on repeated sync', async () => {
    await ensureSchedulingCatalogEntry('90791', { db });
    expect((await db.query("SELECT code FROM scheduling_service_codes WHERE code='90791'"))[0]).toHaveLength(1);
    expect((await db.query("SELECT credential_tier FROM credential_service_code_eligibility WHERE service_code='90791'"))[0]).toEqual([{ credential_tier: 'intern_plus' }]);
    await db.query("UPDATE scheduling_service_codes SET label='Saved label',is_active=0 WHERE code='90791'");
    await db.query("UPDATE credential_service_code_eligibility SET allowed=0 WHERE service_code='90791'");
    await ensureSchedulingCatalogEntry('90791', { db });
    expect((await db.query("SELECT label,is_active FROM scheduling_service_codes WHERE code='90791'"))[0][0]).toEqual({ label: 'Saved label', is_active: 0 });
    expect((await db.query("SELECT allowed FROM credential_service_code_eligibility WHERE service_code='90791'"))[0][0].allowed).toBe(0);
  });
  it('serializes concurrent saves, preserves sent history, and never queues another agency or past/canceled visits', async () => {
    await Promise.all([refresh(), refresh()]);
    const [rows] = await db.query('SELECT * FROM appointment_reminders');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ appointment_id: 8, agency_id: 377, recipient_guardian_user_id: 10, recipient_client_id: 21, status: 'pending' });
    expect(rows[0].scheduled_for.toISOString()).toBe('2080-11-28T18:00:00.000Z');
    await db.query("UPDATE appointment_reminders SET status='sent'");
    await refresh();
    expect((await db.query('SELECT status FROM appointment_reminders'))[0]).toEqual([{ status: 'sent' }]);
  });
  it('cancels only the changed recipient and permits a later opt-in without duplicating another guardian', async () => {
    await refresh();
    await db.query("INSERT INTO appointment_reminders (appointment_id,agency_id,channel,kind,rule_key,scheduled_for,recipient_guardian_user_id,recipient_client_id) VALUES (8,377,'email','standard_reminder','tenant:standard','2080-11-28 18:00:00',11,21)");
    plan.deliveries = []; await refresh();
    expect((await db.query('SELECT recipient_guardian_user_id,status FROM appointment_reminders ORDER BY id'))[0]).toEqual([{ recipient_guardian_user_id: 10, status: 'canceled' },{ recipient_guardian_user_id: 11, status: 'pending' }]);
    plan.deliveries = [delivery]; await refresh(); await refresh();
    expect((await db.query("SELECT recipient_guardian_user_id FROM appointment_reminders WHERE status='pending' ORDER BY recipient_guardian_user_id"))[0]).toEqual([{ recipient_guardian_user_id: 10 },{ recipient_guardian_user_id: 11 }]);
  });
  it('prevents legacy expansion from recreating this guardian schedule while preserving the other guardian cadence', async () => {
    const [parent] = await db.query("INSERT INTO appointment_reminders (appointment_id,agency_id,channel,kind,rule_key,scheduled_for) VALUES (8,377,'email','standard_reminder','cadence_7d','2080-11-22 18:00:00')");
    await refresh(); await refresh();
    const expand = user => db.query("INSERT IGNORE INTO appointment_reminders (appointment_id,agency_id,channel,kind,scheduled_for,recipient_guardian_user_id,recipient_client_id,parent_reminder_id) VALUES (8,377,'email','standard_reminder','2080-11-22 18:00:00',?,21,?)", [user, parent.insertId]);
    expect((await expand(10))[0].affectedRows).toBe(0);
    expect((await expand(11))[0].affectedRows).toBe(1);
    expect((await db.query('SELECT status FROM appointment_reminders WHERE id=?', [parent.insertId]))[0][0].status).toBe('pending');
    expect((await db.query("SELECT id FROM appointment_reminders WHERE recipient_guardian_user_id=10 AND status='pending'"))[0]).toHaveLength(1);
  });
});
