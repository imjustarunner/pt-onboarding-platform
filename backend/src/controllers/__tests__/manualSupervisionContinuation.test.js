import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), artifact: vi.fn(), finalize: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, getConnection: async () => m } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencySupervisionCompensableMap: async () => ({ 20: true }) } }));
vi.mock('../../models/SupervisionSessionArtifact.model.js', () => ({ default: { upsertBySessionId: m.artifact } }));
vi.mock('../../services/supervisionAgreement.service.js', () => ({ isMentalHealthAgency: async () => true }));
vi.mock('../../services/meetingJoinPolicy.service.js', () => ({ hasActiveMeetingMembership: async () => true }));
vi.mock('../supervisionSessions.controller.js', () => ({ finalizeSupervisionSession: m.finalize }));
import { createManualSupervision } from '../supervisionManual.controller.js';
let original, attendance, duplicates;
beforeEach(() => {
  vi.resetAllMocks(); duplicates = false;
  original = { id: 101, agency_id: 2, supervisor_user_id: 10, supervisee_user_id: 20, session_type: 'individual', finalized_at: '2026-01-01 16:00:00' };
  attendance = [10, 20].map(user_id => ({ user_id, last_left_at: '2026-01-01 15:30:00', is_finalized: 1 }));
  m.execute.mockImplementation(async sql => {
    if (sql.includes('FROM supervisor_assignments')) return [[{ id: 1, agency_id: 2, supervisor_id: 10, supervisee_id: 20, supervisor_type: 'clinical' }]];
    if (sql.includes('SELECT session_id FROM supervision_manual_entries')) return [duplicates ? [{ session_id: 102 }] : []];
    if (sql.startsWith('SELECT * FROM supervision_sessions')) return [[original]];
    if (sql.includes('FROM supervision_session_attendance_rollups')) return [attendance];
    if (sql.startsWith('SELECT ss.id')) return [[]];
    if (sql.startsWith('INSERT INTO supervision_sessions')) return [{ insertId: 102 }];
    return [{}];
  });
});
async function create(overrides = {}, actor = 10) {
  const req = { user: { id: actor }, body: { assignmentId: 1, relatedSessionId: 101, reason: 'Continued by phone after losing signal.', note: 'Reviewed goals and follow-up actions.', modality: 'PHONE', sessionType: 'individual', startAt: '2026-01-01T15:30:00Z', endAt: '2026-01-01T15:45:00Z', requestKey: 'continuation-test', ...overrides } };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
  await createManualSupervision(req, res, next); return { res, next };
}
it('records only additional time and encrypts the note in the same transaction, pending approval', async () => {
  const { res, next } = await create();
  expect(next).not.toHaveBeenCalled();
  expect(res.json).toHaveBeenCalledWith({ sessionId: 102, recording: false, pendingApproval: true });
  expect(m.artifact).toHaveBeenCalledWith({ sessionId: 102, summaryText: 'Reviewed goals and follow-up actions.', updatedByUserId: 10 }, m);
  expect(m.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO supervision_manual_entries'))[1][5]).toContain('session #101');
  expect(m.finalize).not.toHaveBeenCalled();
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE supervision_sessions'))).toBe(false);
});
it('rejects overlapping or unfinished original attendance', async () => {
  expect((await create({ startAt: '2026-01-01T15:29:00Z' })).next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
  original.finalized_at = null;
  expect((await create()).next).toHaveBeenCalledWith(expect.objectContaining({ status: 409 }));
  expect(m.artifact).not.toHaveBeenCalled();
});
it('rejects a different supervisee or a supervisee adding their own continuation', async () => {
  original.supervisee_user_id = 99;
  expect((await create()).next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
  expect((await create({}, 20)).next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
});
it('retries do not create another session or note', async () => {
  duplicates = true;
  expect((await create()).res.json).toHaveBeenCalledWith({ sessionId: 102, existing: true });
  expect(m.artifact).not.toHaveBeenCalled();
});
it('rolls back the session when encrypted note persistence fails', async () => {
  m.artifact.mockRejectedValue(new Error('Encryption unavailable'));
  const { next } = await create();
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Encryption unavailable' }));
  expect(m.rollback).toHaveBeenCalled(); expect(m.commit).not.toHaveBeenCalled();
});
