import { beforeEach, afterEach, expect, test, vi } from 'vitest';

const { execute, sendEmail } = vi.hoisted(() => ({ execute: vi.fn(), sendEmail: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute } }));
vi.mock('../../config/config.js', () => ({ default: {} }));
vi.mock('../../models/SchoolOnboardingQrLink.model.js', () => ({ default: {} }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/AgencySchool.model.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: {} }));
vi.mock('../emailTemplate.service.js', () => ({ default: { getTemplateForAgency: vi.fn() } }));
vi.mock('../email.service.js', () => ({ default: { sendEmail } }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn() }));
vi.mock('../emailSenderIdentityResolver.service.js', () => ({ resolvePreferredSenderIdentityForAgency: vi.fn() }));
vi.mock('../schoolOnboardingIntakeBootstrap.service.js', () => ({ ensureDigitalIntakeFormsForSchool: vi.fn() }));

import SchoolOnboardingInvite from '../../models/SchoolOnboardingInvite.model.js';
import { getPublicInvite, isInviteUsable, resendInvite, serializeInvite } from '../schoolOnboarding.service.js';

const legacyInvite = (overrides = {}) => ({
  id: 12, agency_id: 2, school_organization_id: 430, primary_user_id: 123,
  school_name: 'Keller Elementary School', token: 'original-school-link',
  contact_first_name: 'School', contact_last_name: 'Contact', contact_email: 'contact@example.test',
  created_at: '2026-09-01T17:35:53Z', expires_at: '2026-09-22T17:35:54Z',
  status: 'invited', last_viewed_at: '2026-09-01T17:40:04Z',
  step_progress: SchoolOnboardingInvite.defaultStepProgress(), step_payload: {},
  ...overrides
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2126-09-29T00:00:00Z'));
});
afterEach(() => vi.useRealTimers());

test.each(['invited', 'in_progress', 'expired'])('old %s links stay usable even a century later', (status) => {
  expect(isInviteUsable(legacyInvite({ status }))).toEqual({ ok: true, submitted: false });
});

test('revocation and completed-onboarding behavior remain enforced', () => {
  expect(isInviteUsable(null)).toMatchObject({ ok: false, code: 'not_found' });
  expect(isInviteUsable(legacyInvite({ status: 'revoked' }))).toMatchObject({ ok: false, code: 'revoked' });
  expect(isInviteUsable(legacyInvite({ status: 'submitted' }))).toEqual({ ok: true, submitted: true });
});

test.each([
  [{}, 'invited'],
  [{ recipient_started_at: '2026-09-02' }, 'in_progress'],
  [{ password_set_at: '2026-09-02' }, 'in_progress'],
  [{ submitted_at: '2026-09-03' }, 'submitted']
])('legacy expired records recover their status and preserve their token and progress: %j', (fields, status) => {
  const row = legacyInvite({ status: 'expired', ...fields });
  const normalized = SchoolOnboardingInvite.normalizeRow(row);
  expect(normalized).toMatchObject({ status, expires_at: null, token: row.token, step_progress: row.step_progress });
  expect(serializeInvite(normalized).expiresAt).toBeNull();
  expect(serializeInvite(normalized).displayStatus).not.toBe('expired');
});

test('Keller-style existing URL opens after its old expiration date', async () => {
  execute.mockImplementation(async (sql) => {
    if (sql.includes('WHERE BINARY i.token')) return [[legacyInvite()]];
    return [[]];
  });
  const result = await getPublicInvite('original-school-link');
  expect(result).toMatchObject({ id: 12, schoolName: 'Keller Elementary School', expiresAt: null, submitted: false });
  const lookups = execute.mock.calls.filter(([sql]) => sql.includes('WHERE BINARY i.token'));
  expect(lookups).toHaveLength(2);
  expect(lookups.every(([, values]) => values[0] === 'original-school-link')).toBe(true);
});

test('public access to a revoked link is still blocked', async () => {
  execute.mockResolvedValue([[legacyInvite({ status: 'revoked' })]]);
  await expect(getPublicInvite('original-school-link')).rejects.toMatchObject({ status: 403, code: 'revoked' });
  expect(execute).toHaveBeenCalledTimes(1);
});

test('new invites persist no expiration even if an old caller provides one', async () => {
  execute.mockResolvedValue([{ insertId: 12 }]);
  vi.spyOn(SchoolOnboardingInvite, 'findById').mockResolvedValue(legacyInvite({ expires_at: null }));
  await SchoolOnboardingInvite.create({
    agencyId: 2, schoolOrganizationId: 430, primaryUserId: 123,
    contactFirstName: 'School', contactLastName: 'Contact', contactEmail: 'contact@example.test',
    schoolName: 'Keller Elementary School', expiresAt: new Date('2026-09-22')
  });
  const [, values] = execute.mock.calls[0];
  expect(values[9]).toBeNull();
  expect(values).not.toContain(undefined);
});

test('resending emails the original link without rotating its token', async () => {
  const invite = SchoolOnboardingInvite.normalizeRow(legacyInvite());
  vi.spyOn(SchoolOnboardingInvite, 'findById').mockResolvedValue(invite);
  const update = vi.spyOn(SchoolOnboardingInvite, 'update').mockResolvedValue(invite);
  const generateToken = vi.spyOn(SchoolOnboardingInvite, 'generateToken');
  const result = await resendInvite(12, 2, null);
  expect(result.emailSent).toBe(true);
  expect(result.link).toContain('/school-onboarding/original-school-link');
  expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining(result.link) }));
  expect(generateToken).not.toHaveBeenCalled();
  expect(update.mock.calls.every(([, patch]) => patch.token === undefined)).toBe(true);
  expect(update).toHaveBeenCalledWith(12, expect.objectContaining({ expiresAt: null }));
});
