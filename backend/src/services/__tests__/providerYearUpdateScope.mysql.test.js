import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { isolatedWorkflowMysql, recoveryMysqlEnabled } from './fixtures/isolatedWorkflowMysql.js';
import { getMyStatus, loadProviderClientsWithoutDay } from '../providerYearUpdate.service.js';

const fixture = vi.hoisted(() => ({ db: null }));
vi.mock('../../config/database.js', () => ({
  default: { execute: (...args) => fixture.db.execute(...args) },
  onTableWrite: vi.fn()
}));

const fall = new Date('2026-09-20T16:00:00Z');
const afterFall = new Date('2026-11-21T16:12:00Z');

describe.skipIf(!recoveryMysqlEnabled)('Provider Fall Update scope on MySQL', () => {
  let instance;
  beforeAll(async () => {
    instance = await isolatedWorkflowMysql('provider_fall_scope');
    fixture.db = instance.db;
    const statements = [
      'CREATE TABLE agencies (id INT PRIMARY KEY, name TEXT, slug TEXT, organization_type VARCHAR(40), is_active BOOL DEFAULT 1, is_archived BOOL DEFAULT 0, portal_url TEXT, logo_url TEXT, logo_path TEXT)',
      'CREATE TABLE client_statuses (id INT PRIMARY KEY, status_key VARCHAR(40))',
      'CREATE TABLE clients (id INT PRIMARY KEY, client_type VARCHAR(40), school_year VARCHAR(10), created_at DATETIME, submission_date DATE, staff_onboarding_completed_at DATETIME, initials VARCHAR(8), identifier_code VARCHAR(8), grade VARCHAR(8), status VARCHAR(30), client_status_id INT, provider_id INT, organization_id INT, service_day VARCHAR(10), compliance_archived_at DATETIME)',
      'CREATE TABLE client_organization_assignments (client_id INT, organization_id INT, is_active BOOL)',
      'CREATE TABLE client_provider_assignments (client_id INT, organization_id INT, provider_user_id INT, service_day VARCHAR(10), is_active BOOL)',
      'CREATE TABLE organization_affiliations (organization_id INT, agency_id INT, is_active BOOL)',
      'CREATE TABLE agency_schools (school_organization_id INT, agency_id INT, is_active BOOL)',
      'CREATE TABLE provider_school_assignments (id INT PRIMARY KEY, school_organization_id INT, provider_user_id INT, day_of_week VARCHAR(10), slots_total INT, slots_available INT, start_time TIME, end_time TIME, is_active BOOL, created_at DATETIME)',
      'CREATE TABLE provider_year_update_campaigns (agency_id INT, school_year VARCHAR(10), status VARCHAR(20), pushed_at DATETIME, disabled_at DATETIME NULL)',
      'CREATE TABLE provider_year_update_cycles (id INT PRIMARY KEY, agency_id INT, provider_user_id INT, school_year VARCHAR(10), status VARCHAR(20), pushed_at DATETIME, pushed_by_user_id INT)',
      "INSERT INTO agencies (id,name,organization_type) VALUES (10,'Test School','school'),(11,'Test Counseling','program'),(12,'Another School','school')",
      'INSERT INTO organization_affiliations VALUES (10,2,1),(11,2,1),(12,2,1)',
      "INSERT INTO client_statuses VALUES (1,'current'),(2,'waitlist')",
      `INSERT INTO provider_school_assignments VALUES
        (1,10,55,'Monday',6,2,'09:00','15:00',1,'2026-07-27 16:00:00'),
        (2,10,56,'Monday',6,2,'09:00','15:00',1,'2026-09-01 16:00:00'),
        (3,11,57,'Monday',6,2,'09:00','15:00',1,'2026-07-27 16:00:00')`,
      "INSERT INTO provider_year_update_campaigns VALUES (2,'2026-27','pushed','2026-08-03 18:00:00',NULL)",
      "INSERT INTO provider_year_update_cycles VALUES (1,2,56,'2026-27','not_started','2026-09-02 18:00:00',NULL)",
      `INSERT INTO clients (id,client_type,school_year,created_at,initials,grade,status,client_status_id,provider_id,organization_id) VALUES
        (21,'school','2025-2026','2025-09-10','RETURN','7','ACTIVE',1,55,10),
        (22,'clinical',NULL,'2025-09-10','OFFICE',NULL,'ACTIVE',1,55,11),
        (23,'clinical',NULL,'2025-09-10','MISLINK',NULL,'ACTIVE',1,55,10),
        (24,'school','2025-2026','2025-09-10','PROGRAM','7','ACTIVE',1,55,11),
        (25,'school','2026-2027','2026-09-10','NEW','5','ACTIVE',1,55,10),
        (26,'school','2025-2026','2025-09-10','OTHER','7','ACTIVE',1,55,12),
        (27,'school','2025-2026','2025-09-10','DAY','7','ACTIVE',1,55,10),
        (28,'school','2025-2026','2025-09-10','WAIT','5','ACTIVE',2,55,10),
        (29,'school','2025-2026','2025-09-10','LEGACY','5','ACTIVE',1,55,11)`,
      'INSERT INTO client_organization_assignments VALUES (21,10,1),(22,11,1),(23,10,1),(24,11,1),(25,10,1),(26,12,1),(27,10,1),(28,10,1),(29,10,1)',
      "INSERT INTO client_provider_assignments VALUES (21,10,55,NULL,1),(24,11,55,NULL,1),(26,12,55,NULL,1),(27,10,55,'Monday',1)"
    ];
    for (const sql of statements) await fixture.db.execute(sql);
  });
  afterAll(async () => { await instance?.close(); });

  it('lists returning clients with a missing day at an active, assigned school only', async () => {
    expect(await loadProviderClientsWithoutDay(55, 2, { now: fall })).toEqual([
      { schoolOrganizationId: 10, schoolName: 'Test School', clients: [
        { clientId: 21, initials: 'RETURN', grade: '7', status: 'current', clientCode: null }
      ] }
    ]);
    expect(await loadProviderClientsWithoutDay(55, 2, { now: afterFall })).toEqual([]);
  });

  it('does not prompt a program-only provider or a provider added after the original fall push', async () => {
    const late = await getMyStatus({ providerUserId: 56, agencyId: 2, now: fall });
    expect(late).toMatchObject({ available: false, reason: 'not_pushed' });
    const office = await getMyStatus({ providerUserId: 57, agencyId: 2, now: fall });
    expect(office).toMatchObject({ available: false, reason: 'no_school_assignments' });
    const closed = await getMyStatus({ providerUserId: 55, agencyId: 2, now: afterFall });
    expect(closed).toMatchObject({ available: false, reason: 'outside_fall_window' });
    const [[count]] = await fixture.db.execute('SELECT COUNT(*) AS total FROM provider_year_update_cycles');
    expect(Number(count.total)).toBe(1);
  });
});
