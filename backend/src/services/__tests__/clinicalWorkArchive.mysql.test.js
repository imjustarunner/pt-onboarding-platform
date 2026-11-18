import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from './fixtures/isolatedWorkflowMysql.js';
import { splitSqlStatements, stripSqlLineComments } from '../../utils/migrationSql.js';
const bridge = vi.hoisted(() => ({ db: null }));
vi.mock('../../config/database.js', () => ({ default: { execute: (...args) => bridge.db.execute(...args), getConnection: () => bridge.db.getConnection() }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../clinicalEligibility.service.js', () => ({ default: {} }));
import { createClinicalWorkArchive } from '../clinicalWorkArchive.service.js';
import { visibleClinicalWork, assertClinicalWorkActive, requireClinicalWorkArchiveSchema } from '../clinicalWorkArchiveRead.service.js';
import Queue from '../../models/NoteAidWorkQueueItem.model.js';
import Draft from '../../models/ClinicalNoteDraft.model.js';

let fixture, db;
beforeAll(async () => {
  if (!recoveryMysqlEnabled) return;
  fixture = await isolatedWorkflowMysql('clinical_archive'); db = bridge.db = fixture.db;
  for (const sql of [
    'CREATE TABLE users(id INT PRIMARY KEY,role VARCHAR(40),is_active INT,is_archived INT,first_name VARCHAR(40),last_name VARCHAR(40))',
    'CREATE TABLE agencies(id INT PRIMARY KEY)',
    'CREATE TABLE clients(id INT PRIMARY KEY,full_name VARCHAR(100),initials VARCHAR(12))',
    'CREATE TABLE family_receivables(id INT PRIMARY KEY,agency_id INT,source_type VARCHAR(40),source_key VARCHAR(100),status VARCHAR(20))',
    'CREATE TABLE clinical_sessions(id INT PRIMARY KEY,agency_id INT,client_id INT,provider_user_id INT,appointment_id INT,office_event_id INT,billing_encounter_id INT,scheduled_start_at DATETIME,service_code VARCHAR(20),updated_at DATETIME,source_timezone VARCHAR(64) DEFAULT \'America/Denver\',metadata_json JSON)',
    'CREATE TABLE clinical_claims(id INT PRIMARY KEY,agency_id INT,client_id INT,clinical_session_id INT,parent_claim_id INT,claim_lifecycle VARCHAR(40),claim_status VARCHAR(40),claimmd_submitted_at DATETIME,claimmd_claim_id VARCHAR(100),claimmd_connection_id VARCHAR(100),billing_revision INT,updated_at DATETIME,is_legal_hold INT DEFAULT 0,metadata_json JSON,amount_cents INT)',
    'CREATE TABLE clinical_claim_sessions(agency_id INT,clinical_session_id INT,clinical_claim_id INT)',
    'CREATE TABLE clinical_notes(id INT PRIMARY KEY,agency_id INT,clinical_session_id INT,is_legal_hold INT DEFAULT 0,provider_signed_at DATETIME,updated_at DATETIME,note_payload TEXT)',
    'CREATE TABLE appointments(id INT PRIMARY KEY,agency_id INT,clinical_session_id INT,office_event_id INT,provider_schedule_event_id INT,updated_at DATETIME)',
    'CREATE TABLE clinical_note_drafts(id INT PRIMARY KEY,user_id INT,agency_id INT,clinical_session_id INT,client_id INT,office_event_id INT,updated_at DATETIME,input_text TEXT,output_json LONGTEXT,created_at DATETIME DEFAULT \'2000-01-01 00:00:00\')',
    'CREATE TABLE claimmd_claim_events(id INT PRIMARY KEY,agency_id INT,clinical_claim_id INT,event_type VARCHAR(80))',
    'CREATE TABLE claimmd_payment_postings(id INT PRIMARY KEY,agency_id INT,clinical_claim_id INT)',
    'CREATE TABLE user_activity_log(id INT AUTO_INCREMENT PRIMARY KEY,action_type VARCHAR(100),user_id INT,agency_id INT,metadata JSON)'
  ]) await db.query(sql);
  for (const name of ['1359_note_aid_work_queue_items', '1846_clinical_work_archives']) {
    const sql = await fs.readFile(new URL(`../../../../database/migrations/${name}.sql`, import.meta.url), 'utf8');
    for (const statement of splitSqlStatements(stripSqlLineComments(sql))) await db.query(statement);
  }
  await db.execute("INSERT INTO users VALUES (1,'admin',1,0,'Test','Admin'),(4,'provider',1,0,'Test','Provider')");
  await db.execute('INSERT INTO agencies VALUES (2)'); await db.execute("INSERT INTO clients VALUES (3,'Synthetic test client','T.C.'),(5,'Other synthetic client','O.C.')");
  await db.execute("INSERT INTO clinical_sessions(id,agency_id,client_id,provider_user_id,appointment_id,office_event_id,billing_encounter_id,scheduled_start_at,service_code,updated_at) VALUES (10,2,3,4,20,11,NULL,'2026-11-01 18:00:00','90837','2026-11-01 20:00:00'),(11,2,5,4,22,11,NULL,'2026-11-01 19:00:00','90837','2026-11-01 20:00:00')");
  await db.execute("INSERT INTO clinical_claims(id,agency_id,client_id,clinical_session_id,claim_lifecycle,claim_status,billing_revision,updated_at,metadata_json,amount_cents) VALUES (30,2,3,10,'draft','PENDING',1,'2026-11-01 20:00:00',JSON_OBJECT('originalEvidence','retained'),12500)");
  await db.execute('INSERT INTO clinical_claim_sessions VALUES (2,10,30)');
  await db.execute("INSERT INTO clinical_notes VALUES (60,2,10,0,'2026-11-01 20:00:00','2026-11-01 20:00:00','Original signed test note stays intact')");
  await db.execute("INSERT INTO appointments VALUES (20,2,10,11,21,'2026-11-01 20:00:00'),(22,2,11,11,23,'2026-11-01 20:00:00')");
  await db.execute("INSERT INTO clinical_note_drafts(id,user_id,agency_id,clinical_session_id,updated_at,input_text,output_json) VALUES (40,4,2,10,'2026-11-01 20:00:00','Original authored test text','{\"sections\":{\"note\":\"retained\"}}')");
  await db.execute("INSERT INTO note_aid_work_queue_items(id,user_id,agency_id,client_id,clinical_session_id,draft_id,client_key,status,payload_enc,completed_at) VALUES (50,4,2,3,10,40,'archived_test','completed','{}','2020-01-01'),(51,4,2,3,99,NULL,'real_work','not_started','{}',NULL)");
}, 30000);


afterAll(async () => { if (fixture) await fixture.close(); });

it.skipIf(!recoveryMysqlEnabled)('real MySQL retains original records across archive, stale queue sync, attempted deletion, and restore', async () => {
  await requireClinicalWorkArchiveSchema(db);
  const service = createClinicalWorkArchive({ main: db, clinical: db, authorize: async ({ agencyId }) => {
    if (agencyId !== 2) throw Object.assign(new Error('Denied'), { status: 403 });
  } });
  const actor = { id: 1, role: 'admin' }, target = { type: 'claim', id: 30 };
  const tables = ['clinical_sessions','clinical_claims','clinical_notes','appointments','clinical_note_drafts'];
  const before = Object.fromEntries(await Promise.all(tables.map(async name => [name, JSON.stringify((await db.query(`SELECT * FROM ${name}`))[0])])));
  const preview = await service.preview(actor, 2, target);
  expect(preview.summary.counts).toEqual({ sessions: 1, claims: 1, appointments: 1, notes: 1, drafts: 1, myWork: 1 });
  const result = await service.archive(actor, 2, target, preview.version, 'Synthetic test records from prelaunch scheduling');
  const projections = [{ clinical_session_id: 10 }, { claimId: 30 }, { appointment_id: 20 }, { id: 21, archiveResourceType: 'provider_schedule_event' }];
  expect(await visibleClinicalWork(projections, { db })).toEqual([]);
  expect(await visibleClinicalWork([{ id: 11 }], { db, kind: 'office_event' })).toHaveLength(1);
  await Queue.purgeExpiredTerminal({ hours: 1 });
  await Draft.hardDeleteOlderThanDays({ days: 1 });
  await expect(assertClinicalWorkActive({ claimId: 30 }, { db })).rejects.toMatchObject({ code: 'CLINICAL_WORK_ARCHIVED' });
  const visibleQueue = await Queue.listForUser(4);
  expect(visibleQueue.map(row => row.serverId)).toEqual([51]);
  await Queue.syncForUser(4, visibleQueue);
  expect((await db.execute('SELECT id FROM note_aid_work_queue_items WHERE id=50'))[0]).toHaveLength(1);
  await expect(Draft.deleteForUser({ userId: 4, draftIds: [40] })).rejects.toMatchObject({ status: 409 });
  for (const table of tables) expect(JSON.stringify((await db.query(`SELECT * FROM ${table}`))[0])).toBe(before[table]);
  const archives = await service.list(actor, 2);
  expect(archives.items[0]).toMatchObject({ id: result.archiveId, clientName: 'Synthetic test client' });
  await service.restore(actor, 2, result.archiveId, 'Reviewed synthetic group for restoration test');
  expect(await visibleClinicalWork(projections, { db })).toHaveLength(4);
  expect((await Queue.listForUser(4)).map(row => row.serverId).sort()).toEqual([50,51]);
  expect((await db.execute('SELECT action_type,user_id FROM user_activity_log ORDER BY id'))[0]).toEqual([
    { action_type: 'clinical_work_archived', user_id: 1 }, { action_type: 'clinical_work_restored', user_id: 1 }
  ]);
  expect((await db.execute('SELECT reason,restore_reason FROM clinical_work_archives WHERE id=?', [result.archiveId]))[0][0]).toEqual({
    reason: 'Synthetic test records from prelaunch scheduling', restore_reason: 'Reviewed synthetic group for restoration test'
  });
}, 30000);

it.skipIf(!recoveryMysqlEnabled)('serializes competing archives and detects a committed archive despite an older transaction snapshot', async () => {
  let entered, release, secondReady;
  const inside = new Promise(resolve => { entered = resolve; });
  const proceed = new Promise(resolve => { release = resolve; });
  const secondSnapshot = new Promise(resolve => { secondReady = resolve; });
  const firstMain = {
    execute: (...args) => db.execute(...args),
    getConnection: async () => {
      const connection = await db.getConnection();
      return {
        execute: async (sql, ...args) => {
          if (sql.startsWith('INSERT INTO clinical_work_archives')) { entered(); await proceed; }
          return connection.execute(sql, ...args);
        },
        beginTransaction: () => connection.beginTransaction(), commit: () => connection.commit(),
        rollback: () => connection.rollback(), release: () => connection.release()
      };
    }
  };
  const first = createClinicalWorkArchive({ main: firstMain, clinical: db, authorize: async () => {} });
  const second = createClinicalWorkArchive({ main: db, clinical: db, authorize: async () => { secondReady(); } });
  const actor = { id: 1, role: 'admin' }, target = { type: 'claim', id: 30 };
  const { version } = await first.preview(actor, 2, target);
  const one = first.archive(actor, 2, target, version, 'First concurrent test archive request');
  await inside;
  const two = second.archive(actor, 2, target, version, 'Second concurrent test archive request');
  const denied = expect(two).rejects.toMatchObject({ status: 409 });
  await secondSnapshot;
  release();
  await Promise.all([one, denied]);
  const [[count]] = await db.execute('SELECT COUNT(*) AS n FROM clinical_work_archives WHERE restored_at IS NULL');
  expect(Number(count.n)).toBe(1);
}, 20000);

it.skipIf(!recoveryMysqlEnabled)('archives an orphan draft and its queue entry without guessing a link to another session for the same client', async () => {
  await db.execute("INSERT INTO clinical_note_drafts(id,user_id,agency_id,client_id,updated_at,input_text) VALUES (41,4,2,3,'2026-11-01 20:00:00','Retained orphan draft text')");
  await db.execute("INSERT INTO note_aid_work_queue_items(id,user_id,agency_id,client_id,draft_id,client_key,status,payload_enc) VALUES (52,4,2,3,41,'orphan_draft','started','{}')");
  const service = createClinicalWorkArchive({ main: db, clinical: db, authorize: async () => {} });
  const actor = { id: 1, role: 'admin' }, target = { type: 'draft', id: 41 };
  const preview = await service.preview(actor, 2, target);
  expect(preview.summary.counts).toEqual({ sessions: 0, claims: 0, appointments: 0, notes: 0, drafts: 1, myWork: 1 });
  const result = await service.archive(actor, 2, target, preview.version, 'Orphan draft from an earlier testing pass');
  expect(await visibleClinicalWork([{ id: 41 }], { db, kind: 'draft' })).toEqual([]);
  expect((await db.execute('SELECT input_text FROM clinical_note_drafts WHERE id=41'))[0][0].input_text).toBe('Retained orphan draft text');
  expect(await visibleClinicalWork([{ id: 11 }], { db, kind: 'clinical_session' })).toHaveLength(1);
  await service.restore(actor, 2, result.archiveId, 'Restoring only the orphan-draft test group');
  expect((await Queue.listForUser(4)).map(row => row.serverId).sort()).toEqual([51,52]);
}, 15000);
