import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ row: null, save: true, execute: vi.fn(), release: vi.fn(), create: vi.fn(), end: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: async () => ({ execute: m.execute, release: m.release }) } }));
vi.mock('../vonageVideo.service.js', () => ({ resolveVideoProjectId: () => 'test-project', default: { isVideoConfigured: () => true, createSession: m.create, endLiveSession: m.end } }));
vi.mock('../meetingDialInPolicy.js', async original => ({ ...await original(), dialInConfigured: () => true }));
import { createOrGetMeetingRoom } from '../video.service.js';
import { assertDialInMeeting } from '../meetingDialInPolicy.js';

beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv('MEETING_DIAL_IN_REQUIRED_SUPERVISOR_IDS', ''); vi.stubEnv('MEETING_DIAL_IN_PILOT_SUPERVISOR_IDS', '');
  m.save = true; m.create.mockResolvedValue('new-video-room'); m.end.mockResolvedValue({});
  m.row = { id: 5, agency_id: 2, supervisor_user_id: 7, provider_id: 7, status: 'SCHEDULED', modality: 'virtual', platform_video_link: 1,
    start_at: new Date(Date.now() - 60000), end_at: new Date(Date.now() + 3600000), meeting_settings_json: { reminders: [5] } };
  m.execute.mockImplementation(async sql => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.startsWith('SELECT *')) return [[m.row].filter(Boolean)];
    if (sql.startsWith('UPDATE')) return [{ affectedRows: m.save ? 1 : 0 }];
    return [[]];
  });
});
afterEach(() => vi.unstubAllEnvs());

it.each([
  ['supervision', null, undefined], ['supervision', null, false], ['supervision', null, true],
  ['team-meeting', 'TEAM_MEETING', undefined], ['team-meeting', 'TEAM_MEETING', false], ['team-meeting', 'TEAM_MEETING', true],
  ['team-meeting', 'HUDDLE', undefined], ['team-meeting', 'HUDDLE', false], ['team-meeting', 'HUDDLE', true]
])('creates the video room for %s/%s with phone option %s', async (type, kind, dialIn) => {
  m.row.kind = kind; if (dialIn !== undefined) m.row.meeting_settings_json.dialIn = dialIn;
  const room = await createOrGetMeetingRoom(type, 5, 'meeting-5');
  expect(room.sid).toBe('new-video-room'); expect(m.create).toHaveBeenCalledOnce();
  expect(m.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(true);
  // Ordinary video access must not opt the meeting into phone access.
  if (dialIn !== true) expect(() => assertDialInMeeting(type, m.row)).toThrow('Phone dial-in is not enabled');
  else expect(() => assertDialInMeeting(type, m.row)).not.toThrow();
  expect(m.release).toHaveBeenCalledOnce();
});
it('reuses an existing video room without requiring the phone option', async () => {
  m.row.twilio_room_sid = 'existing-room';
  expect((await createOrGetMeetingRoom('supervision', 5, 'meeting-5')).sid).toBe('existing-room');
  expect(m.create).not.toHaveBeenCalled();
});
it('does not apply phone-only pilot hosts or PIN expiration to browser room creation', async () => {
  vi.stubEnv('MEETING_DIAL_IN_PILOT_SUPERVISOR_IDS', '99');
  m.row.start_at = new Date(Date.now() - 24 * 3600000); m.row.end_at = new Date(Date.now() - 23 * 3600000);
  expect((await createOrGetMeetingRoom('supervision', 5, 'meeting-5')).sid).toBe('new-video-room');
});
it.each(['CANCELLED', 'RESCHEDULED', 'MISSED', 'FINALIZED', 'COMPLETED', 'ENDED', 'MANUAL_PENDING', 'MANUAL_RECORDING'])('keeps %s meetings closed even when a room already exists', async status => {
  m.row.status = status; m.row.twilio_room_sid = 'existing-room';
  await expect(createOrGetMeetingRoom('supervision', 5, 'meeting-5')).rejects.toMatchObject({ status: 410 });
  expect(m.create).not.toHaveBeenCalled();
});
it.each([['supervision', { live_ended_at: new Date() }], ['team-meeting', { kind: 'TEAM_MEETING', meeting_completed_at: new Date() }]])('keeps explicitly ended %s meetings closed', async (type, patch) => {
  Object.assign(m.row, patch);
  await expect(createOrGetMeetingRoom(type, 5, 'meeting-5')).rejects.toMatchObject({ status: 410 });
});
it.each([['supervision', { modality: 'in_person' }], ['team-meeting', { kind: 'TEAM_MEETING', platform_video_link: 0 }]])('preserves the platform video requirement for %s', async (type, patch) => {
  Object.assign(m.row, patch);
  await expect(createOrGetMeetingRoom(type, 5, 'meeting-5')).rejects.toMatchObject({ status: 400 });
});
it('does not create a media room for an appointment masquerading as a team meeting', async () => {
  m.row.kind = 'APPOINTMENT';
  await expect(createOrGetMeetingRoom('team-meeting', 5, 'meeting-5')).rejects.toMatchObject({ status: 404 });
});
it('closes a newly allocated provider room if the meeting ends during creation', async () => {
  m.create.mockImplementationOnce(async () => { m.save = false; return 'orphan-room'; });
  await expect(createOrGetMeetingRoom('supervision', 5, 'meeting-5')).rejects.toMatchObject({ status: 410 });
  expect(m.end).toHaveBeenCalledWith('orphan-room', { reason: 'meeting_closed' });
});
