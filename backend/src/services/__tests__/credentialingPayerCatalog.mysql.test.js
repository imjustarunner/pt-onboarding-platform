import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import mysql from 'mysql2/promise';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { syncCredentialingPayerCatalog } from '../credentialingPayerCatalog.service.js';
const socket = process.env.FEE_MYSQL_SOCKET;
const enabled = Boolean(socket) || process.env.FEE_SCHEDULE_MYSQL_TEST === '1';
const connection = socket ? { socketPath: socket, user: 'root' } : { host: '127.0.0.1', port: 33317, user: 'root', password: 'synthetic-root-only' };
(enabled ? describe : describe.skip)('credentialing payer synchronization against isolated MySQL', () => {
  let admin, db;
  beforeAll(async () => {
    if (socket && !/^\/private\/tmp\/pt-billing-fees-(?:h0002-)?mysql-20261103\//.test(socket)) throw new Error('Only the task-owned local MySQL socket is supported');
    admin = await mysql.createConnection(connection);
    await admin.query('DROP DATABASE IF EXISTS credentialing_payer_catalog_qa');
    await admin.query('CREATE DATABASE credentialing_payer_catalog_qa');
    db = mysql.createPool({ ...connection, database: 'credentialing_payer_catalog_qa', connectionLimit: 5 });
    for (const sql of [
      'CREATE TABLE agencies(id INT PRIMARY KEY)',
      'CREATE TABLE medical_payer_setup_requests(id INT PRIMARY KEY,agency_id INT,payer_name VARCHAR(120))',
      'CREATE TABLE medical_payer_setup_details(request_id INT PRIMARY KEY,claimmd_payer_id VARCHAR(32),directory_name VARCHAR(120),directory_status VARCHAR(30))',
      'CREATE TABLE insurance_credentialing_definitions(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,name VARCHAR(120),sort_order INT DEFAULT 0,INDEX(agency_id))',
      'CREATE TABLE credentialing_payer_links(agency_id INT,insurance_definition_id INT,payer_id VARCHAR(32),evidence_reference VARCHAR(500),updated_by_user_id INT,PRIMARY KEY(agency_id,insurance_definition_id))',
      'CREATE TABLE credentialing_workflow_events(id INT AUTO_INCREMENT PRIMARY KEY,agency_id INT,subject_type VARCHAR(20),record_id INT,actor_user_id INT,before_json JSON,after_json JSON)',
      'CREATE TABLE user_insurance_credentialing(id INT PRIMARY KEY,user_id INT,insurance_credentialing_definition_id INT,effective_date DATE)',
      'INSERT INTO agencies VALUES (2),(6)',
      "INSERT INTO medical_payer_setup_requests VALUES (1,2,'Aetna'),(2,6,'Other tenant insurer')",
      "INSERT INTO medical_payer_setup_details VALUES (1,'60054','Aetna','id_match'),(2,'OTHER','Other tenant insurer','id_match')",
      "INSERT INTO insurance_credentialing_definitions VALUES (3,2,'Aetna',0),(7,6,'Aetna',0)",
      "INSERT INTO user_insurance_credentialing VALUES (1,8,3,'2020-01-01')"
    ]) await db.query(sql);
  });
  afterAll(async () => { if (db) await db.end(); if (admin) { await admin.query('DROP DATABASE IF EXISTS credentialing_payer_catalog_qa'); await admin.end(); } });
  it('applies only the reviewed plan, preserves provider evidence, appends audit events and serializes concurrent retries', async () => {
    const preview = await syncCredentialingPayerCatalog({ agencyId: 2 }, db);
    expect(preview.operations).toMatchObject([{ action: 'link_existing', definitionId: 3 }]);
    expect(preview.planToken).toMatch(/^[a-f0-9]{64}$/);
    await expect(syncCredentialingPayerCatalog({ agencyId: 2, actorUserId: 501, apply: true }, db)).rejects.toMatchObject({ status: 409 });
    await db.query("INSERT INTO medical_payer_setup_requests VALUES (3,2,'New insurer')");
    await db.query("INSERT INTO medical_payer_setup_details VALUES (3,'NEW','New insurer','id_match')");
    await expect(syncCredentialingPayerCatalog({ agencyId: 2, actorUserId: 501, apply: true, planToken: preview.planToken }, db)).rejects.toMatchObject({ status: 409 });
    const [[noWrites]] = await db.query('SELECT COUNT(*) AS n FROM credentialing_payer_links'); expect(noWrites.n).toBe(0);
    const next = await syncCredentialingPayerCatalog({ agencyId: 2 }, db);
    const applied = await syncCredentialingPayerCatalog({ agencyId: 2, actorUserId: 501, apply: true, planToken: next.planToken }, db);
    expect(applied.results).toHaveLength(2);
    const [[other]] = await db.query('SELECT COUNT(*) AS n FROM credentialing_payer_links WHERE agency_id=6'); expect(other.n).toBe(0);
    const [credentials] = await db.query("SELECT user_id,insurance_credentialing_definition_id,DATE_FORMAT(effective_date,'%Y-%m-%d') AS effective_date FROM user_insurance_credentialing");
    expect(credentials).toEqual([{ user_id: 8, insurance_credentialing_definition_id: 3, effective_date: '2020-01-01' }]);
    const repeat = await syncCredentialingPayerCatalog({ agencyId: 2 }, db);
    expect((await syncCredentialingPayerCatalog({ agencyId: 2, actorUserId: 501, apply: true, planToken: repeat.planToken }, db)).results).toEqual([]);
    const [[events]] = await db.query('SELECT COUNT(*) AS n FROM credentialing_workflow_events'); expect(events.n).toBe(2);
    await db.query("INSERT INTO medical_payer_setup_requests VALUES (4,2,'Third insurer')");
    await db.query("INSERT INTO medical_payer_setup_details VALUES (4,'THIRD','Third insurer','id_match')");
    const racing = await syncCredentialingPayerCatalog({ agencyId: 2 }, db);
    const results = await Promise.allSettled([1,2].map(() => syncCredentialingPayerCatalog({ agencyId: 2, actorUserId: 501, apply: true, planToken: racing.planToken }, db)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(r => r.status === 'rejected').reason).toMatchObject({ status: 409 });
    const [[finalEvents]] = await db.query('SELECT COUNT(*) AS n FROM credentialing_workflow_events'); expect(finalEvents.n).toBe(3);
    const [[counts]] = await db.query('SELECT COUNT(*) AS n FROM insurance_credentialing_definitions WHERE agency_id=2'); expect(counts.n).toBe(3);
  });
});
