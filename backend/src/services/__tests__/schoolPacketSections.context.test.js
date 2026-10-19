import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), template: vi.fn(), agency: vi.fn(), school: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/OfficePacketTemplate.model.js', () => ({ default: { findByAgencyId: mocks.template } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: mocks.agency } }));
vi.mock('../enrollmentAgencyAccess.service.js', () => ({ assertEnrollmentAgencyMembership: vi.fn() }));
vi.mock('../schoolPrintablePacket.service.js', () => ({ buildSchoolPrintablePacketContext: mocks.school }));
import { buildPacketSectionContext, hashPacketSectionHtml } from '../schoolPacketSections.service.js';
beforeEach(() => {
  vi.resetAllMocks(); mocks.execute.mockResolvedValue([[]]); mocks.template.mockResolvedValue(null);
  mocks.agency.mockResolvedValue({ id: 2, name: 'Example Agency' });
});
it.each(['parent', 'self'].flatMap(variant => ['en', 'es'].flatMap(locale => ['informed_group_consent', 'policy_services', 'hipaa_notice'].map(sectionKey => ({ variant, locale, sectionKey })))))('renders office $variant $locale $sectionKey with source validation before roster substitution', async input => {
  const context = await buildPacketSectionContext({ agencyId: 2, office: true, ...input });
  expect(context.html.length).toBeGreaterThan(100);
  expect(context.contentHash).toBe(hashPacketSectionHtml(context.html));
  expect(context.html).not.toContain('{{DISCLOSURE_CARE_TEAM}}');
});
it('applies the published guardian consent revision before rendering', async () => {
  mocks.execute.mockResolvedValue([[{ document_key: 'informed-consent', content_html: '<p>Approved agency revision</p>', version: 3 }]]);
  const context = await buildPacketSectionContext({ agencyId: 2, office: true, variant: 'parent', sectionKey: 'informed_group_consent' });
  expect(context.html).toContain('Approved agency revision');
  expect(mocks.execute.mock.calls[0][1]).toEqual([2, 'office', 'en', 'guardian']);
});
it('still rejects an actually broken source with no provider roster marker', async () => {
  mocks.template.mockResolvedValue({ html_content: '<h2>INFORMED CONSENT</h2><p>Terms</p><h2>MENTAL HEALTH PROFESSIONAL INFORMATION</h2><p>Stale roster</p>' });
  await expect(buildPacketSectionContext({ agencyId: 2, office: true, sectionKey: 'informed_group_consent' })).rejects.toMatchObject({ status: 409 });
});
it('keeps the school consent and group consent together without adding a provider selector', async () => {
  mocks.school.mockResolvedValue({ agencyId: 2, documents: [
    { key: 'informed-consent', html: '<h2>INFORMED CONSENT</h2><p>School terms</p>' },
    { key: 'group-consent', html: '<h2>GROUP CONSENT</h2><p>Group terms</p>' },
    { key: 'disclosure', html: '<h2>MENTAL HEALTH PROFESSIONAL INFORMATION</h2><p>Generated roster</p>' }
  ] });
  const context = await buildPacketSectionContext({ agencyId: 2, organizationId: 3, sectionKey: 'informed_group_consent' });
  expect(context.html).toContain('School terms'); expect(context.html).toContain('Group terms');
  expect(context.html).not.toContain('Generated roster');
});
