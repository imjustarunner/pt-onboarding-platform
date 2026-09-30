import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), profile: vi.fn(), facets: vi.fn(), send: vi.fn(), notify: vi.fn(), enabled: vi.fn(), identities: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn().mockResolvedValue({ id: 2, slug: 'itsco' }) } }));
vi.mock('../../models/Notification.model.js', () => ({ default: { create: mocks.notify } }));
vi.mock('../../models/ProviderPublicProfile.model.js', () => ({ default: { getForProvider: mocks.profile } }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { list: mocks.identities } }));
vi.mock('../providerClinicalFacets.service.js', () => ({ listClinicalFacetsForUsers: mocks.facets }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: mocks.send }));
vi.mock('../notificationPreferences.service.js', () => ({ isNotificationChannelEnabled: mocks.enabled }));
import { notifyExchangeMatches } from '../clientExchangeNotifications.service.js';
const listing = { id: 44, agencyId: 2, currentProviderUserId: 9, postedByUserId: 9, demographics: { ageBand: '9' }, preferences: { modality: 'virtual' } };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.execute.mockResolvedValue([[9, 10, 11].map(id => ({ id, role: 'provider', email: `user${id}@example.com`, sees_clients: 1, provider_accepting_new_clients: 1 }))]);
  mocks.profile.mockResolvedValue({ details: { virtualEnabled: true } });
  mocks.facets.mockResolvedValue(new Map([[10, { ageGroups: ['Children (6-10)'] }], [11, { ageGroups: ['Adults (18+)'] }]]));
  mocks.enabled.mockResolvedValue(true);
  mocks.identities.mockResolvedValue([{ id: 77, identity_key: 'notifications', from_email: 'notifications@itsco.health' }]);
  mocks.notify.mockResolvedValue({ id: 1 }); mocks.send.mockResolvedValue({ sent: true });
});
it('sends to every matched provider except current provider, with an agency-scoped private link', async () => {
  const result = await notifyExchangeMatches({ listing, client: { full_name: 'Private Client Name' } });
  expect(result).toEqual({ matched: 1, sent: 1, queued: 0, skipped: 0, failed: 0 });
  expect(mocks.execute.mock.calls[0][1]).toEqual([2]);
  expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 77, to: 'user10@example.com', templateType: 'client_exchange_match', linkUrl: 'https://app.itsco.health/client-exchange?listingId=44&agencyId=2' }));
  expect(JSON.stringify(mocks.send.mock.calls)).not.toContain('Private Client Name');
  expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 10, agencyId: 2, relatedEntityId: 44 }));
});
it('preserves in-app notification when the recipient opts out of email', async () => {
  mocks.enabled.mockResolvedValue(false);
  const result = await notifyExchangeMatches({ listing });
  expect(result.skipped).toBe(1); expect(mocks.send).not.toHaveBeenCalled(); expect(mocks.notify).toHaveBeenCalledTimes(1);
});
it('reports missing sender and held mail rather than claiming delivery', async () => {
  mocks.identities.mockResolvedValue([]);
  expect((await notifyExchangeMatches({ listing })).failed).toBe(1);
  mocks.identities.mockResolvedValue([{ id: 77, identity_key: 'notifications' }]);
  mocks.send.mockResolvedValue({ queued: true });
  const result = await notifyExchangeMatches({ listing }); expect(result.queued).toBe(1); expect(result.sent).toBe(0);
});
it('continues to other matches after one failed email', async () => {
  mocks.facets.mockResolvedValue(new Map([10, 11].map(id => [id, { ageGroups: ['Children (6-10)'] }])));
  mocks.send.mockRejectedValueOnce(new Error('Mail transport unavailable')).mockResolvedValueOnce({ sent: true });
  const result = await notifyExchangeMatches({ listing }); expect(result.failed).toBe(1); expect(result.sent).toBe(1);
});
