import { beforeEach, expect, it, vi } from 'vitest';
import { PDFDocument } from 'pdf-lib';

vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../documentSigning.service.js', () => ({ default: { convertHTMLToPDF: vi.fn() } }));
vi.mock('../enrollmentPacket.service.js', () => ({
  buildEnrollmentPacketContext: vi.fn(() => { throw new Error('School packets must use their saved template'); }),
  generateEnrollmentPacketPdfFromContext: vi.fn(() => { throw new Error('School packets must use their original renderer'); })
}));
vi.mock('../smartDisclosure.service.js', () => ({
  listDisclosureProviders: vi.fn(),
  isDemoPacketIdentity: () => false,
  formatSupervisorTypeLabel: value => value
}));
vi.mock('../packetBrandChrome.service.js', () => ({ resolvePacketBrandChrome: vi.fn() }));

import Agency from '../../models/Agency.model.js';
import AgencySchool from '../../models/AgencySchool.model.js';
import OrganizationAffiliation from '../../models/OrganizationAffiliation.model.js';
import ClientSchoolStaffRoiAccess from '../../models/ClientSchoolStaffRoiAccess.model.js';
import SchoolPacketTemplate, { defaultHtmlForLocale } from '../../models/SchoolPacketTemplate.model.js';
import DocumentSigningService from '../documentSigning.service.js';
import { listDisclosureProviders } from '../smartDisclosure.service.js';
import { resolvePacketBrandChrome } from '../packetBrandChrome.service.js';
import { buildEnrollmentPacketContext, generateEnrollmentPacketPdfFromContext } from '../enrollmentPacket.service.js';
import {
  buildSchoolPrintablePacketContext,
  buildSchoolPrintablePacketHtml,
  generateSchoolPrintablePacketPdf,
  saveSchoolPacketTemplateForOrganization,
  schoolPrintablePacketContentHash
} from '../schoolPrintablePacket.service.js';

const school = { id: 40, name: 'Example School', slug: 'example-school', organization_type: 'school', street_address: '123 Example St' };
const agency = { id: 2, name: 'Example Agency', organization_type: 'agency' };
const staff = [{ school_staff_user_id: 7, first_name: 'School', last_name: 'Contact', role_title: 'Counselor' }];
const providers = [{ id: 8, fullName: 'Current Provider', schoolAssigned: true, credential: 'LPC' }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Agency, 'findById').mockImplementation(async id => Number(id) === 40 ? school : Number(id) === 2 ? agency : null);
  vi.spyOn(OrganizationAffiliation, 'getActiveAgencyIdForOrganization').mockResolvedValue(2);
  vi.spyOn(AgencySchool, 'getActiveAgencyIdForSchool').mockResolvedValue(null);
  vi.spyOn(SchoolPacketTemplate, 'getOrCreateForAgency').mockImplementation(async (_id, { locale }) => ({ version: 7, html_content: defaultHtmlForLocale(locale) }));
  vi.spyOn(SchoolPacketTemplate, 'upsertContent').mockResolvedValue({ version: 8, html_content: '<p>Saved revision</p>', updated_by_user_id: 9, updated_at: '2026-10-22T12:00:00Z' });
  vi.spyOn(ClientSchoolStaffRoiAccess, 'listSchoolStaffRosterForOrganization').mockResolvedValue(staff);
  vi.mocked(listDisclosureProviders).mockResolvedValue(providers);
  vi.mocked(resolvePacketBrandChrome).mockResolvedValue({ versionLabel: '1.15', useItscoChrome: true });
});

it.each(['en', 'es'])('restores the complete saved %s school template with live roster tokens and page breaks', async locale => {
  const context = await buildSchoolPrintablePacketContext({ organizationId: 40, locale });
  expect(SchoolPacketTemplate.getOrCreateForAgency).toHaveBeenCalledWith(2, { locale });
  expect(ClientSchoolStaffRoiAccess.listSchoolStaffRosterForOrganization).toHaveBeenCalledWith({ schoolOrganizationId: 40 });
  expect(listDisclosureProviders).toHaveBeenCalledWith({ agencyId: 2, schoolOrganizationId: 40 });
  expect(resolvePacketBrandChrome).toHaveBeenCalledWith(agency, { packetKind: 'school' });
  expect(context).toMatchObject({ version: 7, locale, agencyId: 2, staffRows: staff, providers, organization: { id: 40, name: school.name, address: school.street_address } });
  expect(context).not.toHaveProperty('documents');
  const html = buildSchoolPrintablePacketHtml(context);
  expect(html).toContain('class="page-break"');
  expect(html).toContain('form-blank');
  expect(html).toContain('School Contact');
  expect(html).toContain('Current Provider');
  expect(html).toContain('Example School');
  expect(html).not.toContain('{{SCHOOL_STAFF_TABLE}}');
  expect(html).not.toContain('{{DISCLOSURE_CARE_TEAM}}');
  expect(html).not.toContain('enrollment-document');
  expect(buildEnrollmentPacketContext).not.toHaveBeenCalled();
});

