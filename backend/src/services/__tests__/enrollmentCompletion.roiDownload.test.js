import { describe, it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ direct: vi.fn(), issued: vi.fn(), link: vi.fn(), session: vi.fn(), agency: vi.fn(), read: vi.fn() }));
vi.mock('../../models/IntakeLink.model.js', () => ({ default: { findByPublicKey: m.direct, findById: m.link } }));
vi.mock('../../models/ClientSchoolRoiSigningLink.model.js', () => ({ default: { findByPublicKey: m.issued } }));
vi.mock('../../models/IntakeSubmission.model.js', () => ({ default: { findBySessionToken: m.session } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: m.agency } }));
vi.mock('../storage.service.js', () => ({ default: { readObject: m.read } }));
import { downloadPublicIntakeSummaryPdf, viewPublicIntakeSummaryHtml } from '../../controllers/intakeSummaryPdf.controller.js';
const request = () => ({ params: { publicKey: 'issued-key', submissionId: '10' }, query: { sessionToken: 'session' }, body: {} });
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn(), setHeader: vi.fn(), send: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();
  m.direct.mockResolvedValue(null);
  m.issued.mockResolvedValue({ intake_link_id: 4, latest_intake_submission_id: 10, client_id: 7, status: 'completed' });
  m.link.mockResolvedValue({ id: 4, organization_id: 2, form_type: 'smart_school_roi' });
  m.session.mockResolvedValue({ id: 10, intake_link_id: 4, client_id: 7, status: 'submitted', combined_pdf_path: 'private/signed.pdf' });
  m.agency.mockResolvedValue({ id: 2, name: 'Test agency' });
  m.read.mockResolvedValue(Buffer.from('%PDF-original-signed-release'));
});
describe('issued ROI completion downloads', () => {
  it.each([downloadPublicIntakeSummaryPdf, viewPublicIntakeSummaryHtml])('serves the original signed PDF after matching the session, client and issued link', async handler => {
    const res = response(), next = vi.fn(); await handler(request(), res, next);
    expect(next).not.toHaveBeenCalled(); expect(m.read).toHaveBeenCalledWith('private/signed.pdf');
    expect(res.send).toHaveBeenCalledWith(Buffer.from('%PDF-original-signed-release'));
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, no-store');
    expect(res.setHeader).toHaveBeenCalledWith('Content-Disposition', expect.stringContaining('release-of-information-10.pdf'));
  });
  it.each([{ client_id: 8 }, { latest_intake_submission_id: 11 }, { intake_link_id: 5 }, { status: 'issued' }])('rejects mismatched or incomplete issued-link scope %j', async mismatch => {
    m.issued.mockResolvedValue({ intake_link_id: 4, latest_intake_submission_id: 10, client_id: 7, status: 'completed', ...mismatch });
    if (mismatch.intake_link_id) m.link.mockResolvedValue({ id: 5, form_type: 'smart_school_roi' });
    const res = response(); await downloadPublicIntakeSummaryPdf(request(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(404); expect(m.read).not.toHaveBeenCalled();
  });
  it('rejects a different session or missing token', async () => {
    m.session.mockResolvedValue({ id: 11 }); const res = response();
    await viewPublicIntakeSummaryHtml(request(), res, vi.fn()); expect(res.status).toHaveBeenCalledWith(404);
    const req = request(); req.query = {}; await downloadPublicIntakeSummaryPdf(req, res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(400); expect(m.read).not.toHaveBeenCalled();
  });
});
