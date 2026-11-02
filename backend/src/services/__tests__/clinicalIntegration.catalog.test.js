import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../billingPolicy.service.js', () => ({ resolvePolicyRuleForServiceCode: vi.fn(), isServiceCodeEnabledForAgency: vi.fn() }));
vi.mock('../staffCareEligibility.service.js', () => ({ readStaffCareEligibility: vi.fn() }));
import pool from '../../config/database.js';
import { readStaffCareEligibility } from '../staffCareEligibility.service.js';
import { resolvePolicyRuleForServiceCode, isServiceCodeEnabledForAgency } from '../billingPolicy.service.js';
import { resolveAgencySchedulingCatalog } from '../agencySchedulingCatalog.service.js';
import { getSchedulingBookingMetadata, validateSchedulingSelection } from '../schedulingTaxonomy.service.js';
import { ensureSchedulingCatalogEntry } from '../schedulingCatalogSync.service.js';
let medical;
const resolve = (tier = 'intern_plus', agencyId = 377) => resolveAgencySchedulingCatalog({ agencyId, credentialTier: tier, allServiceCodes: [], eligibleServiceCodes: [] });
beforeEach(() => {
  vi.resetAllMocks();
  medical = [{ service_code: '90791', is_active: 1, description: 'Intake', allowed_credential_tiers_json: '["intern_plus"]' }];
  isServiceCodeEnabledForAgency.mockResolvedValue(true);
  resolvePolicyRuleForServiceCode.mockResolvedValue({ enabledForAgency: true, allowedForCredentialTier: true, eligibilityRows: [{ credential_tier: 'intern_plus', allowed: 1 }] });
  readStaffCareEligibility.mockResolvedValue({ canProvideCare: true, credentialTier: 'intern_plus' });
  pool.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('FROM agency_medical_service_codes')) return [args[1] === 377 ? medical : []];
    if (sql.includes('FROM appointment_types')) return [[{ code: 'SESSION' }]];
    return [[]];
  });
});
it('offers and accepts the agency-approved intake when the shared dictionary is incomplete', async () => {
  const context = { agencyId: 377, providerId: 501, userRole: 'provider', providerCredentialText: 'LPC' };
  expect((await getSchedulingBookingMetadata(context)).eligibleServiceCodes).toContainEqual(expect.objectContaining({ code: '90791', defaultNoteType: 'INTAKE' }));
  await expect(validateSchedulingSelection({ ...context, appointmentTypeCode: 'SESSION', serviceCode: '90791', startAt: '2026-09-05 20:30:00', endAt: '2026-09-05 21:30:00' })).resolves.toMatchObject({ serviceCode: '90791' });
});
it('does not transfer an agency permission to another agency or credential tier', async () => {
  expect((await resolve('intern_plus', 378)).eligibleServiceCodes).toEqual([]);
  expect((await resolve('bachelors')).eligibleServiceCodes).toEqual([]);
  expect((await resolve('qbha')).eligibleServiceCodes).toEqual([]);
});
it.each([{ is_active: 0 }, { scheduling_is_active: 0 }, { scheduling_tier_allowed: 0 }, { is_addon: 1 }, { allowed_credential_tiers_json: '["bachelors"]' }])('preserves explicit restrictions: %j', override => {
  Object.assign(medical[0], override);
  return expect(resolve()).resolves.toMatchObject({ eligibleServiceCodes: [] });
});
it('preserves policy denials and care-assignment restrictions', async () => {
  resolvePolicyRuleForServiceCode.mockResolvedValue({ enabledForAgency: true, allowedForCredentialTier: false });
  expect((await resolve()).eligibleServiceCodes).toEqual([]);
  readStaffCareEligibility.mockResolvedValue({ canProvideCare: false, credentialTier: 'intern_plus' });
  expect((await getSchedulingBookingMetadata({ agencyId: 377, providerId: 501 })).eligibleServiceCodes).toEqual([]);
});
it('keeps group-only metadata and excludes known add-ons even with old missing flags', async () => {
  medical = ['90853', '90785', '90840', '99051'].map(service_code => ({ ...medical[0], service_code, session_mode: 'group' }));
  expect((await resolve()).eligibleServiceCodes).toEqual([expect.objectContaining({ code: '90853', sessionMode: 'group' })]);
});
it('synchronizes the real dictionary columns and canonical tiers without overwriting existing overrides', async () => {
  const db = { execute: vi.fn(async () => [{ affectedRows: 0 }]) };
  await ensureSchedulingCatalogEntry('90791', { db });
  expect(db.execute.mock.calls[0][0]).toMatch(/INSERT IGNORE INTO scheduling_service_codes\s+\(code, label,/);
  expect(db.execute.mock.calls.slice(1).map(([, args]) => args)).toEqual([['intern_plus', '90791']]);
  db.execute.mockClear();
  for (const code of ['90785', '90840', '99051', '99999']) await ensureSchedulingCatalogEntry(code, { db });
  expect(db.execute).not.toHaveBeenCalled();
});
it('propagates sync failures instead of claiming success', async () => {
  const error = new Error('database unavailable');
  await expect(ensureSchedulingCatalogEntry('90791', { db: { execute: vi.fn().mockRejectedValue(error) } })).rejects.toBe(error);
});
it('does not bypass agency restrictions when the catalog cannot be read', async () => {
  pool.execute.mockRejectedValue({ code: 'ER_BAD_FIELD_ERROR' });
  await expect(resolve()).rejects.toMatchObject({ status: 503, code: 'SERVICE_CATALOG_UNAVAILABLE' });
});
it('preserves a stricter credential duration override', async () => {
  medical[0].min_minutes = 20;
  const result = await resolveAgencySchedulingCatalog({ agencyId: 377, credentialTier: 'intern_plus',
    allServiceCodes: [{ code: '90791', minDurationMinutes: 30 }], eligibleServiceCodes: [{ code: '90791', minDurationMinutes: 45 }] });
  expect(result.eligibleServiceCodes[0].minDurationMinutes).toBe(45);
});