it('preserves custom school template content and its original layout', async () => {
  const html = '<section><h2>Existing agency wording</h2><div class="page-break"></div><p style="margin: 24px">Custom school questionnaire</p>{{SCHOOL_STAFF_TABLE}}{{DISCLOSURE_CARE_TEAM}}</section>';
  vi.mocked(SchoolPacketTemplate.getOrCreateForAgency).mockResolvedValueOnce({ version: 12, html_content: html });
  const context = await buildSchoolPrintablePacketContext({ organizationId: 40 });
  expect(context.templateHtml).toBe(html);
  expect(buildSchoolPrintablePacketHtml(context)).toContain('<p style="margin: 24px">Custom school questionnaire</p>');
  const unifiedContext = { ...context, templateHtml: `<section class="enrollment-document">${html}</section>` };
  expect(schoolPrintablePacketContentHash(context)).not.toBe(schoolPrintablePacketContentHash(unifiedContext));
});

it('keeps the original default packet available for a school without an affiliated agency', async () => {
  vi.mocked(OrganizationAffiliation.getActiveAgencyIdForOrganization).mockResolvedValueOnce(null);
  const context = await buildSchoolPrintablePacketContext({ organizationId: 40, locale: 'es' });
  expect(context).toMatchObject({ agencyId: null, locale: 'es', version: 1, providers: [], staffRows: staff });
  expect(SchoolPacketTemplate.getOrCreateForAgency).not.toHaveBeenCalled();
  expect(buildSchoolPrintablePacketHtml(context)).toContain('School Contact');
});

it.each(['en', 'es'])('saves and versions the %s school template through the existing model', async locale => {
  const saved = await saveSchoolPacketTemplateForOrganization({ organizationId: 40, htmlContent: '<p>Saved revision</p>', actorUserId: 9, locale });
  expect(SchoolPacketTemplate.upsertContent).toHaveBeenCalledWith({ agencyId: 2, htmlContent: '<p>Saved revision</p>', actorUserId: 9, locale });
  expect(saved).toEqual({ agencyId: 2, locale, html_content: '<p>Saved revision</p>', version: 8, updatedByUserId: 9, updatedAt: '2026-10-22T12:00:00.000Z' });
});

it('rejects a non-school before saving a school packet', async () => {
  await expect(saveSchoolPacketTemplateForOrganization({ organizationId: 2, htmlContent: '<p>Invalid</p>' })).rejects.toMatchObject({ statusCode: 404 });
  expect(SchoolPacketTemplate.upsertContent).not.toHaveBeenCalled();
});

it('prints the original body and prepends the separate full-page school cover', async () => {
  const body = await PDFDocument.create();
  body.addPage([612, 792]);
  vi.mocked(DocumentSigningService.convertHTMLToPDF).mockResolvedValueOnce(Buffer.from(await body.save()));
  const context = await buildSchoolPrintablePacketContext({ organizationId: 40 });
  const pdf = await PDFDocument.load(await generateSchoolPrintablePacketPdf(context));
  expect(pdf.getPageCount()).toBe(2);
  const [html, options] = vi.mocked(DocumentSigningService.convertHTMLToPDF).mock.calls[0];
  expect(html).toContain('packet-body-wrap');
  expect(html).toContain('class="page-break"');
  expect(html).toContain('School Contact');
  expect(options).toMatchObject({ displayHeaderFooter: true, disableFallback: true, margin: { top: '0.75in', bottom: '0.5in' } });
  expect(generateEnrollmentPacketPdfFromContext).not.toHaveBeenCalled();
});
