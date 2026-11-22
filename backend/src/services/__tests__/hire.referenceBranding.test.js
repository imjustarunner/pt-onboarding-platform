import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db }));
vi.mock('../agencySocialLinks.service.js', () => ({
  listSignatureSocialLinks: async () => [],
  getAgencySignatureTagline: async () => null,
  platformLabel: value => value
}));
import { brandedReferenceEmail, referenceEmailFrame, referenceEmployerBrand } from '../hiringReferenceEmail.service.js';
import { resolveDepartmentSignatureContext, buildStaffSignatureHtml } from '../staffHtmlEmailSignature.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PUBLIC_APP_URL', 'https://plotlinepo.com');
  vi.stubEnv('BACKEND_PUBLIC_URL', '');
  vi.stubEnv('BACKEND_URL', '');
});
afterEach(() => vi.unstubAllEnvs());

it('keeps Plotline prominent and includes the employer logo, name and selected colors in invitations and receipts', () => {
  const agency = { name: 'ITSCO', slug: 'itsco', color_palette: '{"primary":"#16457c"}' };
  const messages = [
    referenceEmailFrame({ agency, heading: 'Thank you for submitting a reference', body: '<p>Fictional example.</p>' }),
    brandedReferenceEmail({ agency, candidateName: 'QA Applicant', referenceName: 'QA Referee', url: 'https://plotlinepo.com/reference/example', deadline: '2026-12-01' })
  ];
  for (const html of messages) {
    expect(html).toContain('plotline-primary-transparent.png');
    expect(html).toContain('A People Operations Platform');
    expect(html).toContain('https://itsco.health/assets/plotline/careers/itsco-logo.png');
    expect(html).toContain('ITSCO</div>');
    expect(html).toContain('PEOPLE OPERATIONS');
    expect(html).toContain('#16457c');
    expect(html.indexOf('plotline-primary-transparent.png')).toBeLessThan(html.indexOf('itsco-logo.png'));
  }
});

it('uses each company’s public logo route and careers color without copying ITSCO branding', () => {
  const agency = { name: 'Juniper QA', logo_path: 'plotline/logos/juniper.webp', careers_page_json: '{"accentColor":"#a84263"}' };
  const html = referenceEmailFrame({ agency, heading: 'Reference received', body: '' });
  expect(html).toContain('https://plotlinepo.com/api/plotline/logos/juniper.webp');
  expect(html).toContain('#a84263');
  expect(html).not.toContain('itsco-logo.png');
  expect(html).toContain('Want to use Plotline for your organization?');
});

it('omits unsafe employer logo URLs and ignores invalid color values', () => {
  expect(referenceEmployerBrand({ logo_url: 'javascript:alert(1)', primary_color: 'red;bad' })).toEqual({ color: '#176b53', logoUrl: null });
  expect(referenceEmployerBrand({ logo_url: 'http://example.test/insecure.png' }).logoUrl).toBeNull();
});

it('renders publicly reachable signature marks and contact icons when an upload base is absent', async () => {
  db.execute.mockResolvedValue([[{ id: 463, name: 'Juniper QA', slug: 'juniper-qa', logo_url: 'https://example.test/juniper.png' }]]);
  const context = await resolveDepartmentSignatureContext({ agencyId: 463, identity: { identity_key: 'hiring_references', display_name: 'Plotline References', from_email: 'references@plotlinepo.com' } });
  expect(context.assets.phoenix).toBe('https://plotlinepo.com/email-signatures/staff-html/plottwistco-mark.png?v=6');
  const html = buildStaffSignatureHtml(context);
  const imageUrls = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map(match => match[1]);
  expect(imageUrls.length).toBeGreaterThan(1);
  expect(imageUrls.every(url => url.startsWith('https://'))).toBe(true);
  expect(html).toContain(context.assets.phoenix);
});

it('retains configured HTTPS upload assets in signatures', async () => {
  vi.stubEnv('BACKEND_PUBLIC_URL', 'https://api.example.test');
  db.execute.mockResolvedValue([[{ id: 463, name: 'Juniper QA' }]]);
  const context = await resolveDepartmentSignatureContext({ agencyId: 463 });
  expect(context.assets.phoenix).toBe('https://api.example.test/uploads/logos/plottwistco-email-mark.png');
});
