import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {generateUniqueSixDigitClientCode} from '../../utils/clientCode.js';
const state = vi.hoisted(() => ({ pool: null, clinicalUnavailable: false }));
vi.mock('../../config/database.js', () => ({ default: {
 execute: (...args) => state.pool.execute(...args), getConnection: () => state.pool.getConnection()
}, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { getConnection: async () => {
 if (state.clinicalUnavailable) throw new Error('Synthetic clinical store unavailable');
 // A shared-database deployment still has an available clinical connection.
 // Use a separate connection so each service retains its own transaction.
 return state.pool.getConnection();
} } }));
import { mergeClients } from '../identityHygiene.service.js';
import { attachCaseloadIdentities, clientDuplicateReviewAgencies, linkClientChartIdentity, listLinkedClientCharts, reviewClientChartIdentity } from '../clientChartIdentity.service.js';
import { listPendingAcceptanceClients, listPendingOfficeClients } from '../clientExchange.service.js';
import { findNameDuplicateGroups } from '../clientNameDuplicate.service.js';
import User from '../../models/User.model.js';
import { enrollmentOptions } from '../guardianEnrollmentStart.service.js';
import { CLIENT_MERGE_FIELDS } from '../../utils/identityHygiene.js';

const connection = process.env.EVIDENCE_TEST_SOCKET ? { socketPath: process.env.EVIDENCE_TEST_SOCKET }
 : { host: '127.0.0.1', port: Number(process.env.EVIDENCE_TEST_MYSQL_PORT) };
