import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ findUser: vi.fn(), membership: vi.fn(), execute: vi.fn(), window: vi.fn(), db: { execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: m.findUser } }));
vi.mock('../meetingJoinPolicy.service.js', () => ({ hasActiveMeetingMembership: m.membership }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute, getConnection: async () => m.db } }));
vi.mock('../meetingWindowConflict.service.js', () => ({ withMeetingWindow: m.window }));
import { resolveSupervisionFacilitatorEdit } from '../supervisionFacilitatorEdit.service.js';
import { isSupervisionFacilitator, supervisionCoFacilitatorIds } from '../../utils/supervisionFacilitators.js';
import Session from '../../models/SupervisionSession.model.js';

const row = { id: 369, session_type: 'group', agency_id: 2, supervisor_user_id: 528, co_facilitator_user_id: 538, start_at: '2026-11-13 01:00:00', end_at: '2026-11-13 02:00:00', event_timezone: 'America/Denver' };
beforeEach(() => {
  vi.restoreAllMocks(); vi.clearAllMocks();
  m.findUser.mockResolvedValue({ id: 507, role: 'admin' }); m.membership.mockResolvedValue(true);
  m.window.mockImplementation(async (_, work) => work());
  m.execute.mockResolvedValue([[{ user_id: 81 }]]);
  m.db.execute.mockImplementation(async sql => sql.startsWith('SELECT') ? [[{ ...row, meeting_settings_json: { coFacilitatorUserIds: [538, 507] } }]] : [{ affectedRows: 1 }]);
});

it('adds an active admin as an additional cofacilitator without replacing the existing one', async () => {
  const patch = await resolveSupervisionFacilitatorEdit(row, { coFacilitatorUserIds: [538, 507] });
  expect(patch).toEqual({ supervisorUserId: 528, coFacilitatorUserIds: [538, 507] });
  expect(m.findUser).toHaveBeenCalledTimes(1); expect(m.findUser).toHaveBeenCalledWith(507);
  expect(isSupervisionFacilitator({ ...row, meeting_settings_json: JSON.stringify(patch) }, 507)).toBe(true);
  expect(isSupervisionFacilitator({ ...row, meeting_settings_json: JSON.stringify(patch) }, 538)).toBe(true);
});

it('supports a primary facilitator change and rejects invalid or ineligible replacements', async () => {
  expect(await resolveSupervisionFacilitatorEdit(row, { supervisorUserId: 507 })).toMatchObject({ supervisorUserId: 507, coFacilitatorUserIds: [538] });
  await expect(resolveSupervisionFacilitatorEdit(row, { supervisorUserId: 538 })).rejects.toThrow('also be');
  m.membership.mockResolvedValue(false);
  await expect(resolveSupervisionFacilitatorEdit(row, { coFacilitatorUserIds: [538, 507] })).rejects.toThrow('active members');
  m.membership.mockResolvedValue(true); m.findUser.mockResolvedValue({ id: 507, role: 'provider' });
  await expect(resolveSupervisionFacilitatorEdit(row, { coFacilitatorUserIds: [538, 507] })).rejects.toThrow('group supervision privileges');
});

it('updates facilitator ownership and attendee roles in one transaction without rechecking optional invitees for conflicts', async () => {
  vi.spyOn(Session, 'findById').mockResolvedValue(row);
  await Session.updateById(369, { supervisorUserId: 528, coFacilitatorUserIds: [538, 507] });
  expect(m.window).toHaveBeenCalledWith(expect.objectContaining({ userIds: [528, 538, 507], excludeSupervisionId: 369 }), expect.any(Function));
  expect(m.db.beginTransaction).toHaveBeenCalledOnce(); expect(m.db.commit).toHaveBeenCalledOnce();
  const calls = m.db.execute.mock.calls;
  expect(calls.find(([sql]) => sql.includes('UPDATE supervision_sessions'))[1]).toEqual([528, '[538,507]', 538, 369]);
  expect(calls.filter(([sql]) => sql.startsWith('INSERT INTO supervision_session_attendees')).map(([, values]) => values)).toEqual([
    [369, 528, 'supervisor'], [369, 538, 'co_facilitator'], [369, 507, 'co_facilitator']
  ]);
  expect(calls.some(([sql]) => /DELETE FROM supervision_session_attendees/.test(sql))).toBe(false);
});

it('rolls back ownership when updating the facilitator roster fails', async () => {
  m.db.execute.mockRejectedValueOnce(new Error('write failed'));
  await expect(Session.updateWithReviewTimeChecked(369, { supervisorUserId: 528, coFacilitatorUserIds: [538, 507] })).rejects.toThrow('write failed');
  expect(m.db.rollback).toHaveBeenCalledOnce(); expect(m.db.commit).not.toHaveBeenCalled(); expect(m.db.release).toHaveBeenCalledOnce();
});

it('reads legacy sessions and ignores malformed extra facilitator settings', () => {
  expect(supervisionCoFacilitatorIds(row)).toEqual([538]);
  expect(supervisionCoFacilitatorIds({ ...row, meeting_settings_json: { coFacilitatorUserIds: 'invalid' } })).toEqual([538]);
});
