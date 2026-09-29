import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { splitSqlStatements, stripSqlLineComments } from '../../utils/migrationSql.js';

test('history backfill, inactive assignment guards, reassignment and transactional rollback', { skip: !process.env.SUPERVISION_TEST_SOCKET }, async () => {
  assert.match(process.env.SUPERVISION_TEST_SOCKET, /^\/private\/tmp\/pt-supervision-mysql\//);
  const db = await mysql.createConnection({ socketPath: process.env.SUPERVISION_TEST_SOCKET, user: 'root', multipleStatements: true });
  const schema = `supervision_history_test_${process.pid}`;
  let pool;
  try {
    await db.query(`CREATE DATABASE ${schema}; USE ${schema}`);
    await db.query(`
      CREATE TABLE users (id INT PRIMARY KEY, first_name VARCHAR(100), last_name VARCHAR(100), status VARCHAR(40) DEFAULT 'ACTIVE_EMPLOYEE', is_active BOOLEAN DEFAULT TRUE, is_archived BOOLEAN DEFAULT FALSE);
      CREATE TABLE agencies (id INT PRIMARY KEY, name VARCHAR(255), slug VARCHAR(100), portal_url VARCHAR(100), organization_type VARCHAR(32), feature_flags JSON);
      CREATE TABLE supervisor_assignments (id INT AUTO_INCREMENT PRIMARY KEY, supervisor_id INT NOT NULL, supervisee_id INT NOT NULL, agency_id INT NOT NULL, supervisor_type VARCHAR(32) NOT NULL DEFAULT 'clinical', is_primary BOOLEAN DEFAULT FALSE, created_by_user_id INT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY assignments_by_type (supervisee_id, agency_id, supervisor_type), FOREIGN KEY (supervisor_id) REFERENCES users(id), FOREIGN KEY (supervisee_id) REFERENCES users(id));
      INSERT INTO users (id,first_name,last_name) VALUES (1,'Sam','Supervisor'),(2,'Lee','Former'),(3,'Alex','Active'),(4,'Pat','Manager');
      UPDATE users SET status='INACTIVE_EMPLOYEE' WHERE id=2;
      INSERT INTO agencies VALUES (2,'ITSCO','itsco','itsco','agency',JSON_OBJECT('hiringEnabled',false,'noteAidEnabled',true)),(6,'Other','other','other','agency',JSON_OBJECT('hiringEnabled',false));
      INSERT INTO supervisor_assignments (id,supervisor_id,supervisee_id,agency_id,supervisor_type,is_primary,created_at) VALUES
      (1,1,2,2,'clinical',1,'2025-01-02 12:00:00'),(2,1,2,2,'billing',0,'2025-01-03 12:00:00'),(3,1,3,2,'clinical',0,'2025-02-01 12:00:00'),(4,2,3,2,'manager',0,'2025-01-02 12:00:00');
    `);
    const migrate = async (file) => {
      const sql = await readFile(new URL(`../../../../database/migrations/${file}`, import.meta.url), 'utf8');
      for (const statement of splitSqlStatements(stripSqlLineComments(sql))) await db.query(statement);
    };
    await migrate('1509_restore_itsco_people_operations.sql');
    const [agencies] = await db.query('SELECT id,feature_flags FROM agencies ORDER BY id');
    assert.deepEqual(agencies[0].feature_flags, { hiringEnabled: true, peopleOpsEnabled: true, noteAidEnabled: true, tenantFeatureProfileKey: 'custom' });
    assert.deepEqual(agencies[1].feature_flags, { hiringEnabled: false });
    await migrate('1510_supervisor_assignment_history.sql');
    assert.deepEqual((await db.query('SELECT id FROM supervisor_assignments'))[0].map(r => r.id), [3]);
    const [history] = await db.query('SELECT * FROM supervisor_assignment_history ORDER BY assignment_id');
    assert.equal(history.length, 3);
    assert.equal(history[0].supervisor_name, 'Sam Supervisor');
    assert.equal(history[0].is_primary, 1);
    assert.equal(history[0].supervisor_type, 'clinical');
    assert.equal(history[0].assigned_at.getFullYear(), 2025);
    assert.ok(history.every(r => r.end_reason === 'account_inactive'));
    const historyCount = async () => (await db.query('SELECT COUNT(*) AS n FROM supervisor_assignment_history'))[0][0].n;
    await migrate('1510_supervisor_assignment_history.sql');
    assert.equal(await historyCount(), 3, 'migration retry must not duplicate history');
    await assert.rejects(db.query('INSERT INTO supervisor_assignments (supervisor_id,supervisee_id,agency_id) VALUES (1,2,2)'), /Inactive users/);
    await assert.rejects(db.query('UPDATE supervisor_assignments SET supervisor_id=2 WHERE id=3'), /Inactive users/);
    assert.equal(await historyCount(), 3, 'rejected updates roll back their archive');
    await db.beginTransaction();
    await db.query("UPDATE users SET status='INACTIVE_EMPLOYEE',is_active=0 WHERE id=3");
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM supervisor_assignments'))[0][0].n, 0);
    assert.equal(await historyCount(), 4);
    await db.rollback();
    assert.equal(await historyCount(), 3);
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM supervisor_assignments'))[0][0].n, 1);
    await db.query('UPDATE supervisor_assignments SET is_primary=1 WHERE id=3');
    assert.equal(await historyCount(), 3, 'primary changes must not end an assignment');
    await db.query('UPDATE supervisor_assignments SET supervisor_id=4 WHERE id=3');
    assert.equal(await historyCount(), 4);
    assert.equal((await db.query('SELECT end_reason FROM supervisor_assignment_history WHERE assignment_id=3'))[0][0].end_reason, 'reassigned');
    await db.query('UPDATE users SET is_active=0 WHERE id=4');
    assert.equal(await historyCount(), 5, 'disabled supervisors also leave current assignments');
    await db.query('UPDATE users SET is_active=1 WHERE id=4');
    assert.equal((await db.query('SELECT COUNT(*) AS n FROM supervisor_assignments'))[0][0].n, 0, 'reactivation must not restore assignments');
    await db.query('INSERT INTO supervisor_assignments (supervisor_id,supervisee_id,agency_id) VALUES (1,3,2)');
    await db.query('DELETE FROM supervisor_assignments');
    assert.equal((await db.query('SELECT end_reason FROM supervisor_assignment_history ORDER BY id DESC LIMIT 1'))[0][0].end_reason, 'unassigned');
    await db.query(`CREATE USER '${schema}'@'localhost' IDENTIFIED BY 'supervision_test_only'; GRANT ALL ON ${schema}.* TO '${schema}'@'localhost'`);
    Object.assign(process.env, { SKIP_DB_CONNECT: '1', DB_HOST: process.env.SUPERVISION_TEST_SOCKET, DB_USER: schema, DB_PASSWORD: 'supervision_test_only', DB_NAME: schema });
    ({ default: pool } = await import('../../config/database.js'));
    const { default: SupervisorAssignment } = await import('../../models/SupervisorAssignment.model.js');
    assert.equal(await SupervisorAssignment.hasSupervisees(1), false);
    assert.equal(await SupervisorAssignment.supervisorHasAccess(1, 2, 2), false);
    assert.equal((await SupervisorAssignment.findHistoryBySupervisee(2, { agencyIds: [2] })).length, 2);
    assert.deepEqual(await SupervisorAssignment.findHistoryBySupervisee(2, { agencyIds: [6] }), []);
    assert.deepEqual(await SupervisorAssignment.findHistoryBySupervisee(2, { agencyIds: [] }), []);
  } finally {
    if (pool) await pool.end();
    await db.query(`DROP DATABASE IF EXISTS ${schema}`);
    await db.query(`DROP USER IF EXISTS '${schema}'@'localhost'`);
    await db.end();
  }
});
