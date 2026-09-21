import { describe, it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({ update: vi.fn(), report: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: {} }));
vi.mock('../../models/HiringResumeParse.model.js', () => ({ default: { updateExtractedJsonByResumeDocId: m.update } }));
vi.mock('../../models/HiringResearchReport.model.js', () => ({ default: { findLatestAiByCandidateUserId: m.report } }));
vi.mock('../resumeStructuring.service.js', () => ({ generateResumeSummaryJson: vi.fn() }));
vi.mock('../hiringCandidatePreScreen.service.js', () => ({ prepareCandidatePreScreen: vi.fn() }));
import { processCandidatePreparation } from '../hiringCandidatePreparation.service.js';
beforeEach(() => { vi.clearAllMocks(); m.report.mockResolvedValue(null); });
function fixture(extracted_json = null, acquired = 1) {
  const row = { candidate_user_id: 30, resume_doc_id: 173, agency_id: 2, first_name: 'Jordan', last_name: 'Applicant', extracted_text: 'Counseling experience', extracted_json };
  const conn = { execute: vi.fn().mockResolvedValueOnce([[{ acquired }]]).mockResolvedValueOnce([[row]]).mockResolvedValue([[]]), release: vi.fn() };
  const summarize = vi.fn().mockResolvedValue({ summary: { skills: ['Counseling'] }, modelId: 'test' });
  const prescreen = vi.fn().mockResolvedValue({ id: 1 });
  return { conn, summarize, prescreen, db: { getConnection: async () => conn } };
}
describe('background candidate preparation', () => {
  it('prepares summary and pre-screen before staff opens the candidate', async () => {
    const f = fixture(); await processCandidatePreparation(f);
    expect(f.summarize).toHaveBeenCalledWith({ candidateName: 'Jordan Applicant', resumeText: 'Counseling experience' });
    expect(f.prescreen).toHaveBeenCalledWith({ candidateUserId: 30, agencyId: 2 });
    expect(m.update.mock.calls.at(-1)[1].preparation.state).toBe('complete');
    expect(f.conn.release).toHaveBeenCalledOnce();
  });
  it('preserves existing good summaries and pre-screens', async () => {
    const f = fixture({ summary: { skills: ['Existing'] } }); m.report.mockResolvedValue({ status: 'completed', created_at: new Date() });
    await processCandidatePreparation(f);
    expect(f.summarize).not.toHaveBeenCalled(); expect(f.prescreen).not.toHaveBeenCalled();
    expect(m.update.mock.calls.at(-1)[1].summary.skills).toEqual(['Existing']);
  });
  it('retains retry state after failure and avoids duplicate workers', async () => {
    const f = fixture(); f.summarize.mockRejectedValue(new Error('unavailable')); await processCandidatePreparation(f);
    expect(m.update.mock.calls.at(-1)[1].preparation).toMatchObject({ state: 'retry', attempts: 1 });
    const busy = fixture(null, 0); await processCandidatePreparation(busy); expect(busy.summarize).not.toHaveBeenCalled(); expect(busy.conn.release).toHaveBeenCalledOnce();
  });
});
