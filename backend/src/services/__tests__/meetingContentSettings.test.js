import { beforeEach, expect, it, vi } from 'vitest';
const execute = vi.hoisted(() => vi.fn());
vi.mock('../../config/database.js', () => ({ default: { execute } }));
import { enableMeetingContentSettings } from '../meetingContentSettings.service.js';
beforeEach(() => { vi.clearAllMocks(); execute.mockResolvedValue([{ affectedRows: 1 }]); });
it.each(['provider_schedule_event', 'supervision_session'])('enables populated %s sections without replacing other settings', async type => {
  const meeting = { id: 9, meeting_settings_json: { goals: false, actionItems: false, attendance: false, transcription: false, screenShare: false, reminders: [] } };
  await enableMeetingContentSettings(type, meeting, { goals: [{ text: 'Shared goal' }], actionItems: [{ text: '  ' }] });
  expect(meeting.meeting_settings_json).toEqual({ goals: true, actionItems: false, attendance: false, transcription: false, screenShare: false, reminders: [] });
  expect(execute.mock.calls[0][0]).toContain('JSON_SET');
  expect(execute.mock.calls[0][0]).not.toMatch(/attendance|transcription|actionItems/);
});
it('does not enable empty content or change legacy meeting defaults', async () => {
  await enableMeetingContentSettings('provider_schedule_event', { id: 9, meeting_settings_json: { goals: false } }, { goals: [{ text: ' ' }] });
  await enableMeetingContentSettings('provider_schedule_event', { id: 9 }, { goals: [{ text: 'Shared goal' }] });
  expect(execute).not.toHaveBeenCalled();
});
it('enables agenda only after an item has content', async () => {
  const meeting = { id: 9, meeting_settings_json: '{"agenda":false,"compensation":false}' };
  await enableMeetingContentSettings('provider_schedule_event', meeting, { agenda: [{ title: 'Discuss project' }] });
  expect(meeting.meeting_settings_json).toEqual({ agenda: true, compensation: false });
});
