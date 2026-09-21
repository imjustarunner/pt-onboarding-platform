import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PDFDocument, PDFName } from 'pdf-lib';
const m = vi.hoisted(() => ({ submission: vi.fn(), link: vi.fn(), execute: vi.fn(), read: vi.fn(), convert: vi.fn(), user: vi.fn(), job: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findById: m.submission } }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findById: m.link } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: m.user } }));
vi.mock('../../models/HiringJobDescription.model.js', () => ({ default: { findById: m.job } }));
vi.mock('../storage.service.js', () => ({ default: { readObject: m.read } }));
vi.mock('../documentSigning.service.js', () => ({ default: { convertHTMLToPDF: m.convert } }));
import { applicationSnapshot, enrichApplicationRecord, viewApplicationDocument, appendApplicationJobDescription, applicationDocumentUrl } from '../jobApplicationRecord.service.js';
import { buildCompletedIntakeRecord } from '../completedIntakeRecord.service.js';
import { buildIntakeSummaryDocumentHtml, generateIntakeSummaryPdf } from '../intakeSummaryPdf.service.js';
const signature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const agency = { id: 2, slug: 'itsco', name: 'ITSCO' };
const link = { id: 3, form_type: 'job_application', organization_id: 2 };
const record = () => applicationSnapshot({ applicant: { firstName: 'Jordan', lastName: 'Applicant', email: 'jordan@example.org', phone: '555-555-0100' }, job: { id: 7, title: 'Counselor', description_sections_json: { aboutTheRole: 'Support students. '.repeat(350), qualifications: ['Counseling experience'] } }, documents: [{ id: 9, title: 'Resume', name: 'Jordan.pdf' }, { id: 10, title: 'Cover letter', name: 'Letter.pdf' }], signature, submittedAt: '2026-09-19T17:00:00Z' });
const submission = () => ({ id: 4, intake_link_id: 3, guardian_user_id: 8, registration_receipt_token: 'a'.repeat(64), status: 'submitted', intake_data: { applicationRecord: record() } });
const response = () => { const res = { sendStatus: vi.fn(), set: vi.fn(), send: vi.fn() }; res.set.mockReturnValue(res); return res; };
beforeEach(() => { vi.clearAllMocks(); m.submission.mockResolvedValue(submission()); m.link.mockResolvedValue(link); m.execute.mockResolvedValue([[{ id: 9, user_id: 8, storage_path: 'admin_docs/application-8-test.pdf', original_name: 'Jordan.pdf', mime_type: 'application/pdf' }]]); m.read.mockResolvedValue(Buffer.from('%PDF-document')); });
describe('complete application receipt', () => {
  it('recovers old applicant details and signatures without presenting today’s job text as the original', async () => {
    const sub = { ...submission(), submitted_at: '2026-09-19 17:00:00', intake_data: { referenceReleaseSignature: signature } };
    m.user.mockResolvedValue({ first_name: 'Jordan', last_name: 'Applicant', email: 'jordan@example.org' });
    m.job.mockResolvedValue({ id: 7, agency_id: 2, title: 'Counselor', description_text: 'Current job description' });
    const enriched = await enrichApplicationRecord(sub, { ...link, job_description_id: 7 }, agency);
    const html = buildIntakeSummaryDocumentHtml(buildCompletedIntakeRecord({ agency, link, submission: enriched }));
    expect(html).toContain('Jordan Applicant'); expect(html).toContain(signature);
    expect(html).toContain('original version was not retained');
    expect(sub.intake_data.applicationRecord).toBeUndefined();
    expect(m.execute.mock.calls.some(([sql]) => sql.includes('UPDATE'))).toBe(false);
  });
  it('uses a root API URL even for tenants with a path-based portal', () => {
    expect(new URL(applicationDocumentUrl({ slug: 'example-tenant' }, submission(), 9)).pathname).toBe('/api/public-intake/application-documents/4/9');
  });
  it('appends the retained original when the job description was a PDF file', async () => {
    const receipt = await PDFDocument.create(); receipt.addPage();
    const job = await PDFDocument.create(); job.addPage(); job.addPage();
    m.read.mockResolvedValue(Buffer.from(await job.save()));
    m.execute.mockResolvedValue([[{ storage_path: 'admin_docs/application-8-job.pdf', mime_type: 'application/pdf' }]]);
    const sub = submission(); sub.intake_data.applicationRecord.documents.push({ id: 12, kind: 'job_description' });
    const result = await appendApplicationJobDescription(await receipt.save(), sub);
    expect((await PDFDocument.load(result)).getPageCount()).toBe(3);
    expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('user_id = ?'), [12, 8]);
  });
  it('includes applicant identity, applied job text, actual signature, and protected file links', async () => {
    const enriched = await enrichApplicationRecord(submission(), link, agency);
    const spec = buildCompletedIntakeRecord({ agency, link, submission: enriched });
    const html = buildIntakeSummaryDocumentHtml(spec);
    for (const value of ['Jordan Applicant', 'jordan@example.org', 'Counselor', 'Counseling experience', 'Jordan.pdf', 'Letter.pdf', signature]) expect(html).toContain(value);
    expect(html).toContain('/api/public-intake/application-documents/4/9?token=');
    expect(spec.sections.find(s => s.title === 'Job description at application').rows.find(r => r.label === 'About the role').value.length).toBeGreaterThan(4000);
    expect(m.user).not.toHaveBeenCalled();
  });
  it('keeps links, signatures and all pages when the browser PDF renderer is unavailable', async () => {
    m.convert.mockRejectedValue(Object.assign(new Error('offline'), { code: 'PDF_RENDERER_UNAVAILABLE' }));
    const spec = buildCompletedIntakeRecord({ agency, link, submission: await enrichApplicationRecord(submission(), link, agency) });
    const pdf = await PDFDocument.load(await generateIntakeSummaryPdf(spec));
    expect(pdf.getPageCount()).toBeGreaterThan(1);
    const annotations = pdf.getPages().flatMap(p => p.node.Annots()?.asArray() || []);
    expect(annotations).toHaveLength(2);
    const action = pdf.context.lookup(annotations[0]).lookup(PDFName.of('A'));
    expect(action.lookup(PDFName.of('URI')).decodeText()).toContain('application-documents/4/9?token=');
    expect(pdf.getPages().some(p => p.node.Resources()?.lookup(PDFName.of('XObject'))?.keys().length)).toBe(true);
  });
  it('rejects wrong receipt tokens and documents outside the saved submission', async () => {
    for (const [token, docId] of [['wrong', '9'], ['a'.repeat(64), '11']]) {
      const res = response(); await viewApplicationDocument({ params: { submissionId: '4', docId }, query: { token } }, res, e => { throw e; });
      expect(res.sendStatus).toHaveBeenCalledWith(404);
    }
    expect(m.read).not.toHaveBeenCalled();
  });
  it('serves only an owned document and does not expose storage paths', async () => {
    const res = response(); await viewApplicationDocument({ params: { submissionId: '4', docId: '9' }, query: { token: 'a'.repeat(64) } }, res, e => { throw e; });
    expect(m.execute).toHaveBeenCalledWith(expect.stringContaining('id = ? AND user_id = ?'), [9, 8]);
    expect(res.send).toHaveBeenCalledWith(Buffer.from('%PDF-document'));
    expect(res.set).toHaveBeenCalledWith(expect.objectContaining({ 'Cache-Control': 'private, no-store' }));
  });
});
