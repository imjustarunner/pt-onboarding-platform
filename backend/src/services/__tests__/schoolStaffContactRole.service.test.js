import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeSchoolStaffContactEmail,
  resolveSchoolStaffRoleTitleForUser
} from '../../services/schoolStaffContactRole.service.js';

test('normalizeSchoolStaffContactEmail trims and lowercases', () => {
  assert.equal(normalizeSchoolStaffContactEmail('  Ivy@School.ORG  '), 'ivy@school.org');
  assert.equal(normalizeSchoolStaffContactEmail('not-an-email'), '');
});

test('resolveSchoolStaffRoleTitleForUser prefers users.title', async () => {
  const title = await resolveSchoolStaffRoleTitleForUser({
    id: 1,
    role: 'school_staff',
    title: 'School Counselor',
    email: 'counselor@school.org'
  });
  assert.equal(title, 'School Counselor');
});

test('resolveSchoolStaffRoleTitleForUser returns null for non-school staff without title', async () => {
  const title = await resolveSchoolStaffRoleTitleForUser({
    id: 2,
    role: 'provider',
    title: null,
    email: 'provider@example.com'
  });
  assert.equal(title, null);
});
