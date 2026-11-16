import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import mysql from 'mysql2/promise';
const m = vi.hoisted(() => ({ pool: null, sender: null }));
vi.mock('../../config/database.js', () => ({ default: { execute: (...args) => m.pool.execute(...args), getConnection: () => m.pool.getConnection() } }));
vi.mock('../clientSessionBookingRollout.service.js', () => ({ sessionBookingProviders: async () => [{ id: 3, name: 'Synthetic provider' }] }));
vi.mock('../smsCompliance.service.js', () => ({ getSmsSender: async () => m.sender, isSmsSuppressed: async () => false }));
import { readTransitionWeek, saveTransitionWeek } from '../transitionWeek.service.js';
import { capturePhoneEnrollmentCommand, phoneEnrollmentEvidence, reviewPhoneEnrollment } from '../smsPhoneEnrollment.service.js';
import { applyNotifyreAccountCommand } from '../notifyreRecipientState.service.js';
import { emptyTransitionState } from '../../content/transitionWeek.js';
const port = Number(process.env.TRANSITION_WEEK_TEST_MYSQL_PORT);
describe.skipIf(!port)('native MySQL transition and phone evidence transactions', () => {
  let admin, database, migration, previousKey;
  const at = Date.now() - 10000, phone = '+13035550101';
  beforeAll(async () => {
    if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) throw Error('Use an explicit disposable loopback test port.');
    previousKey = process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64;
    process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = randomBytes(32).toString('base64');
    database = `transition_week_test_${process.pid}`;
    admin = await mysql.createConnection({ host: '127.0.0.1', port, user: 'root', multipleStatements: true });
    await admin.query(`CREATE DATABASE \`${database}\``);
    m.pool = mysql.createPool({ host: '127.0.0.1', port, user: 'root', database, connectionLimit: 6, multipleStatements: true });
    migration = await fs.readFile(new URL('../../../../database/migrations/1830_practice_transition_week.sql', import.meta.url), 'utf8');
    await m.pool.query(migration);
    await m.pool.query(`CREATE TABLE agencies (id INT PRIMARY KEY,feature_flags JSON);
      INSERT INTO agencies VALUES (2,JSON_OBJECT());
      CREATE TABLE users (id INT PRIMARY KEY,role VARCHAR(32),is_active TINYINT,is_archived TINYINT,phone_number VARCHAR(20),personal_phone VARCHAR(20),work_phone VARCHAR(20));
      CREATE TABLE clients (id INT PRIMARY KEY,agency_id INT,user_id INT);
      CREATE TABLE client_guardians (client_id INT,guardian_user_id INT,access_enabled TINYINT,permissions_json JSON);
      CREATE TABLE twilio_numbers (id INT PRIMARY KEY,agency_id INT,phone_number VARCHAR(20));
      CREATE TABLE auricwell_sms_phone_state (phone_key CHAR(64) PRIMARY KEY,blocked TINYINT DEFAULT 0,command_at BIGINT DEFAULT 0,updated_at DATETIME(3));
      CREATE TABLE auricwell_sms_contacts (id INT PRIMARY KEY,phone_key CHAR(64));
      CREATE TABLE auricwell_sms_outbox (id INT PRIMARY KEY,contact_id INT,status VARCHAR(24),updated_at DATETIME(3));
      CREATE TABLE sms_recipient_permissions (scope_key VARCHAR(80),phone VARCHAR(20),purpose VARCHAR(32),status VARCHAR(16),evidence_json JSON,expires_at DATETIME NULL,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(scope_key,phone,purpose));
      CREATE TABLE sms_permission_events (id BIGINT AUTO_INCREMENT PRIMARY KEY,scope_key VARCHAR(80),phone VARCHAR(20),purpose VARCHAR(32),status VARCHAR(16),evidence_json JSON,provider_message_id VARCHAR(100),UNIQUE KEY event_key(scope_key,phone,purpose,provider_message_id));
      INSERT INTO users VALUES(22,'client_guardian',1,0,'+13035550101',NULL,NULL);
      INSERT INTO clients VALUES(40,6,NULL);
      INSERT INTO client_guardians VALUES(40,22,1,JSON_OBJECT());
      INSERT INTO twilio_numbers VALUES(7,6,'+13035550200');`);
  });
  beforeEach(async () => {
    await m.pool.query('DELETE FROM practice_transition_week_events; DELETE FROM practice_transition_weeks; DELETE FROM sms_phone_enrollment_events; DELETE FROM sms_phone_enrollments; DELETE FROM sms_permission_events; DELETE FROM sms_recipient_permissions; DELETE FROM auricwell_sms_phone_state; UPDATE client_guardians SET permissions_json=JSON_OBJECT(),access_enabled=1;');
    m.sender = { id: 7, agency_id: 6, scope: 'campaign:test-campaign', registration: { provider: 'notifyre', brandId: 'test-brand', campaignId: 'test-campaign', resellerId: 'test-reseller', brandName: 'Test practice', legalName: 'Test practice LLC', supportContact: 'support@example.test', website: 'https://example.test', privacyUrl: 'https://example.test/privacy', termsUrl: 'https://example.test/terms', evidenceUrl: 'https://example.test/consent', purposes: ['care','reminders'], keywordOwner: 'notifyre', approved: true, numberLinked: true, allowRestart: true, startEnrollment: { enabled: true, version: 'v1', approvalReference: 'synthetic-approval', disclosure: 'Synthetic approved disclosure', purposes: ['reminders'] } } };
  });
  afterAll(async () => {
    if (m.pool) await m.pool.end();
    if (admin) { if (database) await admin.query(`DROP DATABASE IF EXISTS \`${database}\``); await admin.end(); }
    if (previousKey === undefined) delete process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64; else process.env.CLIENT_CHAT_ENCRYPTION_KEY_BASE64 = previousKey;
  });
  const save = state => saveTransitionWeek({ agencyId: 6, actorUserId: 99, input: { action: 'save', revision: 0, state } });
  async function capture(keyword = 'START', offset = 0) {
    const db = await m.pool.getConnection();
    try { await capturePhoneEnrollmentCommand({ sender: m.sender, phone, keyword, messageId: `${keyword}:${offset}`, receivedAt: at + offset }, db); }
    finally { db.release(); }
  }
  it('applies additive SQL twice and encrypts source evidence without changing the saved board', async () => {
    const state = emptyTransitionState(); state.tasks.owners.owner = 'Synthetic lead';
    await save(state); await m.pool.query(migration);
    expect((await readTransitionWeek(6)).state.tasks.owners.owner).toBe('Synthetic lead');
    const [[stored]] = await m.pool.execute('SELECT payload_json FROM practice_transition_weeks WHERE agency_id=6');
    expect(JSON.stringify(stored.payload_json)).not.toContain('Synthetic lead');
  });
  it('serializes concurrent first writes and retains exactly one immutable revision', async () => {
    const results = await Promise.allSettled([save(emptyTransitionState()), save(emptyTransitionState())]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected').reason.status).toBe(409);
    const [[count]] = await m.pool.execute('SELECT COUNT(*) AS n FROM practice_transition_week_events'); expect(count.n).toBe(1);
  });
  it('freezes a verified roster and activates only the explicit ITSCO cohort evidence gate', async () => {
    const board = await saveTransitionWeek({ agencyId: 2, actorUserId: 99, input: { action: 'freeze_ranking', revision: 0, sourceReference: 'Synthetic source', rows: [{ providerId: 3, completedFourWeeks: 4, upcomingWeek: 1 }] } });
    expect(board.state.ranking.rows[0].cohort).toBe(1);
    const [[agency]] = await m.pool.execute('SELECT feature_flags FROM agencies WHERE id=2');
    expect(agency.feature_flags.transitionWeek.enforceCohorts).toBe(true);
    expect(agency.feature_flags.clientSessionBookingRollout).toBeUndefined();
  });
  it('retains no-account START and duplicates once, with newer STOP dominating delayed START', async () => {
    await capture(); await capture(); await capture('STOP', 2000); await capture('START', 1000);
    const [[row]] = await m.pool.execute('SELECT * FROM sms_phone_enrollments');
    expect(row.status).toBe('stopped'); expect(row.linked_user_id).toBeNull();
    expect(JSON.stringify(row.payload_json)).not.toContain(phone);
    const [[events]] = await m.pool.execute('SELECT COUNT(*) AS n FROM sms_phone_enrollment_events'); expect(events.n).toBe(3);
    const [[permissions]] = await m.pool.execute('SELECT COUNT(*) AS n FROM sms_recipient_permissions'); expect(permissions.n).toBe(0);
  });
  it('links verified guardian consent atomically without changing original carrier evidence', async () => {
    await capture(); const [[row]] = await m.pool.execute('SELECT id,payload_json FROM sms_phone_enrollments');
    const original = await phoneEnrollmentEvidence(6, row.id);
    const result = await reviewPhoneEnrollment({ agencyId: 6, id: row.id, userId: 22, clientId: 40, identityVerified: true, actorUserId: 99 });
    expect(result.status).toBe('linked'); expect(await phoneEnrollmentEvidence(6, row.id)).toEqual(original);
    const [[grant]] = await m.pool.execute('SELECT * FROM sms_recipient_permissions'); expect(grant.purpose).toBe('reminders'); expect(grant.evidence_json.source).toBe('inbound_start_reviewed');
    const [[guardian]] = await m.pool.execute('SELECT COUNT(*) AS n FROM client_guardians'); expect(guardian.n).toBe(1);
  });
  it('blocks restricted guardians and a real account-wide STOP from another sender', async () => {
    await capture(); const [[row]] = await m.pool.execute('SELECT id FROM sms_phone_enrollments');
    await m.pool.execute("UPDATE client_guardians SET permissions_json=JSON_OBJECT('noView',true)");
    const request = { agencyId: 6, id: row.id, userId: 22, clientId: 40, identityVerified: true, actorUserId: 99 };
    await expect(reviewPhoneEnrollment(request)).rejects.toMatchObject({ status: 409 });
    await m.pool.execute('UPDATE client_guardians SET permissions_json=JSON_OBJECT()');
    const db = await m.pool.getConnection();
    try { await db.beginTransaction(); await applyNotifyreAccountCommand({ phone, keyword: 'STOP', at: at + 1000 }, db); await db.commit(); } finally { db.release(); }
    await expect(reviewPhoneEnrollment(request)).rejects.toThrow('STOP');
    const [[permissions]] = await m.pool.execute('SELECT COUNT(*) AS n FROM sms_recipient_permissions'); expect(permissions.n).toBe(0);
  });
});
