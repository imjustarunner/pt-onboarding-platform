import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: vi.fn(), getAgencies: vi.fn(async () => [{ id: 30 }]), isSupervisor: () => false } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn(async () => ({ id: 30, organization_type: 'school' })) } }));
vi.mock('../../models/OrganizationAffiliation.model.js', () => ({ default: { getActiveAgencyIdForOrganization: vi.fn(async () => 2) } }));
vi.mock('../../services/leaveOfAbsence.service.js', () => ({ getLeaveInfoForUserIds: vi.fn(async () => new Map()) }));
vi.mock('../../services/providerAcceptedInsurance.service.js', () => ({ listProviderAcceptedInsurances: vi.fn(async () => []) }));
import pool from '../../config/database.js';
import User from '../../models/User.model.js';
import { listSchoolProvidersForScheduling } from '../schoolProviderSchedule.controller.js';
import { getProviderSchoolProfile } from '../schoolProviderProfile.controller.js';

const person = { id: 7, provider_user_id: 7, first_name: 'Example', last_name: 'Clinician', email: 'clinician@platform.example', provider_school_info_blurb: 'School introduction', school_info_blurb: 'School introduction' };
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const request = { user: { id: 8, role: 'super_admin' }, params: { schoolId: '30', providerId: '7' } };
beforeEach(() => {
  vi.clearAllMocks();
  User.findById.mockResolvedValue(person);
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('FROM email_sender_identities')) return [[{ identity_key: 'personal_7', from_email: 'clinician@school-agency.example' }]];
    if (sql.includes('FROM user_login_emails')) return [[]];
    if (sql.includes('SELECT 1') && sql.includes('user_agencies')) return [[{ present: 1 }]];
    if (sql.includes('SELECT psa.provider_user_id,')) return [[{ ...person, day_of_week: 'Thursday', slots_total: 4, slots_available: 4, is_active: 1 }]];
    return [[]];
  });
});

it('shows the parent-agency email on the school provider card', async () => {
  const res = response(), next = vi.fn();
  await listSchoolProvidersForScheduling(request, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith([expect.objectContaining({ provider_user_id: 7, email: 'clinician@school-agency.example', school_info_blurb: 'School introduction' })]);
  expect(pool.execute).toHaveBeenCalledWith(expect.stringContaining('FROM email_sender_identities'), [2, 'personal_7']);
});

it('shows the same agency email in the full school provider profile without changing the account email', async () => {
  const res = response(), next = vi.fn();
  await getProviderSchoolProfile(request, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ provider_user_id: 7, email: 'clinician@school-agency.example', school_info_blurb: 'School introduction' }));
  expect(person.email).toBe('clinician@platform.example');
  expect(pool.execute.mock.calls.some(([sql]) => /^(INSERT|UPDATE|DELETE)/.test(sql.trim()))).toBe(false);
});
