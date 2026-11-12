import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../models/Agency.model.js', () => ({ default: {} }));
vi.mock('../../models/Client.model.js', () => ({ default: {} }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: {} }));
vi.mock('../tenantMessageMailboxes.service.js', () => ({ inferAgencyMailDomain: vi.fn(async () => 'example.test'), ensureTenantNotificationsMailbox: vi.fn() }));
vi.mock('../portalGroupSender.service.js', () => ({ ensurePortalGroupSender: vi.fn() }));
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn() }));
vi.mock('../clientPortalContext.service.js', () => ({
  resolveClientPortalContext: vi.fn(async () => ({ tenant: { id: 450, name: 'Fictional mixed agency', slug: 'qa', feature_flags: { medicalBillingEnabled: true, schoolPortalEnabled: true } }, clinical: true, learning: false, portal: { slug: 'qa' } })),
  clientPortalAppUrl: vi.fn(() => 'https://auricwell.com/qa/guardian')
}));
import { clientEmailContext } from '../clientPortalEmail.service.js';
import { renderPortalEmail } from '../portalEmailBranding.service.js';
import { buildSecureMessageEmail } from '../clientPortalEmailContent.js';
beforeEach(() => vi.clearAllMocks());
it.each([['school', true], ['clinical', false], ['office', false]])('uses the recipient client type %s for school coordination attribution', async (clientType, school) => {
  const context = await clientEmailContext({ agencyId: 450, client: { id: 42, agency_id: 450, client_type: clientType } });
  const html = renderPortalEmail({ brand: context.brand, ...buildSecureMessageEmail({ agencyName: context.tenant.name, url: 'https://auricwell.com/secure-message/fictional' }) });
  expect(html.includes('School coordination through SchoolCareBridge')).toBe(school);
  expect(html).toContain('read-secure-message-button.png');
});
