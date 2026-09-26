import test from 'node:test';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';

test('planned work is tenant scoped, deduplicated and excluded once claimed or cancelled', { skip: process.env.BILLING_NAVIGATION_MYSQL_TEST !== '1' }, async () => {
  // Use a unique synthetic database on the isolated test server; never touch application databases.
  const db = await mysql.createConnection({ host: '127.0.0.1', port: 33316, user: 'root', database: 'mysql', timezone: '+00:00' });
  const schema = `billing_navigation_test_${randomUUID().replaceAll('-', '')}`;
  await db.query(`CREATE DATABASE ${schema}`);
  await db.query(`USE ${schema}`);
  const { plannedBillingServices } = await import('../plannedBillingServices.service.js');
  const { default: mainPool } = await import('../../config/database.js');
  const { default: clinicalPool } = await import('../../config/clinicalDatabase.js');
  try {
    await db.query(`CREATE TABLE clinical_sessions (id INT, agency_id INT, appointment_id INT, client_id INT, provider_user_id INT, office_event_id INT, service_code VARCHAR(10), metadata_json JSON, scheduled_start_at DATETIME, source_timezone VARCHAR(64), encounter_status VARCHAR(30))`);
    await db.query(`CREATE TABLE clinical_notes (id INT, clinical_session_id INT, agency_id INT, is_deleted INT, provider_signed_at DATETIME)`);
    await db.query(`CREATE TABLE clinical_claims (clinical_session_id INT, agency_id INT, is_deleted INT)`);
    await db.query(`CREATE TABLE appointments (id INT, agency_id INT, clinical_session_id INT, office_event_id INT, provider_user_id INT, service_code VARCHAR(10), start_at DATETIME, source_timezone VARCHAR(64), status VARCHAR(30))`);
    await db.query(`CREATE TABLE appointment_participants (appointment_id INT, client_id INT, role VARCHAR(20))`);
    await db.query(`CREATE TABLE clients (id INT, agency_id INT)`);
    await db.query('INSERT INTO clients VALUES (10,377),(11,377),(12,378)');
    await db.query(`INSERT INTO clinical_sessions VALUES
      (1,377,100,10,90,NULL,'90837',NULL,'2099-10-02 02:00:00','America/Denver','scheduled'),
      (2,377,101,11,90,NULL,'90837',NULL,'2099-10-02 02:00:00','America/Denver','completed'),
      (3,378,104,12,91,NULL,'90837',NULL,'2099-10-02 02:00:00','America/Denver','scheduled'),
      (4,377,105,10,90,NULL,'90837',NULL,'2099-10-03 02:00:00','America/Denver','cancelled')`);
    await db.query('INSERT INTO clinical_claims VALUES (2,377,0)');
    await db.query(`INSERT INTO appointments VALUES
      (100,377,NULL,NULL,90,'90837','2099-10-02 02:00:00','America/Denver','scheduled'),
      (101,377,NULL,NULL,90,'90837','2099-10-02 02:00:00','America/Denver','completed'),
      (102,377,NULL,NULL,90,'90837','2099-10-03 02:00:00','America/Denver','scheduled'),
      (103,377,NULL,NULL,90,'90837','2099-10-03 02:00:00','America/Denver','cancelled'),
      (104,378,NULL,NULL,91,'90837','2099-10-02 02:00:00','America/Denver','scheduled'),
      (105,377,NULL,NULL,90,'90837','2099-10-03 02:00:00','America/Denver','scheduled')`);
    await db.query("INSERT INTO appointment_participants VALUES (100,10,'client'),(101,11,'client'),(102,10,'client'),(103,10,'client'),(104,12,'client'),(105,10,'client'),(102,12,'client')");
    const result = await plannedBillingServices(377, { main: db, clinical: db });
    assert.equal(result.appointmentsUnavailable, false);
    assert.equal(result.items.length, 2);
    assert.deepEqual(result.items.map(i => i.appointmentId).sort(), [100,102]);
    assert.equal(result.items.find(i => i.appointmentId === 100).serviceDate, '2099-10-01');
    assert.equal(result.items.find(i => i.appointmentId === 100).sessionId, 1);
    assert.equal(result.items.find(i => i.appointmentId === 102).sessionId, null);
    const [[count]] = await db.query('SELECT COUNT(*) n FROM clinical_claims');
    assert.equal(count.n, 1);
  } finally {
    await db.query(`DROP DATABASE ${schema}`);
    await db.end();
    await mainPool.end();
    await clinicalPool.end();
  }
});
