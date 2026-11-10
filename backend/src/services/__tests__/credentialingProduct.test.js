import { it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(async () => []), listCredentialingAgencyIds: vi.fn(async () => []) } }));
vi.mock('../../utils/capabilities.js', () => ({ userHasCredentialingAccessForAgency: vi.fn(async () => false), expandCredentialingAgencyIds: vi.fn(async ids => ids) }));
vi.mock('../auricwell/sharedProviders.js', () => ({ staffIdentity: vi.fn() }));
import { supervisionActor } from '../auricwell/supervision.js';
import { credentialingActor } from '../auricwell/credentialing.js';
import { canAccessCredentialing, createCredentialingActor, grantCredentialingActor, credentialingProductAgency } from '../credentialingAccess.service.js';
import { createAuricwellBillingActor } from '../productBillingContext.service.js';
import { requireAddon } from '../auricwell/policy.js';

const ctx = { accountId: 'account', actorType: 'staff', permissions: ['credentialing'], settings: { addons: { credentialing: true, supervision: true } } };
function fixture() { return { pool: { execute: vi.fn(async () => [[{ id: 7, role: 'provider', status: 'EHR_ONLY' }]]) }, owningAgency: vi.fn(async () => 1), staffIdentity: vi.fn(async () => ({ active: true, userId: 7 })) }; }
it('requires both the add-on and a staff credentialing or admin permission before accessing shared data', async () => {
  for (const changed of [{ permissions: ['billing'] }, { actorType: 'guardian' }, { settings: { addons: { credentialing: false } } }]) {
    const d = fixture(); await expect(credentialingActor({ ...ctx, ...changed }, d)).rejects.toMatchObject({ status: 403 }); expect(d.pool.execute).not.toHaveBeenCalled();
  }
});
it('accepts an active EHR-only identity without granting a full-platform role or another agency', async () => {
  const result = await credentialingActor(ctx, fixture()); expect(result.user.role).toBe('provider');
  expect(await canAccessCredentialing(result.user, 1)).toBe(true); expect(await canAccessCredentialing(result.user, 2)).toBe(false);
  expect(credentialingProductAgency({ ...result.user })).toBe(null);
});
it('rejects disconnected staff and cannot mint a grant from JSON properties', async () => {
  const d = fixture(); d.staffIdentity.mockResolvedValue({ active: false, userId: 7 }); await expect(credentialingActor(ctx, d)).rejects.toMatchObject({ status: 403 });
  expect(await canAccessCredentialing({ id: 7, role: 'provider', credentialingProductAgency: 1 }, 1)).toBe(false);
  const actor = createCredentialingActor({ id: 7, role: 'provider' }, 1); expect(Object.isFrozen(actor)).toBe(true);
});
it('never treats billing, clinical or supervision permissions as credentialing access', async () => {
  for (const permission of ['billing','clinical','supervise']) await expect(credentialingActor({ ...ctx, permissions: [permission] }, fixture())).rejects.toMatchObject({ status: 403 });
});
it('requires explicit supervision activation for staff and denies patient access even with a copied setting', () => {
  expect(() => requireAddon({ ...ctx, settings: { addons: {} } }, 'supervision')).toThrow();
  expect(() => requireAddon({ ...ctx, actorType: 'patient' }, 'supervision')).toThrow();
  expect(() => requireAddon(ctx, 'supervision')).not.toThrow();
});

it('keeps fee-schedule billing access separate from credentialing until both product permissions are authenticated', async () => {
  const actor = createAuricwellBillingActor({ id: 7, role: 'super_admin' }, 1);
  expect(await canAccessCredentialing(actor, 1)).toBe(false);
  grantCredentialingActor(actor, 1);
  expect(await canAccessCredentialing(actor, 1)).toBe(true);
  expect(await canAccessCredentialing(actor, 2)).toBe(false);
});

it('reuses active EHR-only identities for supervision without changing their canonical role', async () => {
  const result = await supervisionActor({ ...ctx, permissions: ['supervise'] }, fixture());
  expect(result).toMatchObject({ agencyId: 1, canManage: true, admin: false, user: { id: 7, role: 'provider', status: 'EHR_ONLY' } });
  const clinical = await supervisionActor({ ...ctx, permissions: ['clinical'] }, fixture()); expect(clinical.canManage).toBe(false);
  for (const changed of [{ permissions: ['billing'] }, { actorType: 'patient' }, { settings: { addons: {} } }]) {
    const d = fixture(); await expect(supervisionActor({ ...ctx, ...changed }, d)).rejects.toMatchObject({ status: 403 }); expect(d.pool.execute).not.toHaveBeenCalled();
  }
});

it('honors the current company access override and does not extend it into another company', async () => {
  const actor = { id: 7, role: 'admin', agencyAccess: { agencyId: 1, permissions: { can_manage_credentialing: false } } };
  expect(await canAccessCredentialing(actor, 1)).toBe(false);
  actor.agencyAccess.permissions.can_manage_credentialing = true;
  expect(await canAccessCredentialing(actor, 1)).toBe(true);
  expect(await canAccessCredentialing(actor, 2)).toBe(false);
});
