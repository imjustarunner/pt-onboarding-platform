import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ agencies: vi.fn() }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: m.agencies } }));
import { canRecoverReferralDraft, recoveryAgencyIds, referralDraftResponse } from '../referralDraftRecovery.service.js';

beforeEach(() => { vi.clearAllMocks(); m.agencies.mockResolvedValue([{ id: 2 }]); });
it('allows uploaders to resume their own saved packet', async () => {
  expect(await canRecoverReferralDraft({ id: 7, role: 'provider_plus' }, { uploaded_by_user_id: 7, agency_id: 2 })).toBe(true);
  expect(m.agencies).not.toHaveBeenCalled();
});
it('blocks another provider and admins from a different agency', async () => {
  const draft = { uploaded_by_user_id: 7, agency_id: 3 };
  expect(await canRecoverReferralDraft({ id: 8, role: 'provider_plus' }, draft)).toBe(false);
  expect(await canRecoverReferralDraft({ id: 8, role: 'admin' }, draft)).toBe(false);
  expect(await canRecoverReferralDraft({ id: 8, role: 'admin' }, { ...draft, agency_id: 2 })).toBe(true);
});
it('fails closed when the agency filter is outside membership or there are no memberships', async () => {
  expect(await recoveryAgencyIds({ id: 8, role: 'admin' }, 3)).toEqual([]);
  m.agencies.mockResolvedValue([]);
  expect(await recoveryAgencyIds({ id: 8, role: 'admin' })).toEqual([]);
  expect(await recoveryAgencyIds({ id: 8, role: 'support' })).toEqual([]);
});
it('keeps platform administrators able to select a single agency', async () => {
  expect(await recoveryAgencyIds({ id: 9, role: 'super_admin' })).toBeNull();
  expect(await recoveryAgencyIds({ id: 9, role: 'super_admin' }, 2)).toEqual([2]);
});
it('excludes inactive agency memberships from recovery', async () => {
  m.agencies.mockResolvedValue([{ id: 2, membership_is_active: 0 }, { id: 3, is_active: true }]);
  expect(await recoveryAgencyIds({ id: 8, role: 'admin' })).toEqual([3]);
});
it('does not expose storage paths or encryption material in the review response', () => {
  const response = referralDraftResponse({ id: 3, organization_id: 4, agency_id: 2, status: 'draft', storage_path: 'private', encryption_key: 'private' });
  expect(response).not.toHaveProperty('storage_path');
  expect(response).not.toHaveProperty('encryption_key');
});
