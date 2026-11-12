import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute }, onTableWrite: vi.fn() }));
import { listPayrollAgencyUsers } from '../payroll.controller.js';
import ManualPayLine from '../../models/PayrollManualPayLine.model.js';

let db;
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const request = (query = {}) => ({ method: 'GET', query: { agencyId: '6', activeEmployeesOnly: 'true', ...query }, user: { id: 99, role: 'super_admin' } });

beforeEach(() => {
  vi.clearAllMocks();
  db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE agencies(id INTEGER, organization_type TEXT,is_active INTEGER DEFAULT 1,is_archived INTEGER DEFAULT 0);
    INSERT INTO agencies(id,organization_type) VALUES (6,'agency'),(2,'agency');
    CREATE TABLE users(id INTEGER,first_name TEXT,last_name TEXT,email TEXT,role TEXT,status TEXT,is_active INTEGER,is_archived INTEGER,
      is_assistant_account INTEGER DEFAULT 0,is_demo INTEGER DEFAULT 0,created_via_dev_fill INTEGER DEFAULT 0,has_supervisor_privileges INTEGER,medcancel_rate_schedule TEXT);
    CREATE TABLE user_agencies(user_id INTEGER,agency_id INTEGER,is_active INTEGER,has_payroll_access INTEGER DEFAULT 0);
    CREATE TABLE payroll_manual_pay_lines(id INTEGER,payroll_period_id INTEGER,agency_id INTEGER,user_id INTEGER,label TEXT,amount REAL,metadata_json TEXT);`);
  const add = (id, agencyId = 6, changes = {}) => {
    const user = { first: `Employee${id}`, last: 'Test', role: 'provider', status: 'ACTIVE_EMPLOYEE', active: 1, archived: 0, assistant: 0, demo: 0, fill: 0, membershipActive: 1, ...changes };
    db.prepare('INSERT INTO users(id,first_name,last_name,email,role,status,is_active,is_archived,is_assistant_account,is_demo,created_via_dev_fill) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(id,user.first,user.last,`user${id}@example.test`,user.role,user.status,user.active,user.archived,user.assistant,user.demo,user.fill);
    db.prepare('INSERT INTO user_agencies(user_id,agency_id,is_active) VALUES(?,?,?)').run(id,agencyId,user.membershipActive);
  };
  add(1); add(2, 2); add(3,6,{membershipActive:0}); add(4,6,{active:0}); add(5,6,{archived:1});
  add(6,6,{status:'ONBOARDING'}); add(7,6,{status:'ACTIVE'}); add(8,6,{status:'COMPLETED'});
  add(9,6,{role:'client_guardian'}); add(10,6,{assistant:1}); add(11,6,{demo:1}); add(12,6,{fill:1});
  add(13,6,{role:'tutor'});
  mocks.execute.mockImplementation(async (sql, params = []) => {
    if (/information_schema\.columns/i.test(sql)) return [[{ COLUMN_NAME: 'present', ok: 1 }]];
    return [db.prepare(sql).all(...params)];
  });
});
afterEach(() => db.close());

it('returns only ACTIVE_EMPLOYEE staff with active selected-agency membership even when includeInactive is also requested', async () => {
  const res = response(), next = vi.fn();
  await listPayrollAgencyUsers(request({ includeInactive: 'true' }), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json.mock.calls[0][0].map(row => row.id)).toEqual([1, 13]);
  expect(res.json.mock.calls[0][0][0]).toMatchObject({ agency_id: 6, agency_is_active: 1, status: 'ACTIVE_EMPLOYEE' });
});

it('rejects payroll roster access before returning employee identities', async () => {
  const res = response();
  await listPayrollAgencyUsers({ ...request(), user: { id: 1, role: 'provider' } }, res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(res.json).toHaveBeenCalledWith({ error: { message: 'Payroll access required' } });
  expect(mocks.execute.mock.calls.some(([sql]) => sql.includes('SELECT DISTINCT u.id'))).toBe(false);
});

it('preserves the existing historical roster option outside active-only selectors', async () => {
  const res = response();
  await listPayrollAgencyUsers(request({ activeEmployeesOnly: 'false', includeInactive: 'true' }), res, vi.fn());
  const ids = res.json.mock.calls[0][0].map(row => row.id);
  expect(ids).toContain(4); expect(ids).toContain(6); expect(ids).not.toContain(2); expect(ids).not.toContain(10);
});

it('keeps former employee names on saved manual lines without adding them to new pay selectors', async () => {
  db.exec("INSERT INTO payroll_manual_pay_lines VALUES (1,912,6,4,'Historical correction',40,NULL),(2,912,2,2,'Other agency',50,NULL)");
  const lines = await ManualPayLine.listForPeriod({ payrollPeriodId: 912, agencyId: 6 });
  expect(lines).toHaveLength(1);
  expect(lines[0]).toMatchObject({ user_id: 4, first_name: 'Employee4', last_name: 'Test', label: 'Historical correction' });
});
