import { afterAll, beforeAll, expect, it, describe } from 'vitest';
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { discoverHiringMilestones, hiringMilestoneSource } from '../hiringMilestoneNotices.service.js';
import { splitSqlStatements } from '../../utils/migrationSql.js';

describe.skipIf(!process.env.SCHEDULING_TEST_MYSQL_PORT)('hiring milestones on real local MySQL', () => {
 const schema = `codex_offer_notices_${process.pid}_${Date.now()}`;
 let admin, db;
 beforeAll(async () => {
  const options = { host: '127.0.0.1', port: Number(process.env.SCHEDULING_TEST_MYSQL_PORT), user: 'root', password: '', timezone: '+00:00' };
  admin = await mysql.createConnection(options);
  await admin.query(`CREATE DATABASE ${schema}`);
  db = await mysql.createConnection({ ...options, database: schema });
  const migration = await readFile(new URL('../../../../database/migrations/1885_hiring_milestone_group_notices.sql', import.meta.url), 'utf8');
  for (let attempt = 0; attempt < 2; attempt++) for (const sql of splitSqlStatements(migration)) await db.query(sql);
  for (const sql of [
   'CREATE TABLE agencies(id INT,name TEXT,slug TEXT,custom_domain TEXT,feature_flags JSON,logo_path TEXT,color_palette JSON,is_active INT,is_archived INT)',
   'CREATE TABLE users(id INT,first_name TEXT,last_name TEXT,is_active INT,is_archived INT,terminated_at DATETIME,status TEXT)',
   'CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active INT)',
   'CREATE TABLE tasks(id INT,assigned_to_user_id INT,assigned_to_agency_id INT,task_type TEXT,document_action_type TEXT,status TEXT,metadata JSON)',
   'CREATE TABLE plotline_companies(agency_id INT,is_qa INT)',
   'CREATE TABLE hire_journeys(user_id INT,agency_id INT,prehire_completed_at DATETIME)',
   'CREATE TABLE signed_documents(task_id INT,user_id INT,signed_at DATETIME,signed_pdf_path TEXT,pdf_hash TEXT)',
   'CREATE TABLE contract_generations(task_id INT,agency_id INT,candidate_user_id INT)',
   `INSERT INTO agencies VALUES(463,'Juniper','juniper',NULL,JSON_OBJECT('peopleOperationsSubmissionNotificationsEnabled',true,'peopleOperationsSubmissionReview',JSON_OBJECT('reviewedAt','2026-11-01T00:00:00Z')),NULL,NULL,1,0)`,
   "INSERT INTO users VALUES(42,'Taylor','Example',1,0,NULL,'PREHIRE_OPEN')",
   'INSERT INTO user_agencies VALUES(42,463,1)',
   "INSERT INTO tasks VALUES(123,42,463,'document','signature','completed',JSON_OBJECT())",
   'INSERT INTO hire_journeys VALUES(42,463,NULL)',
   "INSERT INTO signed_documents VALUES(123,42,UTC_TIMESTAMP(),'synthetic.pdf','synthetic-hash')",
   'INSERT INTO contract_generations VALUES(123,463,42)',
   'UPDATE hiring_milestone_rollout SET started_at=UTC_TIMESTAMP()-INTERVAL 1 MINUTE'
  ]) await db.query(sql);
 });
 afterAll(async () => { if (db) await db.end(); if (admin) { await admin.query(`DROP DATABASE ${schema}`); await admin.end(); } });
 it('queues both departments once for a saved signature, then queues completed pre-hire separately', async () => {
  await discoverHiringMilestones(db); await discoverHiringMilestones(db);
  let [events] = await db.query('SELECT * FROM hiring_milestone_group_notices');
  expect(events).toHaveLength(2);
  expect(events.map(event => event.department).sort()).toEqual(['admin', 'people_operations']);
  expect(await hiringMilestoneSource(events[0], db)).toMatchObject({ first_name: 'Taylor', prehire_completed_at: null });
  await db.query('UPDATE hire_journeys SET prehire_completed_at=UTC_TIMESTAMP()');
  await discoverHiringMilestones(db);
  [events] = await db.query("SELECT * FROM hiring_milestone_group_notices WHERE event_type='prehire_complete'");
  expect(events).toHaveLength(2);
  expect(await hiringMilestoneSource(events[0], db)).toMatchObject({ first_name: 'Taylor' });
  await db.query('UPDATE hire_journeys SET prehire_completed_at=NULL');
  expect(await hiringMilestoneSource(events[0], db)).toBeNull();
 });
 it('excludes wrong signers, unsigned tasks, amendments, old signatures and wrong-company generations', async () => {
  await db.query('DELETE FROM hiring_milestone_group_notices');
  const scenarios = [
   ["UPDATE signed_documents SET user_id=99", "UPDATE signed_documents SET user_id=42"],
   ["UPDATE tasks SET status='pending'", "UPDATE tasks SET status='completed'"],
   ["UPDATE tasks SET metadata=JSON_OBJECT('source','provider_update')", "UPDATE tasks SET metadata=JSON_OBJECT()"],
   ["UPDATE signed_documents SET signed_at='2026-01-01'", 'UPDATE signed_documents SET signed_at=UTC_TIMESTAMP()'],
   ['UPDATE contract_generations SET agency_id=464', 'UPDATE contract_generations SET agency_id=463']
  ];
  for (const [change, restore] of scenarios) {
   await db.query(change); await discoverHiringMilestones(db);
   const [[count]] = await db.query('SELECT COUNT(*) AS total FROM hiring_milestone_group_notices');
   expect(count.total, change).toBe(0); await db.query(restore);
  }
  await db.query("DELETE FROM contract_generations");
  await db.query("UPDATE tasks SET metadata=JSON_OBJECT('employmentContract',true)");
  await discoverHiringMilestones(db);
  const [[count]] = await db.query('SELECT COUNT(*) AS total FROM hiring_milestone_group_notices');
  expect(count.total).toBe(2);
 });
});
