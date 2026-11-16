import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), disclosure: vi.fn(), grant: vi.fn(), read: vi.fn(), ocr: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/ClientPhiDocument.model.js', () => ({ default: {} }));
vi.mock('../../models/ClientSchoolStaffRoiAccess.model.js', () => ({ default: { setAccessState: m.grant } }));
vi.mock('../paperPacketBytes.service.js', () => ({ paperPacketBytes: m.read }));
vi.mock('../referralOcr.service.js', () => ({ default: { getPdfPageCount: async () => 6, extractPdfWithVision: m.ocr } }));
vi.mock('../schoolPrintablePacketCache.service.js', () => ({ findSchoolPacketVersionByLabel: async () => ({ id: 70, version_label: '1.02', staff_json: [{ schoolStaffUserId: 99, fullName: 'Synthetic Staff' }] }) }));
vi.mock('../paperPacketDisclosure.service.js', () => ({ recordPaperPacketDisclosure: m.disclosure }));
vi.mock('../paperPacketDemographics.service.js', () => ({ applyPaperPacketDemographicsFromText: async () => ({ filled: [] }) }));
import { evaluateAndApplyPaperPacketVision } from '../paperPacketVision.service.js';

beforeEach(() => {
  vi.clearAllMocks();
  m.read.mockResolvedValue({ buffer: Buffer.from('synthetic PDF'), doc: { id: 9, uploaded_at: '2026-11-16' } });
  m.ocr.mockResolvedValue('Packet version: 1.02\nAuthorized School Staff\nSign here — required\nDate 11/03/2026\nAcknowledgement and consent summary\nSign here — required\nDate 11/03/2026');
  m.execute.mockImplementation(async sql => sql.includes('information_schema.tables') ? [[{ cnt: 1 }]] : sql.startsWith('SELECT onboarding_docs_json') ? [[{ onboarding_docs_json: {} }]] : [{ insertId: 11 }]);
});

it('keeps fully matched dated OCR pending on legacy packets and never records consent or grants staff ROI', async () => {
  const result = await evaluateAndApplyPaperPacketVision({ clientId: 4, schoolOrganizationId: 3, phiDocumentId: 9, storagePath: 'private/source.pdf', actorUserId: 8 });
  expect(result).toMatchObject({ status: 'needs_review', detectedVersionLabel: '1.02', matchedVersionId: 70, evalId: 11 });
  expect(result.reviewReasons).toContain('human_source_review_required');
  const evaluation = m.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO client_paper_packet_vision_evals'));
  expect(JSON.parse(evaluation[1][11])).toMatchObject({ matchedEvidence: true, reviewHints: { locale: 'en', roi: { signedDate: '2026-11-03' }, disclosure: { signedDate: '2026-11-03' } } });
  expect(m.disclosure).not.toHaveBeenCalled(); expect(m.grant).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.some(([sql]) => /UPDATE clients|INSERT INTO client_school_staff_roi_access|UPDATE client_paper_packet_vision_evals/.test(sql))).toBe(false);
});
