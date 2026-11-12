import test from 'node:test';
import assert from 'node:assert/strict';
import { isDepartmentalStaffCopy } from '../supportTicketEmailPolicy.js';
const identity = { agency_id: 2, identity_key: 'payroll', from_email: 'Payroll@example.test', kind: 'shared' };
test('new mail addressed to Payroll creates work even when initiated by a team/shared sender', () => {
  assert.equal(isDepartmentalStaffCopy({ identity, sharedSender: true, recipients: ['payroll@example.test'] }), false);
  assert.equal(isDepartmentalStaffCopy({ identity, departmentResponder: true, recipients: ['payroll@example.test'] }), false);
});
test('actual department replies and external sent copies remain staff history', () => {
  assert.equal(isDepartmentalStaffCopy({ identity, sharedSender: true, replying: true, recipients: ['payroll@example.test'] }), true);
  assert.equal(isDepartmentalStaffCopy({ identity, departmentResponder: true, replying: true }), true);
  assert.equal(isDepartmentalStaffCopy({ identity, sharedSender: true, recipients: ['external@example.test'] }), true);
  assert.equal(isDepartmentalStaffCopy({ identity, departmentResponder: false, replying: true, recipients: ['payroll@example.test'] }), false);
  assert.equal(isDepartmentalStaffCopy({ identity: { ...identity, identity_key: 'support', from_email: 'support@example.test' },
    sharedSender: true, recipients: ['support@example.test'] }), true, 'other mailbox workflows keep their existing echo policy');
});
