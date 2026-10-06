import { describe, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { hasGroupTranscriptionConsent, acceptGroupTranscriptionConsent, groupTranscriptionConsent, isGroupSupervision } from '../groupSupervisionConsent.service.js';
describe('group supervision acknowledgement', () => {
  it('requires an explicit session/user/version acknowledgement', async () => {
    const db = { execute: vi.fn().mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ ok: 1 }]]) };
    expect(await hasGroupTranscriptionConsent(101, 7, db)).toBe(false);
    expect(await hasGroupTranscriptionConsent(101, 7, db)).toBe(true);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('notice_version=?'), [101, 7, '2026-10-06']);
  });
  it('stores acknowledgement idempotently without signing an individual agreement', async () => {
    const db = { execute: vi.fn().mockResolvedValue([{}]) };
    await acceptGroupTranscriptionConsent(101, 7, db);
    expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('ON DUPLICATE KEY'), [101, 7, '2026-10-06']);
  });
  it('holds transcription for unconsented live admitted users and excludes departed/waiting users', async () => {
    const db = { execute: vi.fn().mockResolvedValueOnce([[{join_identity:'user-7'}]]).mockResolvedValueOnce([[]]) };
    expect((await groupTranscriptionConsent({ id: 101 }, db)).allowed).toBe(false);
    expect((await groupTranscriptionConsent({ id: 101 }, db)).allowed).toBe(true);
    expect(db.execute.mock.calls[0][0]).toContain('JOIN supervision_session_video_admissions');
    expect(db.execute.mock.calls[0][0]).toContain('p.left_at IS NULL');
    expect(isGroupSupervision({ session_type: 'individual' })).toBe(false);
  });
});
