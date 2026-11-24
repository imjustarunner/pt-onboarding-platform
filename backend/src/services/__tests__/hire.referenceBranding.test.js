import { beforeEach, afterEach, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: db, onTableWrite:vi.fn() }));
vi.mock('../agencySocialLinks.service.js', () => ({
  listSignatureSocialLinks: async () => [],
  getAgencySignatureTagline: async () => null,
  platformLabel: value => value
}));
import { brandedReferenceEmail, referenceEmailFrame, referenceEmployerBrand, referenceRequestsSentEmail } from '../hiringReferenceEmail.service.js';
import { buildPeopleOpsContactFooter } from '../hiringReferenceRequests.service.js';
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
    brandedReferenceEmail({ agency, candidateName: 'QA Applicant', referenceName: 'QA Referee', url: 'https://plotlinepo.com/reference/example', deadline: '2026-12-01' }),
    brandedReferenceEmail({ agency, candidateName: 'QA Applicant', referenceName: 'QA Referee', url: 'https://plotlinepo.com/reference/example', deadline: '2026-12-01', reminder:true }),
    referenceRequestsSentEmail({ agency, candidateName:'QA Applicant', references:[{name:'QA Referee',email:'referee@example.test'}] })
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

it('uses a real mail link instead of the organization-name fallback in the contact sentence', () => {
  const contact = buildPeopleOpsContactFooter({name:'Juniper Consulting QA'}, {replyTo:'testing@itsco.health'});
  expect(contact.html).toContain('href="mailto:testing@itsco.health"');
  expect(contact.html).toContain('Contact People Operations');
  expect(contact.text).toContain('testing@itsco.health');
  expect(contact.html.match(/Juniper Consulting QA/g)).toHaveLength(1);
  expect(contact.html).not.toContain('please contact Juniper');
  expect(contact.teamLabel).toBe('People Operations');
});

it('honors the selected reply route and configured team label and makes phone contact clickable', () => {
  const contact = buildPeopleOpsContactFooter({name:'ITSCO',terminology_settings:{peopleOpsTerm:'People & Culture'},people_ops_email:'old@example.test',phone_number:'(719) 555-0100',phone_extension:'12'}, {replyTo:'po@itsco.health'});
  expect(contact.html).toContain('href="mailto:po@itsco.health"');
  expect(contact.html).toContain('Contact People &amp; Culture');
  expect(contact.html).toContain('href="tel:7195550100;ext=12"');
  expect(contact.html).not.toContain('old@example.test');
});

it('never invents an address or renders placeholder/unsafe contact links', () => {
  for (const email of ['', '___@___', 'javascript:alert(1)', 'references@plotlinepo.com']) {
    const contact = buildPeopleOpsContactFooter({name:'Agency <X>',people_ops_email:email});
    expect(contact.html).toContain('Reply to this email to reach the hiring team.');
    expect(contact.html).not.toContain('href="mailto:');
    expect(contact.html).toContain('Agency &lt;X&gt;');
    expect(contact.text).not.toMatch(/undefined|___|javascript:/);
  }
});

it('brands the request-sent notice and escapes applicant/referee data without changing company identity', () => {
  const html = referenceRequestsSentEmail({agency:{name:'Juniper QA',logo_url:'https://example.test/juniper.png'},candidateName:'Applicant <QA>',references:[{name:'Referee <QA>',email:'referee@example.test'}]});
  expect(html).toContain('Reference requests sent');expect(html).toContain('Applicant &lt;QA&gt;');expect(html).toContain('Referee &lt;QA&gt;');
  expect(html).toContain('juniper.png');expect(html).not.toContain('itsco-logo.png');
  expect(html).toContain('Their answers and ratings remain private.');
  expect(html).toContain('Want to use Plotline for your organization?');
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


it('shows date-only deadlines and a small footer logo in both requests and reminders',()=>{
 for(const reminder of[false,true]){
  const html=brandedReferenceEmail({agency:{name:'ITSCO'},candidateName:'QA Applicant',url:'https://example.test',deadline:'2026-12-01T00:15:00Z',reminder});
  expect(html).toContain('Please complete by December 1, 2026.');expect(html).not.toContain('(UTC)');expect(html).toContain('width="96" alt="Plotline"');
 }
});
it('separates platform support from employer PO and never shares a referee token in generic applicant notices',()=>{
 const token='a'.repeat(64),agency={name:'ITSCO',slug:'itsco'};
 const referee=buildPeopleOpsContactFooter(agency,{replyTo:'po@itsco.health',referenceToken:token});
 expect(referee.html).toContain(`https://plotlinepo.com/public/hiring/reference/${token}/support`);expect(referee.html).toContain('Contact Plotline Support');expect(referee.html).toContain('Operated by PlotTwistCo');expect(referee.email).toBe('po@itsco.health');expect(referee.html).toContain('mailto:po@itsco.health');
 const applicant=buildPeopleOpsContactFooter(agency,{replyTo:'po@itsco.health'});expect(applicant.supportUrl).toBe('https://plotlinepo.com/support');expect(applicant.html).not.toContain(token);
});
