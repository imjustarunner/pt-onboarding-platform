import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), event: vi.fn(), invited: vi.fn(), proctor: vi.fn(), create: vi.fn(), enable: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: { findById: m.event } }));
vi.mock('../../models/SupervisionSession.model.js', () => ({ default: {} }));
vi.mock('../../models/MeetingAgenda.model.js', () => ({ default: { findById: async () => ({ id: 12, meeting_type: 'provider_schedule_event', meeting_id: 9 }) } }));
vi.mock('../../models/MeetingAgendaItem.model.js', () => ({ default: { findByAgendaId: async () => [], create: m.create } }));
vi.mock('../../models/Task.model.js', () => ({ default: {} }));
vi.mock('../../models/User.model.js', () => ({ default: { findById: async () => ({ role: 'provider' }), getAgencies: async () => [] } }));
vi.mock('../../services/scheduledTraining.service.js', () => ({ isTrainingProctor: m.proctor }));
vi.mock('../../services/meetingJoinPolicy.service.js', () => ({ canJoinSupervision: vi.fn(), canJoinTeamMeeting: m.invited }));
vi.mock('../../services/meetingContentSettings.service.js', () => ({ enableMeetingContentSettings: m.enable }));
import { addAgendaItem } from '../meetingAgendas.controller.js';
const event = { id: 9, kind: 'TEAM_MEETING', provider_id: 7, meeting_settings_json: { agenda: false } };
const invoke = async () => { const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn(); await addAgendaItem({ params: { agendaId: 12 }, user: { id: 8 }, body: { title: 'Team discussion' } }, res, next); expect(next).not.toHaveBeenCalled(); return res; };
beforeEach(() => { vi.clearAllMocks(); m.event.mockResolvedValue({ ...event }); m.invited.mockResolvedValue(true); m.proctor.mockResolvedValue(false); m.create.mockResolvedValue({ id: 20, title: 'Team discussion' }); });
it('lets an invited active participant add content and enable the agenda', async () => {
  const res = await invoke(); expect(res.status).toHaveBeenCalledWith(201);
  expect(m.enable).toHaveBeenCalledWith('provider_schedule_event', event, { agenda: [{ title: 'Team discussion' }] });
});
it('keeps outsiders from changing a meeting agenda', async () => {
  m.invited.mockResolvedValue(false); const res = await invoke(); expect(res.status).toHaveBeenCalledWith(403); expect(m.create).not.toHaveBeenCalled();
});
it.each(['training', 'interview'])('preserves %s facilitator restrictions', async meeting_subtype => {
  m.event.mockResolvedValue({ ...event, meeting_subtype }); const res = await invoke(); expect(res.status).toHaveBeenCalledWith(403); expect(m.create).not.toHaveBeenCalled();
});
