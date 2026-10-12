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
  it('does not gate transcription on per-session acknowledgments', async () => {
    const db = { execute: vi.fn() };
    expect((await groupTranscriptionConsent({ id: 101 }, db)).allowed).toBe(true);
    expect(db.execute).not.toHaveBeenCalled();
    expect(isGroupSupervision({ session_type: 'individual' })).toBe(false);
  });
});
