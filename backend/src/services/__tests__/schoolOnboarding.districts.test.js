import { beforeEach, expect, test, vi } from 'vitest';

const { execute, findByToken, update } = vi.hoisted(() => ({
  execute: vi.fn(), findByToken: vi.fn(), update: vi.fn()
}));
vi.mock('../../config/database.js', () => ({ default: { execute } }));
vi.mock('../../config/config.js', () => ({ default: {} }));
vi.mock('../../models/SchoolOnboardingInvite.model.js', () => ({
  default: { findByToken, update }
}));
vi.mock('../../models/SchoolOnboardingQrLink.model.js', () => ({ default: {} }));
vi.mock('../../models/Agency.model.js', () => ({ default: {} }));
vi.mock('../../models/AgencySchool.model.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
vi.mock('../emailTemplate.service.js', () => ({ default: {} }));
vi.mock('../email.service.js', () => ({ default: {} }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn() }));
vi.mock('../emailSenderIdentityResolver.service.js', () => ({ resolvePreferredSenderIdentityForAgency: vi.fn() }));
vi.mock('../schoolOnboardingIntakeBootstrap.service.js', () => ({ ensureDigitalIntakeFormsForSchool: vi.fn() }));

import { syncOutreachPartnerFromOnboarding, saveStep } from '../schoolOnboarding.service.js';

beforeEach(() => { vi.resetAllMocks(); });

test('outreach sync saves Denver Public Schools as DPS on repeat onboarding syncs', async () => {
  execute.mockImplementation(async (sql) => {
    if (sql.includes('FROM outreach_schools')) {
      return [[{ id: 9, address: '123 School St', district_name: 'Denver Public Schools' }]];
    }
    return [{ affectedRows: 1 }];
  });
  const invite = { agency_id: 1, school_organization_id: 22, outreach_school_id: 9 };
  await syncOutreachPartnerFromOnboarding(invite);
  await syncOutreachPartnerFromOnboarding(invite);
  const writes = execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO school_profiles'));
  expect(writes).toHaveLength(2);
  for (const [, params] of writes) expect(params.slice(0, 2)).toEqual([22, 'DPS']);
});

test('onboarding rejects invented districts before making any writes', async () => {
  findByToken.mockResolvedValue({
    id: 1, school_organization_id: 22, school_name: 'Grant Beacon',
    status: 'in_progress', expires_at: '2099-01-01', step_progress: {}, step_payload: {}
  });
  execute.mockResolvedValue([[{ district_name: 'DPS' }]]);
  await expect(saveStep('token', 'school_information', {
    schoolName: 'Changed name', districtName: 'Denvar Public Schools'
  }, false)).rejects.toMatchObject({ status: 400 });
  expect(update).not.toHaveBeenCalled();
  expect(execute.mock.calls.every(([sql]) => sql.trim().startsWith('SELECT'))).toBe(true);
});
