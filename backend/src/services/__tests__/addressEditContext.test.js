import { beforeEach, expect, it, vi } from 'vitest';
const mocked = vi.hoisted(() => ({ user: vi.fn(), journey: vi.fn(), renewal: vi.fn(), invite: vi.fn(), usable: vi.fn(), validateAnnual: vi.fn(), cycle: vi.fn(), annualWrite: vi.fn(), adaptive: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { validatePasswordlessToken: mocked.user } }));
vi.mock('../hireJourney.service.js', () => ({ getJourney: mocked.journey, journeyTasks: vi.fn() }));
vi.mock('../clientRenewal.service.js', () => ({ getRenewalByToken: mocked.renewal }));
vi.mock('../../models/SchoolOnboardingInvite.model.js', () => ({ default: { findByToken: mocked.invite } }));
vi.mock('../schoolOnboarding.service.js', () => ({ isInviteUsable: mocked.usable }));
vi.mock('../schoolReinit.service.js', () => ({ validateToken: mocked.validateAnnual, resolveTokenCycle: mocked.cycle }));
vi.mock('../schoolYearUpdateAccess.service.js', () => ({ assertAnnualWrite: mocked.annualWrite }));
vi.mock('../adaptiveIntake.service.js', () => ({ getAdaptiveAddressEditContext: mocked.adaptive }));
import { validateAddressEditContext } from '../addressEditContext.service.js';
const token = 'synthetic-existing-form-capability';
beforeEach(() => {
  vi.clearAllMocks();
  mocked.user.mockResolvedValue({ id: 71, status: 'PREHIRE_OPEN', email: 'synthetic@example.test', role: 'provider' });
  mocked.journey.mockResolvedValue({});
  mocked.renewal.mockResolvedValue({ id: 80, agency_id: 450, client_id: 51, status: 'in_progress', option_verify_contact: 1 });
  mocked.invite.mockResolvedValue({ id: 81, agency_id: 450, school_organization_id: 451, status: 'in_progress' });
  mocked.usable.mockReturnValue({ ok: true, submitted: false });
  mocked.validateAnnual.mockResolvedValue({ valid: true, row: { cycle_id: 82, agency_id: 450, school_organization_id: 451 } });
  mocked.cycle.mockResolvedValue({ id: 82, agency_id: 450, school_organization_id: 451, status: 'in_progress', school_year: '2026-2027' });
  mocked.annualWrite.mockResolvedValue({ canWrite: true });
  mocked.adaptive.mockResolvedValue({ agencyId: 450, serviceType: 'counseling' });
});
it.each([null, [], {}, { kind: 'prehire', token: 13 }, { kind: 'prehire', token: ' ' }, { kind: 'prehire', token: 'a'.repeat(513) }, { kind: 'school-event-post', token }, { kind: 'intake', token }])('rejects missing/unknown context without touching existing tokens: %j', async context => {
  await expect(validateAddressEditContext(context)).rejects.toMatchObject({ status: 404, code: 'ADDRESS_CONTEXT_UNAVAILABLE' });
  for (const fn of Object.values(mocked)) expect(fn).not.toHaveBeenCalled();
});
it('uses existing prehire authentication AND the actual background-write phase gate', async () => {
  expect(await validateAddressEditContext({ kind: 'prehire', token, userId: 71 })).toBe('prehire:71:background-check');
  expect(mocked.user).toHaveBeenCalledWith(token); expect(mocked.journey).toHaveBeenCalledWith(71);
});
it('refuses an invalid/expired prehire token without reading its journey', async () => {
  mocked.user.mockResolvedValue(null);
  await expect(validateAddressEditContext({ kind: 'prehire', token })).rejects.toMatchObject({ status: 401 });
  expect(mocked.journey).not.toHaveBeenCalled();
});
it.each(['PREHIRE_REVIEW', 'ONBOARDING', 'ACTIVE_EMPLOYEE'])('does not reopen a background address form after status %s', async status => {
  mocked.user.mockResolvedValue({ id: 71, status });
  await expect(validateAddressEditContext({ kind: 'prehire', token })).rejects.toMatchObject({ status: status === 'ACTIVE_EMPLOYEE' ? 403 : 409 });
});
it.each([{ prehireCompletedAt: '2026-11-10' }, { onboardingCompletedAt: '2026-11-10' }])('refuses closed journey without changing the account', async journey => {
  mocked.journey.mockResolvedValue(journey);
  await expect(validateAddressEditContext({ kind: 'prehire', token })).rejects.toMatchObject({ status: 409 });
});
it.each(['draft', 'sent', 'in_progress', 'completed'])('preserves existing renewal contact-edit status %s', async status => {
  mocked.renewal.mockResolvedValue({ id: 80, agency_id: 450, client_id: 51, status, option_verify_contact: '1' });
  expect(await validateAddressEditContext({ kind: 'client-renewal', token, clientId: 51, agencyId: 450 })).toBe('client-renewal:80:450:51');
});
it.each([null, { id: 80, agency_id: 450, client_id: 51, status: 'cancelled', option_verify_contact: 1 }, { id: 80, agency_id: 450, client_id: 51, status: 'opted_out', option_verify_contact: 1 }, { id: 80, agency_id: 450, client_id: 51, status: 'in_progress', option_verify_contact: 0 }])('rejects missing/non-editable renewal: %j', async row => {
  mocked.renewal.mockResolvedValue(row);
  await expect(validateAddressEditContext({ kind: 'client-renewal', token })).rejects.toMatchObject({ status: 404 });
});
it('reuses the school invite usability policy without touching viewed/provisioning state', async () => {
  const result = await validateAddressEditContext({ kind: 'school-onboarding', token, schoolOrganizationId: 451 });
  expect(result).toBe('school-onboarding:81:450:451');
  expect(mocked.invite).toHaveBeenCalledWith(token); expect(mocked.usable).toHaveBeenCalledWith(await mocked.invite.mock.results[0].value);
});
it.each([{ ok: false, code: 'revoked' }, { ok: false, code: 'not_found' }, { ok: true, submitted: true }])('rejects unusable/closed school invite: %j', async result => {
  mocked.usable.mockReturnValue(result);
  await expect(validateAddressEditContext({ kind: 'school-onboarding', token })).rejects.toMatchObject({ status: 404 });
});
it('keeps the existing legacy/no-expiry school-invite policy rather than adding a new expiry rule', async () => {
  mocked.invite.mockResolvedValue({ id: 81, agency_id: 450, school_organization_id: 451, status: 'in_progress', expires_at: '2020-01-01' });
  expect(await validateAddressEditContext({ kind: 'school-onboarding', token })).toBe('school-onboarding:81:450:451');
});
it('uses original annual cycle validation and its current annual-write gate without creating a cycle', async () => {
  expect(await validateAddressEditContext({ kind: 'school-reinit', token, agencyId: 450 })).toBe('school-reinit:82:450:451');
  expect(mocked.validateAnnual).toHaveBeenCalledWith(token);
  expect(mocked.cycle).toHaveBeenCalledWith({ cycle_id: 82, agency_id: 450, school_organization_id: 451 });
  expect(mocked.annualWrite).toHaveBeenCalledWith(await mocked.cycle.mock.results[0].value);
});
it.each([{ valid: false, reason: 'expired' }, { valid: false, reason: 'not_found' }, { valid: true, row: { locked_at: '2026-11-10' } }])('rejects expired/locked annual token before cycle/write checks: %j', async result => {
  mocked.validateAnnual.mockResolvedValue(result);
  await expect(validateAddressEditContext({ kind: 'school-reinit', token })).rejects.toMatchObject({ status: 404 });
  expect(mocked.cycle).not.toHaveBeenCalled(); expect(mocked.annualWrite).not.toHaveBeenCalled();
});
it.each([null, { id: 82, agency_id: 450, school_organization_id: 451, status: 'finalized' }, { id: 99, agency_id: 450, school_organization_id: 451 }, { id: 82, agency_id: 999, school_organization_id: 451 }, { id: 82, agency_id: 450, school_organization_id: 999 }])('rejects wrong/missing/closed annual cycle: %j', async cycle => {
  mocked.cycle.mockResolvedValue(cycle);
  await expect(validateAddressEditContext({ kind: 'school-reinit', token })).rejects.toMatchObject({ status: 404 });
  expect(mocked.annualWrite).not.toHaveBeenCalled();
});
it('respects disabled rollout/deadline/first-year annual gates instead of bypassing them for lookup', async () => {
  mocked.annualWrite.mockRejectedValue(Object.assign(new Error('Annual update closed'), { status: 409, code: 'ANNUAL_UPDATE_CLOSED' }));
  await expect(validateAddressEditContext({ kind: 'school-reinit', token })).rejects.toMatchObject({ status: 409, code: 'ANNUAL_UPDATE_CLOSED' });
});
it.each([{ kind: 'prehire', userId: 72 }, { kind: 'client-renewal', clientId: 52 }, { kind: 'client-renewal', agencyId: 451 }, { kind: 'school-onboarding', schoolOrganizationId: 452 }, { kind: 'school-onboarding', agencyId: 999 }, { kind: 'school-reinit', schoolOrganizationId: 452 }])('rejects caller identities that disagree with validated scope: %j', async context => {
  await expect(validateAddressEditContext({ ...context, token })).rejects.toMatchObject({ status: 404 });
});
it.each(['prehire', 'client-renewal', 'school-onboarding', 'school-reinit'])('returns only stable app-server scope, no raw capability/person data (%s)', async kind => {
  const scope = await validateAddressEditContext({ kind, token });
  expect(typeof scope).toBe('string'); expect(scope).not.toContain(token); expect(scope).not.toContain('@');
  expect(scope).not.toContain('Synthetic');
});

it('limits public join address lookup to its existing active agency and enabled service', async () => {
  expect(await validateAddressEditContext({ kind: 'adaptive-join', token: 'synthetic-clinic', serviceType: 'counseling' })).toBe('adaptive-join:450:counseling');
  expect(mocked.adaptive).toHaveBeenCalledWith('synthetic-clinic', 'counseling');
});
it.each([null, { agencyId: 0, serviceType: 'counseling' }, { agencyId: 450, serviceType: 'disabled' }])('refuses an unavailable join address context: %j', async form => {
  mocked.adaptive.mockResolvedValue(form);
  await expect(validateAddressEditContext({ kind: 'adaptive-join', token: 'synthetic-clinic', serviceType: 'counseling' })).rejects.toMatchObject({ status: 404 });
});
it('rejects a different caller agency even for a valid public join slug', async () => {
  await expect(validateAddressEditContext({ kind: 'adaptive-join', token: 'synthetic-clinic', serviceType: 'counseling', agencyId: 999 })).rejects.toMatchObject({ status: 404 });
});
