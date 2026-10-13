import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ find: vi.fn(), update: vi.fn(), artifact: vi.fn(), finalize: vi.fn() }));
vi.mock('../../models/HiringInterview.model.js', () => ({ default: { findById: m.find, updateById: m.update } }));
vi.mock('../../models/HiringInterviewArtifact.model.js', () => ({ default: { findByInterviewId: m.artifact, finalizeCurrent: m.finalize } }));
vi.mock('../../models/InterviewHubTemplate.model.js', () => ({ default: {} }));
import { finalizeInterview } from '../interviewHub.service.js';
beforeEach(() => { vi.clearAllMocks(); m.artifact.mockResolvedValue({ scorecard_json: { communication: 4 } }); m.finalize.mockResolvedValue({ finalized_at: new Date(), average_score: 4 }); });
describe('scorecard finalization is independent of live meeting access', () => {
  it.each(['scheduled', 'in_progress', 'completed'])('preserves the %s interview status and guest access', async status => {
    const interview = { id: 5, status, candidate_user_id: 30, guest_access_ended_at: null };
    m.find.mockResolvedValue(interview);
    const result = await finalizeInterview(5, { transcriptSummary: 'Interview notes' });
    expect(result.interview).toEqual(interview);
    expect(m.update).not.toHaveBeenCalled();
    expect(m.finalize).toHaveBeenCalledWith(5, expect.objectContaining({ finalizedAt: expect.any(Date), transcriptSummary: 'Interview notes' }), expect.any(Function));
  });
});
