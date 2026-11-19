import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from '../../services/__tests__/fixtures/isolatedWorkflowMysql.js';

const m = vi.hoisted(() => ({ execute: vi.fn(), findById: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: m.findById } }));
vi.mock('../../services/schoolPortalDaySync.service.js', () => ({ syncSchoolPortalDayProvider: vi.fn() }));
vi.mock('../../services/d11Compliance.service.js', () => ({ enqueueD11ComplianceEnsure: vi.fn() }));
import { listProviderAffiliations } from '../providerSelfAffiliations.controller.js';
import { PROVIDER_ROLE_SQL } from '../../services/clientAssignmentScope.service.js';

const response = () => {
  const res = { json: vi.fn(), status: vi.fn() };
  res.status.mockReturnValue(res);
  return res;
};

describe.skipIf(!recoveryMysqlEnabled)('administrator school assignments — isolated SQL', () => {
  let fixture, db, roster, scheduling;
  beforeAll(async () => {
    fixture = await isolatedWorkflowMysql('admin_school_assignment'); db = fixture.db;
    for (const sql of [
      `CREATE TABLE users(id INT PRIMARY KEY,first_name VARCHAR(80),last_name VARCHAR(80),email VARCHAR(120),role VARCHAR(40),has_provider_access TINYINT DEFAULT 0,is_active TINYINT DEFAULT 1,is_archived TINYINT DEFAULT 0,status VARCHAR(40) DEFAULT 'ACTIVE',is_demo TINYINT DEFAULT 0,sees_clients TINYINT DEFAULT 1,provider_accepting_new_clients TINYINT DEFAULT 1,provider_school_info_blurb TEXT,psychology_today_url VARCHAR(255))`,
      `CREATE TABLE agencies(id INT PRIMARY KEY,name VARCHAR(80),slug VARCHAR(80),organization_type VARCHAR(30) NULL)`,
      `CREATE TABLE user_agencies(user_id INT,agency_id INT,is_active TINYINT DEFAULT 1)`,
      `CREATE TABLE organization_affiliations(agency_id INT,organization_id INT,is_active TINYINT DEFAULT 1)`,
      `CREATE TABLE provider_school_assignments(provider_user_id INT,school_organization_id INT,is_active TINYINT DEFAULT 1)`,
      `CREATE TABLE provider_school_profiles(provider_user_id INT,school_organization_id INT,school_info_blurb TEXT)`
    ]) await db.query(sql);
    await db.query("INSERT INTO agencies VALUES(2,'Fictional Agency','fictional','agency'),(42,'Legacy School','legacy',NULL),(43,'Other School','other','school'),(44,'Previous School','previous','   ')");
    await db.query('INSERT INTO organization_affiliations(agency_id,organization_id) VALUES(2,42),(2,43),(2,44)');
    for (const [id, role, providerAccess, archived, status] of [
      [1,'provider',0,0,'ACTIVE'], [2,'admin',0,0,'ACTIVE'], [3,'super_admin',0,0,'ACTIVE'],
      [4,'staff',0,0,'ACTIVE'], [5,'staff',1,0,'ACTIVE'], [6,'admin',0,1,'ACTIVE'],
      [7,'super_admin',0,0,'INACTIVE_EMPLOYEE'], [8,'admin',0,0,'ACTIVE']
    ]) await db.execute('INSERT INTO users(id,first_name,last_name,email,role,has_provider_access,is_archived,status) VALUES(?,?,?,?,?,?,?,?)',
      [id,`Staff ${id}`,'Synthetic',`testing+staff${id}@example.test`,role,providerAccess,archived,status]);
    m.execute.mockImplementation((...args) => db.execute(...args));
    m.findById.mockImplementation(async (id) => { const [[row]] = await db.execute('SELECT * FROM users WHERE id=?', [id]); return row; });

    // Execute the production query functions against the isolated schema, without
    // importing the unrelated portal/client ingestion controllers into this test.
    const source = await readFile(new URL('../schoolProviderSchedule.controller.js', import.meta.url), 'utf8');
    const start = source.indexOf('const PROVIDER_LIKE_SQL ='), end = source.indexOf('\nfunction isSelfProviderRole(', start);
    expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
    roster = new Function('pool', `${source.slice(start, end)};return fetchAffiliatedSchoolProviders;`)({ execute: (...args) => db.execute(...args) });
    const schedulingSource = await readFile(new URL('../providerScheduling.controller.js', import.meta.url), 'utf8');
    const schedulingStart = schedulingSource.indexOf('export const listProvidersForScheduling =');
    const schedulingEnd = schedulingSource.indexOf('\nexport const listProviderSchoolAssignments =', schedulingStart);
    const code = schedulingSource.slice(schedulingStart, schedulingEnd).replace('export const ', 'const ');
    scheduling = new Function('pool', 'parseAgencyId', 'PROVIDER_ROLE_SQL', `${code};return listProvidersForScheduling;`)
      ({ execute: (...args) => db.execute(...args) }, (req) => Number(req.query.agencyId), PROVIDER_ROLE_SQL);
  });
  beforeEach(async () => {
    await db.query('DELETE FROM user_agencies'); await db.query('DELETE FROM provider_school_assignments');
    await db.query('UPDATE users SET sees_clients=1');
    for (let id = 1; id <= 7; id++) await db.execute('INSERT INTO user_agencies(user_id,agency_id)VALUES(?,2),(?,42)', [id,id]);
    await db.query('INSERT INTO user_agencies(user_id,agency_id)VALUES(8,43)');
  });
  afterAll(async () => { await fixture?.close(); });

  it.each([[1,'provider'],[2,'admin'],[3,'super_admin']])('shows legacy school membership for %s (%s) without changing their role', async (id, role) => {
    const res = response(), next = vi.fn();
    await listProviderAffiliations({ user: { id: 500, role: 'admin' }, query: { providerUserId: String(id) } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ providerUserId: id, affiliations: [expect.objectContaining({ id: 42, organization_type: 'school' })] });
    const [[user]] = await db.execute('SELECT role,has_provider_access FROM users WHERE id=?', [id]);
    expect(user).toEqual({ role, has_provider_access: 0 });
  });
  it('does not give a superadmin every school merely because they belong to the agency', async () => {
    await db.query('DELETE FROM user_agencies WHERE user_id=3 AND agency_id=42');
    const res = response();
    await listProviderAffiliations({ user: { id: 500, role: 'admin' }, query: { providerUserId: '3' } }, res, vi.fn());
    expect(res.json.mock.calls[0][0].affiliations).toEqual([]);
  });
  it('restores active legacy schedule membership and keeps retired school days removed', async () => {
    await db.query('INSERT INTO provider_school_assignments VALUES(2,44,1),(2,43,0)');
    const res = response();
    await listProviderAffiliations({ user: { id: 500, role: 'admin' }, query: { providerUserId: '2' } }, res, vi.fn());
    expect(res.json.mock.calls[0][0].affiliations.map((org) => org.id).sort()).toEqual([42,44]);
  });
  it('includes assigned admins and superadmins in the school roster, respecting status and membership', async () => {
    expect((await roster(42)).map((row) => row.provider_user_id).sort()).toEqual([1,2,3,5]);
  });
  it('includes administrators in school assignment choices without a provider-access toggle', async () => {
    const res = response(), next = vi.fn();
    await scheduling({ query: { agencyId: '2' } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].map((row) => row.id).sort()).toEqual([1,2,3,5]);
  });
  it('keeps the separate clinical-provider gate and explicit sees-clients choice intact', async () => {
    const res = response(), next = vi.fn();
    await scheduling({ query: { agencyId: '2', activeProvidersOnly: 'true', clientAssignmentsOnly: 'true' } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].map((row) => row.id).sort()).toEqual([1,5]);
    await db.query('UPDATE users SET sees_clients=0 WHERE id=1');
    const active = response();
    await scheduling({ query: { agencyId: '2', activeProvidersOnly: 'true' } }, active, next);
    expect(active.json.mock.calls[0][0].map((row) => row.id).sort()).toEqual([5]);
  });
});
