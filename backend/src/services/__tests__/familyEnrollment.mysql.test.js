import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
const state = vi.hoisted(() => ({ pool: null }));
vi.mock('../../config/database.js', () => ({ default: {
 execute: (...args) => state.pool.execute(...args), getConnection: () => state.pool.getConnection()
}, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { getConnection: async () => { throw new Error('This fixture uses one database'); } } }));
import { mergeClients } from '../identityHygiene.service.js';
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
   CREATE TABLE clients (id INT PRIMARY KEY, agency_id INT, ${CLIENT_MERGE_FIELDS.map(f => `${f.key} VARCHAR(255)`).join(',')});
   CREATE TABLE client_guardians (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT, guardian_user_id INT, relationship_type VARCHAR(32), access_enabled INT, permissions_json JSON, UNIQUE(client_id,guardian_user_id));
   CREATE TABLE intake_submissions (id INT PRIMARY KEY, client_id INT, guardian_user_id INT);
   CREATE TABLE intake_submission_clients (id INT PRIMARY KEY, client_id INT, intake_submission_id INT, bundle_pdf_path VARCHAR(255));
   CREATE TABLE intake_submission_documents (id INT PRIMARY KEY, client_id INT, intake_submission_id INT, signed_pdf_path VARCHAR(255));
   CREATE TABLE client_phi_documents (id INT PRIMARY KEY, client_id INT, storage_path VARCHAR(255));
   CREATE TABLE co_guardian_invite_clients (invite_id INT, client_id INT, PRIMARY KEY(invite_id,client_id));
   CREATE TABLE client_guardian_intake_profiles (id INT PRIMARY KEY, client_id INT UNIQUE, profile_encrypted TEXT);
   CREATE TABLE client_status_history (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT, changed_by_user_id INT, field_changed VARCHAR(64), from_value TEXT, to_value TEXT, note TEXT);
   CREATE TABLE agencies (id INT PRIMARY KEY, name VARCHAR(255));
   CREATE TABLE user_agencies (user_id INT, agency_id INT);
   CREATE TABLE intake_links (id INT PRIMARY KEY, organization_id INT, language_code VARCHAR(3), scope_type VARCHAR(32), form_type VARCHAR(32), inherits_school_master INT DEFAULT 0, is_school_master INT DEFAULT 0, is_office_master INT DEFAULT 0, is_active INT DEFAULT 1);
   CREATE TABLE agency_office_intake_masters (agency_id INT, published_intake_link_id INT);
   CREATE TABLE agency_schools (agency_id INT, school_organization_id INT, is_active INT);
   CREATE TABLE organization_affiliations (agency_id INT, organization_id INT, is_active INT);
   INSERT INTO agencies VALUES (450,'Demo'),(451,'Demo school'),(2,'Other agency');
   INSERT INTO user_agencies VALUES (8,450);
   INSERT INTO intake_links (id,organization_id,language_code,scope_type,form_type,inherits_school_master,is_active) VALUES
    (10,450,'en','agency','intake',0,1),(11,451,'es','school','intake',1,1),(12,2,'en','agency','intake',0,1),(13,450,'en','agency','intake',0,1),(14,451,'en','school','intake',1,0);
   INSERT INTO agency_office_intake_masters VALUES (450,10),(2,12);
   INSERT INTO agency_schools VALUES (450,451,1);
  `);
 });
 beforeEach(async () => {
  for (const table of ['clients','client_guardians','intake_submissions','intake_submission_clients','intake_submission_documents','client_phi_documents','co_guardian_invite_clients','client_guardian_intake_profiles','client_status_history']) await state.pool.query(`DELETE FROM ${table}`);
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
 it('offers only published active forms in the guardian’s agencies, excluding personal or foreign links', async () => {
  const deps = { db: state.pool, users: { findById: async () => ({ id: 8, role: 'client_guardian', email: 'parent@example.test' }) } };
  const result = await enrollmentOptions({ id: 8, role: 'client_guardian' }, deps);
  expect(result.options.map(o => o.id)).toEqual([10,11]);
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
});
