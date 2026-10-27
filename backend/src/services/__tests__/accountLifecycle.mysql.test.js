import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import mysql from 'mysql2/promise';
const fixture = vi.hoisted(() => ({ db: null }));
vi.mock('../../config/database.js', () => ({
  default: { execute: (...args) => fixture.db.execute(...args), getConnection: () => fixture.db.getConnection() },
  onTableWrite: vi.fn()
}));
vi.mock('../hireGroupAccount.service.js', () => ({ removeHireGoogleGroupForUser: vi.fn() }));
import User from '../../models/User.model.js';
import ClientSchoolStaffRoiAccess from '../../models/ClientSchoolStaffRoiAccess.model.js';
import { changeAccountLifecycle } from '../accountLifecycle.service.js';

describe.skipIf(process.env.ACCOUNT_LIFECYCLE_MYSQL_TEST !== '1')('account lifecycle with the real archive guard', () => {
  let db;
  const connection = process.env.SCHEDULING_TEST_MYSQL_PORT
    ? { host: '127.0.0.1', port: Number(process.env.SCHEDULING_TEST_MYSQL_PORT), user: 'root' }
    : { socketPath: '/private/tmp/school-roi-investigation/mysql.sock', user: 'root' };
  const current = async () => (await db.execute('SELECT * FROM users WHERE id = 42'))[0][0];
  const events = async () => (await db.execute('SELECT * FROM user_activity_log ORDER BY id'))[0];
  beforeAll(async () => {
    // Only isolated local/CI MySQL; never use application database credentials.
    const setup = await mysql.createConnection(connection);
    await setup.query('DROP DATABASE IF EXISTS account_lifecycle_test');
    await setup.query('CREATE DATABASE account_lifecycle_test CHARACTER SET utf8mb4');
    await setup.end();
    db = fixture.db = mysql.createPool({ ...connection, database: 'account_lifecycle_test', timezone: 'Z' });
    await db.query(`CREATE TABLE users (
      id INT PRIMARY KEY, role VARCHAR(60), email VARCHAR(255), work_email VARCHAR(255), username VARCHAR(255),
      first_name VARCHAR(60), last_name VARCHAR(60), title VARCHAR(60), phone_number VARCHAR(20),
      status VARCHAR(60), is_active BOOLEAN DEFAULT 1, is_archived BOOLEAN DEFAULT 0,
      archived_at DATETIME, archived_by_user_id INT, archived_by_agency_id INT,
      completed_at DATETIME, terminated_at DATETIME, termination_date DATETIME, status_expires_at DATETIME,
      pending_completed_at DATETIME, pending_auto_complete_at DATETIME,
      pending_identity_verified BOOLEAN, pending_access_locked BOOLEAN, pending_completion_notified BOOLEAN,
      provider_accepting_new_clients BOOLEAN, login_is_group_email BOOLEAN DEFAULT 0,
      passwordless_token VARCHAR(255), passwordless_token_expires_at DATETIME, passwordless_token_purpose VARCHAR(60),
      temporary_password_hash VARCHAR(255), temporary_password_expires_at DATETIME, temporary_password_set_at DATETIME
    ) ENGINE=InnoDB`);
    await db.query(`CREATE TABLE user_activity_log (
      id INT AUTO_INCREMENT PRIMARY KEY, action_type VARCHAR(100), user_id INT, agency_id INT, metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    ) ENGINE=InnoDB`);
    await db.query('CREATE TABLE agencies (id INT PRIMARY KEY, phone_number VARCHAR(20), organization_type VARCHAR(20))');
    await db.query('CREATE TABLE user_agencies (user_id INT, agency_id INT, is_active BOOLEAN DEFAULT 1)');
    await db.query('CREATE TABLE school_contacts (id INT PRIMARY KEY, school_organization_id INT, email VARCHAR(255), full_name VARCHAR(120), role_title VARCHAR(60), is_scheduler BOOLEAN)');
    const migration = await fs.readFile(new URL('../../../../database/migrations/1611_provider_offboarding_cleanup.sql', import.meta.url), 'utf8');
    const trigger = migration.match(/CREATE TRIGGER user_archive_disable_access[\s\S]*?;/)[0];
    await db.query(trigger);
  });
  beforeEach(async () => {
    await db.query('DELETE FROM user_activity_log');
    await db.query('DELETE FROM users');
    await db.query('DELETE FROM user_agencies');
    await db.query('DELETE FROM agencies');
    await db.query(`INSERT INTO users(id,role,email,first_name,last_name,status) VALUES
      (3,'admin','admin@example.invalid','Test','Admin','ACTIVE_EMPLOYEE'),
      (42,'school_staff','staff@example.invalid','School','Contact','ACTIVE_EMPLOYEE')`);
    await db.query("INSERT INTO agencies VALUES (20,'303-555-0100','school')");
    await db.query('INSERT INTO user_agencies(user_id,agency_id) VALUES (42,20)');
    vi.spyOn(User, 'findById').mockImplementation(async id => (await db.execute('SELECT * FROM users WHERE id = ?', [id]))[0][0]);
  });
  afterAll(async () => { await db?.end(); });

  it('archives after school removal, then reactivates login and ROI eligibility together with attributed history', async () => {
    await User.removeFromAgency(42, 20);
    expect(await User.hasAnySchoolAgencyMembership(42)).toBe(false);
    await User.disableSchoolStaffLogin(42, 3, 20);
    expect(await current()).toMatchObject({ status: 'ARCHIVED', is_active: 0, is_archived: 1, archived_by_user_id: 3 });
    expect((await current()).is_active).toBe(0);
    await db.execute('INSERT INTO user_agencies(user_id,agency_id) VALUES (42,20)');
    await User.updateStatus(42, 'ACTIVE_EMPLOYEE', 3, { source: 'school_portal_staff_added', agencyId: 20, reason: 'Staff added back to the school.' });
    expect(await current()).toMatchObject({ status: 'ACTIVE_EMPLOYEE', is_active: 1, is_archived: 0, archived_at: null, archived_by_user_id: null });
    expect(await current()).toMatchObject({ is_active: 1, is_archived: 0 });
    expect(await ClientSchoolStaffRoiAccess.listSchoolStaffRosterForOrganization({ schoolOrganizationId: 20 }))
      .toEqual([expect.objectContaining({ school_staff_user_id: 42, phone_number: '303-555-0100' })]);
    const history = await events();
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ action_type: 'user_account_archived', user_id: 3, agency_id: 20 });
    expect(history[0].metadata).toMatchObject({ targetId: 42, actorType: 'user', actor: { id: 3, name: 'Test Admin' }, source: 'school_staff_last_school_removed', before: { isArchived: 0 }, after: { isArchived: 1 } });
    expect(history[1].metadata).toMatchObject({ before: { archivedByUserId: 3, isArchived: 1 }, after: { isArchived: 0, isActive: 1 } });
    // Deleting an actor later must not erase their identity from historical evidence.
    await db.execute('DELETE FROM users WHERE id=3');
    expect((await events())[0].metadata.actor.name).toBe('Test Admin');
  });

  it('repairs a stale archive flag during explicit activation, including the existing ACTIVE_EMPLOYEE status', async () => {
    await db.execute("UPDATE users SET is_archived=1,archived_at=NOW() WHERE id=42");
    expect((await current()).is_active).toBe(0);
    await User.updateStatus(42, 'ACTIVE_EMPLOYEE', 3);
    expect(await current()).toMatchObject({ is_archived: 0, is_active: 1, status: 'ACTIVE_EMPLOYEE' });
  });

  it('rolls back an archive if its audit record cannot be saved', async () => {
    await db.query("CREATE TRIGGER reject_audit BEFORE INSERT ON user_activity_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test audit failure'");
    try {
      await expect(User.updateStatus(42, 'ARCHIVED', 3)).rejects.toThrow('test audit failure');
      expect(await current()).toMatchObject({ status: 'ACTIVE_EMPLOYEE', is_active: 1, is_archived: 0 });
      expect(await events()).toHaveLength(0);
    } finally { await db.query('DROP TRIGGER reject_audit'); }
  });

  it('records explicit archives and preserves the original actor in history after archive restoration', async () => {
    expect(await User.archive(42, 3, 20)).toBe(true);
    expect(await User.restore(42, [99], 3)).toBe(false);
    expect((await current()).is_archived).toBe(1);
    expect(await User.restore(42, [20], 3)).toBe(true);
    const history = await events();
    expect(history).toHaveLength(2);
    expect(history[1].metadata).toMatchObject({ source: 'user_archive_restored', before: { archivedByUserId: 3 }, after: { archivedByUserId: null } });
    // Restore from the archive alone does not grant login permission.
    expect((await current()).is_active).toBe(0);
  });

  it('labels automatic termination expiry as a system action with its actual reason', async () => {
    await db.execute("UPDATE users SET status='TERMINATED_PENDING',termination_date=UTC_TIMESTAMP()-INTERVAL 8 DAY WHERE id=42");
    expect(await User.processTerminatedUsers()).toEqual({ archived: 1 });
    expect((await events())[0].metadata).toMatchObject({ actorType: 'system', actor: null, source: 'terminated_user_expiration' });
    expect(await User.processTerminatedUsers()).toEqual({ archived: 0 });
    expect(await events()).toHaveLength(1);
  });

  it('does not commit a caller-owned transaction and rolls history back with that transaction', async () => {
    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      await changeAccountLifecycle({ connection: conn, userId: 42, actorUserId: 3, source: 'test_merge', reason: 'Synthetic merge.',
        mutate: async executor => (await executor.execute("UPDATE users SET status='ARCHIVED',is_archived=1 WHERE id=42"))[0]
      });
      await conn.rollback();
      expect((await current()).status).toBe('ACTIVE_EMPLOYEE');
      expect(await events()).toHaveLength(0);
    } finally { conn.release(); }
  });
});
