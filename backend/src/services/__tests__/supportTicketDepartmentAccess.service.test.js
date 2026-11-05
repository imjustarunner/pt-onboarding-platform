import test from 'node:test';
import assert from 'node:assert/strict';
import pool from '../../config/database.js';
import { canWorkDepartmentTicket, ticketDepartmentKeys, appendDepartmentTicketVisibility } from '../supportTicketDepartmentAccess.service.js';
test.after(() => pool.end());

function fixture({ agencyId = 2, payroll = true, active = true } = {}) {
  const identities = [
    { id: 1, agency_id: 2, identity_key: 'payroll', from_email: 'payroll@agency.test', kind: 'shared' },
    { id: 2, agency_id: 3, identity_key: 'payroll', from_email: 'payroll@other.test', kind: 'shared' },
    { id: 3, agency_id: 2, identity_key: 'personal_5', from_email: 'person@agency.test', kind: 'personal', owner_user_id: 5 },
    { id: 4, agency_id: 2, identity_key: 'billing', from_email: 'billing@agency.test', kind: 'shared' }
  ];
  const calls = [];
  return { calls, db: { async execute(sql, params = []) {
    calls.push({ sql, params });
    assert.equal((sql.match(/\?/g) || []).length, params.length);
    if (sql.includes('FROM email_sender_identities')) return [params.length ? identities.filter(i => i.agency_id === params[0]) : identities];
    if (sql.includes('FROM users u JOIN user_agencies')) return [[{ id: 5, role: 'provider', status: 'ACTIVE_EMPLOYEE', is_active: 1,
      membership_active: active && Number(params[1]) === agencyId ? 1 : 0, has_payroll_access: payroll ? 1 : 0 }]];
    throw new Error('Unexpected SQL');
  } } };
}
const ticket = { id: 10, agency_id: 2, source_channel: 'email', topic: 'payroll', source_email_recipients: '["payroll@agency.test"]' };

test('authorizes a payroll provider from current agency grants, rejecting cross-agency and inactive membership', async () => {
  assert.equal(await canWorkDepartmentTicket({ ticket, userId: 5, db: fixture().db }), true);
  assert.equal(await canWorkDepartmentTicket({ ticket, userId: 5, db: fixture({ agencyId: 3 }).db }), false);
  assert.equal(await canWorkDepartmentTicket({ ticket, userId: 5, db: fixture({ active: false }).db }), false);
  assert.equal(await canWorkDepartmentTicket({ ticket, userId: 5, db: fixture({ payroll: false }).db }), false);
});

test('personal Group logins and school portal tickets do not become departmental mail', async () => {
  assert.deepEqual(await ticketDepartmentKeys({ ...ticket, topic: 'general', source_email_recipients: '["person@agency.test"]' }, fixture().db), []);
  assert.deepEqual(await ticketDepartmentKeys({ ...ticket, source_channel: 'portal' }, fixture().db), []);
  assert.deepEqual(await ticketDepartmentKeys({ ...ticket, topic: 'general', source_email_recipients: '["payroll@unconfigured.test"]' }, fixture().db), []);
});

test('builds permission filters before pagination and excludes personal addresses from group visibility', async () => {
  const where = [], params = [];
  await appendDepartmentTicketVisibility({ userId: 5, where, params, requireDepartment: true, db: fixture().db });
  const sql = where.join(' AND ');
  assert.equal((sql.match(/\?/g) || []).length, params.length);
  assert.ok(params.includes('%"payroll@agency.test"%'));
  assert.ok(params.includes('%"billing@agency.test"%'));
  assert.ok(!params.includes('%"person@agency.test"%'));
  assert.match(sql, /t\.created_by_user_id=\?/);
});