describe.skipIf(!process.env.EVIDENCE_TEST_SOCKET && !process.env.EVIDENCE_TEST_MYSQL_PORT)('family enrollment SQL integration', () => {
 let admin;
 const database = `family_enrollment_${crypto.randomBytes(5).toString('hex')}`;
 beforeAll(async () => {
  admin = await mysql.createConnection({ ...connection, user: 'root', multipleStatements: true });
  await admin.query(`CREATE DATABASE ${database}`);
  state.pool = mysql.createPool({ ...connection, user: 'root', database, multipleStatements: true });
  await state.pool.query(`
   CREATE TABLE users (id INT PRIMARY KEY, first_name VARCHAR(255), last_name VARCHAR(255));
   CREATE TABLE clients (id INT PRIMARY KEY, agency_id INT, organization_id INT,
    provider_id INT, client_status_id INT, enrollment_reopened_at DATETIME NULL,
    enrollment_reopened_source VARCHAR(32) NULL, ${CLIENT_MERGE_FIELDS.map(f => `${f.key} VARCHAR(255)`).join(',')});
   CREATE TABLE client_statuses (id INT PRIMARY KEY, label VARCHAR(100), status_key VARCHAR(100));
   CREATE TABLE client_organization_assignments(client_id INT,organization_id INT,is_primary INT,is_active INT,PRIMARY KEY(client_id,organization_id));
   CREATE TABLE client_contact_affiliations(id INT PRIMARY KEY,client_id INT,agency_contact_id INT,created_by_user_id INT,email_reminders_enabled INT,sms_reminders_enabled INT,is_active INT);
   CREATE TABLE agency_contacts(id INT PRIMARY KEY,client_id INT);
   CREATE TABLE client_guardians (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT, guardian_user_id INT, relationship_type VARCHAR(32), access_enabled INT, permissions_json JSON, UNIQUE(client_id,guardian_user_id));
   CREATE TABLE intake_submissions (id INT PRIMARY KEY, client_id INT, guardian_user_id INT);
   CREATE TABLE intake_submission_clients (id INT PRIMARY KEY, client_id INT, intake_submission_id INT, bundle_pdf_path VARCHAR(255));
   CREATE TABLE intake_submission_documents (id INT PRIMARY KEY, client_id INT, intake_submission_id INT, signed_pdf_path VARCHAR(255));
   CREATE TABLE client_phi_documents (id INT PRIMARY KEY, client_id INT, storage_path VARCHAR(255));
   CREATE TABLE co_guardian_invite_clients (invite_id INT, client_id INT, PRIMARY KEY(invite_id,client_id));
   CREATE TABLE client_guardian_intake_profiles (id INT PRIMARY KEY, client_id INT UNIQUE, profile_encrypted TEXT);
   CREATE TABLE client_status_history (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT, changed_by_user_id INT, field_changed VARCHAR(64), from_value TEXT, to_value TEXT, note TEXT);
   CREATE TABLE clinical_notes (id INT PRIMARY KEY,agency_id INT,client_id INT,provider_signed_at DATETIME NULL,is_deleted TINYINT NOT NULL DEFAULT 0);
   CREATE TABLE agencies (id INT PRIMARY KEY, name VARCHAR(255), slug VARCHAR(255), organization_type VARCHAR(32) DEFAULT 'agency', public_availability_enabled INT DEFAULT 0, feature_flags JSON, is_active INT DEFAULT 1, is_archived INT DEFAULT 0);
   CREATE TABLE agency_public_service_types (agency_id INT, service_type VARCHAR(32), is_enabled INT DEFAULT 0);
   CREATE TABLE user_agencies (user_id INT, agency_id INT, is_active INT DEFAULT 1);
   CREATE TABLE intake_links (id INT PRIMARY KEY, master_channel VARCHAR(32), organization_id INT, language_code VARCHAR(3), scope_type VARCHAR(32), form_type VARCHAR(32), inherits_school_master INT DEFAULT 0, is_school_master INT DEFAULT 0, is_office_master INT DEFAULT 0, is_active INT DEFAULT 1);
   CREATE TABLE agency_office_intake_masters (agency_id INT, published_intake_link_id INT);
   CREATE TABLE agency_channel_intake_masters (agency_id INT, channel VARCHAR(32), published_intake_link_id INT);
   CREATE TABLE agency_schools (agency_id INT, school_organization_id INT, is_active INT);
   CREATE TABLE organization_affiliations (agency_id INT, organization_id INT, is_active INT);
   INSERT INTO users VALUES(8,'Synthetic','Parent A'),(9,'Synthetic','Parent B');
   INSERT INTO agencies(id,name) VALUES (450,'Demo'),(451,'Demo school'),(2,'Other agency');
   INSERT INTO user_agencies(user_id,agency_id) VALUES (8,450);
   INSERT INTO intake_links (id,organization_id,language_code,scope_type,form_type,inherits_school_master,is_active) VALUES
    (10,450,'en','agency','intake',0,1),(11,451,'es','school','intake',1,1),(12,2,'en','agency','intake',0,1),(13,450,'en','agency','intake',0,1),(14,451,'en','school','intake',1,0);
   INSERT INTO agency_office_intake_masters VALUES (450,10),(2,12);
   INSERT INTO agency_schools VALUES (450,451,1);
  `);
  await state.pool.query(await readFile(new URL('../../../../database/migrations/1823_sequential_client_identifiers.sql',import.meta.url),'utf8'));
  await state.pool.query(await readFile(new URL('../../../../database/migrations/1858_client_chart_identity_members.sql',import.meta.url),'utf8'));
  await state.pool.query(`
    ALTER TABLE clients ADD source VARCHAR(64), ADD client_type VARCHAR(32), ADD submission_date DATE,
      ADD created_at DATETIME DEFAULT CURRENT_TIMESTAMP, ADD email VARCHAR(255),
      ADD is_demo INT DEFAULT 0, ADD created_via_dev_fill INT DEFAULT 0,
      ADD adaptive_intake_meta_json JSON, ADD intake_preferences_json JSON;
    ALTER TABLE users ADD email VARCHAR(255), ADD personal_email VARCHAR(255), ADD work_email VARCHAR(255);
    CREATE TABLE office_client_assignment_events (id INT PRIMARY KEY, agency_id INT, client_id INT,
      provider_user_id INT, assigned_by_user_id INT, assigned_at DATETIME, exchanged_at DATETIME,
      marked_current_at DATETIME, ended_at DATETIME, exchange_listing_id INT);
    INSERT INTO client_statuses VALUES (1, 'Current', 'current');
  `);
 });
 beforeEach(async () => {
  state.clinicalUnavailable = false;
  await state.pool.query("UPDATE client_identifier_sequences SET last_number=99999 WHERE sequence_key='client'");
  for (const table of ['office_client_assignment_events','client_organization_assignments','client_contact_affiliations','agency_contacts','clients','client_guardians','intake_submissions','intake_submission_clients','intake_submission_documents','client_phi_documents','co_guardian_invite_clients','client_guardian_intake_profiles','client_status_history','clinical_notes']) await state.pool.query(`DELETE FROM ${table}`);
  await state.pool.query(`
   INSERT INTO clients (id,agency_id,full_name,date_of_birth,status,identifier_code) VALUES (1,450,'Synthetic Child','2015-01-01','PACKET','100001'),(2,450,'Synthetic Child','2015-01-01','PACKET','100002');
   INSERT INTO client_guardians (client_id,guardian_user_id,relationship_type,access_enabled,permissions_json) VALUES (1,8,'guardian',1,'{}'),(2,8,'guardian',1,'{}'),(2,9,'guardian',1,'{}');
   INSERT INTO intake_submissions VALUES (101,1,8),(102,2,8),(103,2,9);
   INSERT INTO intake_submission_clients VALUES (1,1,101,'a-original.pdf'),(2,2,102,'a-repeat.pdf'),(3,2,103,'b-private.pdf');
   INSERT INTO intake_submission_documents VALUES (1,2,102,'a-signed.pdf'),(2,2,103,'b-signed.pdf');
   INSERT INTO client_phi_documents VALUES (1,2,'signed-original.pdf');
   INSERT INTO co_guardian_invite_clients VALUES (18,1),(18,2),(19,2);
   INSERT INTO client_guardian_intake_profiles VALUES (1,2,'encrypted-snapshot');
  `);
 });
 afterAll(async () => {
  if (state.pool) await state.pool.end();
  if (admin) { await admin.query(`DROP DATABASE IF EXISTS ${database}`); await admin.end(); }
 });
 it('finds cross-agency duplicates within the reviewer scope and links the charts without moving either agency’s records', async () => {
  await state.pool.execute('UPDATE clients SET agency_id=2 WHERE id=2');
  const actor = { id: 40, role: 'super_admin' };
  const agencyIds = (await clientDuplicateReviewAgencies(actor)).map(agency => agency.id);
  const all = await findNameDuplicateGroups({ agencyIds });
  expect(all.groups[0].members.map(row => row.agency_id)).toEqual([450, 2]);
  const filtered = await findNameDuplicateGroups({ agencyIds, agencyId: 450 });
  expect(filtered.groups[0].members.map(row => row.id)).toEqual([1, 2]);
  expect((await findNameDuplicateGroups({ agencyIds: [450] })).groupCount).toBe(0);
  const getAgencies = vi.spyOn(User, 'getAgencies').mockResolvedValue([{ id: 450 }, { id: 2, is_platform_access_only: 1 }]);
  try {
    await expect(reviewClientChartIdentity({ id: 30, role: 'admin' }, 1, [2])).rejects.toHaveProperty('status', 403);
  } finally {
    getAgencies.mockRestore();
  }

  const review = await reviewClientChartIdentity(actor, 1, [2]);
  expect(review.crossAgency).toBe(true);
  await linkClientChartIdentity({ review, actorUserId: actor.id });
  await linkClientChartIdentity({ review, actorUserId: actor.id });
  expect((await findNameDuplicateGroups({ agencyIds })).groupCount).toBe(0);
  expect(await listLinkedClientCharts(actor, 1)).toEqual([{ id: 2, agencyId: 2, agencyName: 'Other agency', agencySlug: null }]);
  const [documents] = await state.pool.query('SELECT client_id FROM client_phi_documents');
  expect(documents).toEqual([{ client_id: 2 }]);
  const [events] = await state.pool.query('SELECT client_id,changed_by_user_id FROM client_status_history ORDER BY client_id');
  expect(events).toEqual([{ client_id: 1, changed_by_user_id: 40 }, { client_id: 2, changed_by_user_id: 40 }]);
 });
 it('requires all existing linked charts before combining identity sets', async () => {
  await state.pool.query(`
    UPDATE clients SET agency_id = 2 WHERE id = 2;
    INSERT INTO clients (id, agency_id, full_name, date_of_birth, status) VALUES
      (3,450,'Synthetic Child','2015-01-01','PACKET'),(4,2,'Synthetic Child','2015-01-01','PACKET');
  `);
  const actor = { id: 40, role: 'super_admin' };
  for (const [first, second] of [[1, 2], [3, 4]]) {
   await linkClientChartIdentity({ review: await reviewClientChartIdentity(actor, first, [second]), actorUserId: actor.id });
  }
  await expect(reviewClientChartIdentity(actor, 1, [3, 4])).rejects.toMatchObject({ status: 409 });
  await linkClientChartIdentity({ review: await reviewClientChartIdentity(actor, 1, [2, 3, 4]), actorUserId: actor.id });
  const assigned = await attachCaseloadIdentities([{ id: 1 }, { id: 4 }, { id: 99 }]);
  expect(assigned[0].caseload_identity).toBeTruthy();
  expect(assigned[1].caseload_identity).toBe(assigned[0].caseload_identity);
  expect(assigned[2]).toEqual({ id: 99 });
  const [[audit]] = await state.pool.query("SELECT COUNT(*) AS total FROM client_status_history WHERE field_changed='linked_client_identity' AND from_value IS NOT NULL");
  expect(audit.total).toBe(2);
 });
 it('only queues pending enrollments, classifies demos, and clears active or accepted records', async () => {
  await state.pool.query(`
    UPDATE clients SET client_type='clinical', source='PUBLIC_OFFICE_INTAKE' WHERE id IN (1,2);
    UPDATE clients SET is_demo=1 WHERE id=2;
    INSERT INTO clients (id, agency_id, client_type, status, client_status_id, provider_id) VALUES
      (3,450,'clinical','PENDING_REVIEW',1,NULL),
      (4,450,'school','PACKET',NULL,8),
      (5,450,'school','ACTIVE',NULL,8),
      (6,2,'clinical','PENDING_REVIEW',NULL,NULL),
      (7,450,'clinical','PACKET',NULL,8);
    INSERT INTO office_client_assignment_events (id, agency_id, client_id, provider_user_id, assigned_at, marked_current_at) VALUES
      (1,450,4,8,NOW(),NULL), (2,450,5,8,NOW(),NULL), (3,450,7,8,NOW(),NOW());
  `);
  const queue = await listPendingOfficeClients({ agencyId: 450, includeSchool: true });
  expect(queue.map(({ id, isDemo }) => ({ id, isDemo })).sort((a,b) => a.id-b.id))
    .toEqual([{ id: 1, isDemo: false }, { id: 2, isDemo: true }]);
  const referred = await listPendingAcceptanceClients({ agencyId: 450 });
  expect(referred.map(row => row.id)).toEqual([4]);
 });
 it('seeds only the requested agencies with inactive 90837 fee terms', async () => {
  await state.pool.query(`
    ALTER TABLE agencies ADD portal_url VARCHAR(255);
    INSERT INTO agencies (id, name, slug) VALUES (31,'ITSCO','itsco'),(32,'NLU','nlu'),(33,'Inner Strength','tisi');
    CREATE TABLE booking_cancellation_policies (agency_id INT, name VARCHAR(200), description TEXT, scope_level VARCHAR(30),
      business_type VARCHAR(40), service_code VARCHAR(15), notice_hours INT, late_fee_cents INT,
      no_show_fee_cents INT, is_active INT);
  `);
  const migration = await readFile(new URL('../../../../database/migrations/1859_counseling_attendance_policy_drafts.sql', import.meta.url), 'utf8');
  await state.pool.query(migration);
  await state.pool.query(migration);
  const [rows] = await state.pool.query('SELECT agency_id, is_active, service_code, late_fee_cents, no_show_fee_cents FROM booking_cancellation_policies ORDER BY agency_id');
  expect(rows).toEqual([31,32,33].map(agency_id => ({
    agency_id, is_active: 0, service_code: '90837', late_fee_cents: 8000, no_show_fee_cents: 10000
  })));
  await state.pool.query(await readFile(new URL('../../../../database/migrations/1860_client_after_hours_self_pay_requests.sql', import.meta.url), 'utf8'));
  await state.pool.query('DROP TABLE client_after_hours_self_pay_requests, booking_cancellation_policies');
 });
 it('reserves distinct sequential six-digit numbers concurrently and skips existing legacy identifiers',async()=>{
  const codes=await Promise.all(Array.from({length:20},()=>generateUniqueSixDigitClientCode({agencyId:450},state.pool)));
  expect(new Set(codes).size).toBe(20);
  expect(codes.sort()).toEqual(Array.from({length:20},(_,index)=>String(index===0?100000:100002+index)));
 });
 it('stops at six-digit exhaustion without wrapping into existing identifiers',async()=>{
  await state.pool.query("UPDATE client_identifier_sequences SET last_number=999999 WHERE sequence_key='client'");
  await expect(generateUniqueSixDigitClientCode({agencyId:450},state.pool)).rejects.toThrow('All six-digit client numbers');
 });
 it('offers only published active forms in the guardian’s agencies, excluding personal or foreign links', async () => {
  const deps = { db: state.pool, users: { findById: async () => ({ id: 8, role: 'client_guardian', email: 'parent@example.test' }) } };
  const result = await enrollmentOptions({ id: 8, role: 'client_guardian' }, deps);
  expect(result.options.map(o => o.id)).toEqual([10,11]);
 });
 it('blocks merging or linking charts with conflicting birth dates even when their names match', async () => {
  await state.pool.query("UPDATE clients SET date_of_birth='2015-01-02' WHERE id=2");
  await expect(mergeClients({ keepId: 1, sourceIds: [2], actorUserId: 40 })).rejects.toThrow('same legal name and birth date');
  const [[document]] = await state.pool.query('SELECT client_id FROM intake_submission_documents WHERE id=1');
  expect(document.client_id).toBe(2);
  await state.pool.query("UPDATE clients SET agency_id=2, date_of_birth='2015-01-01' WHERE id=2");
  const actor = { id: 40, role: 'super_admin' };
  const review = await reviewClientChartIdentity(actor, 1, [2]);
  await state.pool.query("UPDATE clients SET date_of_birth='2015-01-02' WHERE id=2");
  await expect(linkClientChartIdentity({ review, actorUserId: 40 })).rejects.toHaveProperty('status', 409);
  const [[history]] = await state.pool.query("SELECT COUNT(*) AS n FROM client_status_history");
  expect(history.n).toBe(0);
 });
 it('merges a repeated enrollment and preserves both parents, every signed copy, pending invites, and audit', async () => {
  await mergeClients({ keepId: 1, sourceIds: [2], actorUserId: 40 });
  const [links] = await state.pool.query('SELECT client_id,guardian_user_id FROM client_guardians ORDER BY guardian_user_id');
  expect(links).toEqual([{ client_id: 1, guardian_user_id: 8 }, { client_id: 1, guardian_user_id: 9 }]);
  const [copies] = await state.pool.query('SELECT s.guardian_user_id, c.bundle_pdf_path FROM intake_submissions s JOIN intake_submission_clients c ON c.intake_submission_id=s.id WHERE c.client_id=1 ORDER BY s.id');
  expect(copies).toEqual([{ guardian_user_id: 8, bundle_pdf_path: 'a-original.pdf' }, { guardian_user_id: 8, bundle_pdf_path: 'a-repeat.pdf' }, { guardian_user_id: 9, bundle_pdf_path: 'b-private.pdf' }]);
  const [[archived]] = await state.pool.query('SELECT status FROM clients WHERE id=2');expect(archived.status).toBe('ARCHIVED');
  const [invites] = await state.pool.query('SELECT * FROM co_guardian_invite_clients ORDER BY invite_id');expect(invites).toEqual([{ invite_id: 18, client_id: 1 },{ invite_id: 19, client_id: 1 }]);
  const [[profile]] = await state.pool.query('SELECT client_id,profile_encrypted FROM client_guardian_intake_profiles');expect(profile).toEqual({ client_id: 1, profile_encrypted: 'encrypted-snapshot' });
  const [[audit]] = await state.pool.query('SELECT changed_by_user_id,to_value FROM client_status_history');expect(audit).toEqual({ changed_by_user_id: 40, to_value: '1' });
 });
 it('rolls back the whole merge on a guardian-permission conflict', async () => {
  await state.pool.query('UPDATE client_guardians SET access_enabled=0 WHERE client_id=2 AND guardian_user_id=8');
  await expect(mergeClients({ keepId: 1, sourceIds: [2], actorUserId: 40 })).rejects.toThrow('Guardian access differs');
  const [[client]] = await state.pool.query('SELECT status,identifier_code FROM clients WHERE id=2');expect(client).toEqual({ status: 'PACKET', identifier_code: '100002' });
  const [[copy]] = await state.pool.query('SELECT client_id FROM intake_submissions WHERE id=102');expect(copy.client_id).toBe(2);
  const [[audit]] = await state.pool.query('SELECT COUNT(*) AS n FROM client_status_history');expect(audit.n).toBe(0);
 });
 it('rolls back source archival and documents when clients belong to different agencies', async () => {
  await state.pool.query('UPDATE clients SET agency_id=2 WHERE id=2');
  await expect(mergeClients({ keepId: 1, sourceIds: [2], actorUserId: 40 })).rejects.toThrow('different agencies');
  const [[client]] = await state.pool.query('SELECT status FROM clients WHERE id=2');expect(client.status).toBe('PACKET');
 });
 it('preserves enrollment, source identity and signed clinical records when a source note is signed', async () => {
  await state.pool.query("INSERT INTO clinical_notes(id,agency_id,client_id,provider_signed_at,is_deleted) VALUES(7,450,2,'2026-10-01 12:00:00',1)");
  await expect(mergeClients({ keepId: 1, sourceIds: [2], actorUserId: 40 })).rejects.toHaveProperty('status', 409);
  const [[client]] = await state.pool.query('SELECT status,identifier_code FROM clients WHERE id=2');expect(client).toEqual({status:'PACKET',identifier_code:'100002'});
  const [[copy]] = await state.pool.query('SELECT client_id,signed_pdf_path FROM intake_submission_documents WHERE id=1');expect(copy).toEqual({client_id:2,signed_pdf_path:'a-signed.pdf'});
  const [[note]] = await state.pool.query('SELECT client_id,is_deleted FROM clinical_notes WHERE id=7');expect(note).toEqual({client_id:2,is_deleted:1});
  const [[audit]] = await state.pool.query('SELECT COUNT(*) AS n FROM client_status_history');expect(audit.n).toBe(0);
 });
 it('fails closed without modifying enrollment when clinical storage is genuinely unavailable', async () => {
  state.clinicalUnavailable = true;
  await expect(mergeClients({ keepId: 1, sourceIds: [2], actorUserId: 40 })).rejects.toHaveProperty('status', 503);
  const [[client]] = await state.pool.query('SELECT status,identifier_code FROM clients WHERE id=2');expect(client).toEqual({status:'PACKET',identifier_code:'100002'});
  const [[copy]] = await state.pool.query('SELECT client_id FROM intake_submissions WHERE id=102');expect(copy.client_id).toBe(2);
  const [[audit]] = await state.pool.query('SELECT COUNT(*) AS n FROM client_status_history');expect(audit.n).toBe(0);
 });
});
