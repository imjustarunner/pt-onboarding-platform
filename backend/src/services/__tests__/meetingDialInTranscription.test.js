import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
const m = vi.hoisted(() => ({ execute: vi.fn(), state: vi.fn(), append: vi.fn(), membership: vi.fn(), call: vi.fn(), context: vi.fn(), artifact: vi.fn(), privacy: vi.fn(), summary: vi.fn(), end: vi.fn(), membership: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../meetingJoinPolicy.service.js', () => ({ canJoinSupervision:m.membership, canJoinTeamMeeting:m.membership }));
vi.mock('../meetingDialInPolicy.js', async original => ({ ...await original(), dialInConfigured:() => true }));
vi.mock('../meetingTranscription.service.js', () => ({ transcriptionState: m.state, appendMeetingAudio: m.append }));
vi.mock('../meetingDialIn.service.js', () => ({ callWithInvitation: m.call, validateDialInCall: m.context, endDialInCall: m.end }));
vi.mock('../sessionAiPrivacy.service.js', () => ({ requireSessionPrivacyConfiguration: m.privacy }));
vi.mock('../../models/ProviderScheduleEventArtifact.model.js', () => ({ default: { ensureTagged: vi.fn(), findByEventId: m.artifact } }));
vi.mock('../meetingSummaryJobs.service.js', () => ({ enqueueMeetingSummary: m.summary }));
import { phoneTranscriptionState, syncDialInTranscription, savePhoneAudio, pcmWav, attachMeetingDialInAudio } from '../meetingDialInTranscription.service.js';
const call = { id: 'synthetic', meeting_type: 'supervision', meeting_id: 5, user_id: 8, audio_revision: 1, video_stream_id: 'caller-only-stream', video_session_id: 'media' };
const context = { type: 'supervision', meeting: { id: 5, supervisor_user_id: 7 }, userId: 8, isHost: false, name: 'Invited Person', settings: {} };
const active = { allowed: true, requested: true, paused: false, stopped: false, finishing: false, revision: 1 };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-22T18:30:00Z'));
  for (const fn of Object.values(m)) fn.mockReset();
  m.membership.mockResolvedValue(true); m.execute.mockResolvedValue([[context.meeting]]); m.state.mockResolvedValue(active); m.call.mockResolvedValue(call); m.privacy.mockReturnValue(); m.append.mockResolvedValue({ saved: true });
});
afterEach(() => vi.useRealTimers());
describe('named phone transcription', () => {
  it.each(['5924a51e6beebace59f7ed7b61561d19', '5924a51e-6bee-bace-59f7-ed7b61561d19'])('authenticates an audio stream for carrier call %s', async id => {
    const secret = 'a'.repeat(48), server = new EventEmitter();
    const wss = attachMeetingDialInAudio(server);
    const upgrade = vi.spyOn(wss, 'handleUpgrade').mockImplementation(() => {});
    const socket = { on: vi.fn(), write: vi.fn(), destroy: vi.fn() };
    m.call.mockResolvedValue({ ...call, id, state: 'connected', audio_token_hash: crypto.createHash('sha256').update(secret).digest('hex') });
    m.context.mockResolvedValue(context); m.execute.mockResolvedValue([{ affectedRows: 1 }]);
    await server.listeners('upgrade')[0]({ url: '/api/meeting-dial-in/audio', headers: { 'x-meeting-call': id, 'x-meeting-audio': secret, 'x-opentok-ws-sessionid': 'media' } }, socket, Buffer.alloc(0));
    expect(m.call).toHaveBeenCalledWith(id); expect(upgrade).toHaveBeenCalledOnce(); expect(socket.destroy).not.toHaveBeenCalled();
    upgrade.mockRestore(); wss.close();
  });
  it('rejects an audio stream with the wrong secret before accepting its socket', async () => {
    const server = new EventEmitter(), wss = attachMeetingDialInAudio(server);
    const upgrade = vi.spyOn(wss, 'handleUpgrade').mockImplementation(() => {});
    const socket = { on: vi.fn(), write: vi.fn(), destroy: vi.fn() };
    m.call.mockResolvedValue({ ...call, state: 'connected', audio_token_hash: 'another-secret-hash' }); m.context.mockResolvedValue(context);
    await server.listeners('upgrade')[0]({ url: '/api/meeting-dial-in/audio', headers: { 'x-meeting-call': '5924a51e6beebace59f7ed7b61561d19', 'x-meeting-audio': 'a'.repeat(48), 'x-opentok-ws-sessionid': 'media' } }, socket, Buffer.alloc(0));
    expect(upgrade).not.toHaveBeenCalled(); expect(socket.destroy).toHaveBeenCalledOnce();
    upgrade.mockRestore(); wss.close();
  });
  it('starts supervision by default without restarting an explicitly paused or stopped session', async () => {
    m.state.mockResolvedValueOnce({ ...active, requested: false, paused: true, revision: 0 }).mockResolvedValue(active);
    expect(await phoneTranscriptionState(call, context, { initialize: true })).toEqual(active);
    expect(m.execute.mock.calls[0][0]).toContain('INSERT IGNORE');
    m.execute.mockClear(); m.state.mockResolvedValue({ ...active, paused: true });
    await phoneTranscriptionState(call, context, { initialize: true }); expect(m.execute).not.toHaveBeenCalled();
    m.state.mockResolvedValue({ ...active, stopped: true, requested: false });
    await phoneTranscriptionState(call, context, { initialize: true }); expect(m.execute).not.toHaveBeenCalled();
  });
  it('honors meeting-level transcription opt-out and general-meeting manual start', async () => {
    expect(await phoneTranscriptionState(call, { ...context, settings: { transcription: false } })).toMatchObject({ allowed: false });
    m.artifact.mockResolvedValue({ transcript_started_at: null, transcript_revision: 0 });
    expect(await phoneTranscriptionState(call, { ...context, type: 'team-meeting', meeting: { kind: 'TEAM_MEETING', meeting_subtype: 'general' } })).toMatchObject({ allowed: false, requested: false });
  });
  it('announces transcription and opens a separate audio connection for this caller', async () => {
    const transport = { speak: vi.fn(), connectAudio: vi.fn().mockResolvedValue({ connectionId: 'audio' }) };
    await syncDialInTranscription(call, context, transport);
    expect(transport.speak).toHaveBeenCalledWith(call.id, expect.stringContaining('under your name'));
    expect(transport.connectAudio).toHaveBeenCalledWith(call, expect.stringMatching(/^[a-f0-9]{48}$/));
  });
  it('disconnects capture on pause or revision change instead of restarting it', async () => {
    const transport = { disconnect: vi.fn(), connectAudio: vi.fn() };
    m.state.mockResolvedValue({ ...active, paused: true, revision: 2 });
    await syncDialInTranscription({ ...call, audio_token_hash: 'hash', audio_connection_id: 'audio', audio_last_seen_at: new Date() }, context, transport);
    expect(transport.disconnect).toHaveBeenCalledWith('media', 'audio'); expect(transport.connectAudio).not.toHaveBeenCalled();
  });
  it('saves PCM as a valid WAV under the PIN owner’s identity', async () => {
    const pcm = Buffer.alloc(32000); pcm.writeInt16LE(-4096, 0);
    const wav = pcmWav(pcm); expect(wav.subarray(0,4).toString()).toBe('RIFF'); expect(wav.readUInt32LE(24)).toBe(16000); expect(wav.readInt16LE(44)).toBe(-4096);
    await savePhoneAudio(call, context, pcm, 1, Date.now(), 'chunk-123');
    expect(m.append).toHaveBeenCalledWith(expect.objectContaining({ speakerKey: 'dial-8', speakerLabel: 'Invited Person · Phone', userId: 8 }), expect.objectContaining({ mimeType: 'audio/wav', chunkKey: 'chunk-123', revision: 1 }));
  });
  it('clips the final segment at meeting closure and queues a summary that includes it', async () => {
    const ended = Date.now()-200;
    m.call.mockResolvedValue({ ...call, ended_at: new Date(ended) }); m.execute.mockResolvedValue([[{ ...context.meeting, live_ended_at: new Date(ended) }]]);
    await savePhoneAudio(call, context, Buffer.alloc(32000), 1, Date.now(), 'last-chunk');
    expect(m.append.mock.calls[0][1].buffer.length).toBe(44+32000-6400);
    expect(m.append.mock.calls[0][0].dialInFinalCaptureAt).toBe(ended); expect(m.summary).toHaveBeenCalledWith('supervision',5);
  });
  it('discards stale revisions, audio entirely after hangup, and expired final drains', async () => {
    m.call.mockResolvedValue({ ...call, audio_revision: 2 }); await savePhoneAudio(call,context,Buffer.alloc(32000),1,Date.now(),'stale');
    m.call.mockResolvedValue({ ...call, ended_at: new Date(Date.now()-2000) }); await savePhoneAudio(call,context,Buffer.alloc(32000),1,Date.now(),'after-end');
    m.call.mockResolvedValue({ ...call, ended_at: new Date(Date.now()-121000) }); await savePhoneAudio(call,context,Buffer.alloc(32000),1,Date.now()-122000,'expired');
    expect(m.append).not.toHaveBeenCalled();
  });
  it('discards captured audio when the participant loses current meeting membership', async () => {
    m.membership.mockResolvedValue(false);
    await savePhoneAudio(call,context,Buffer.alloc(32000),1,Date.now(),'removed');
    expect(m.append).not.toHaveBeenCalled(); expect(m.summary).not.toHaveBeenCalled();
  });
  it('drops an in-flight segment after current meeting transcription is disabled', async () => {
    m.execute.mockResolvedValue([[{...context.meeting,meeting_settings_json:{transcription:false}}]]);
    await savePhoneAudio(call,context,Buffer.alloc(32000),1,Date.now(),'disabled');
    expect(m.append).not.toHaveBeenCalled();
  });
  it('marks capture unavailable if the transcription provider cannot be reached', async () => {
    const transport = { speak: vi.fn(), connectAudio: vi.fn().mockRejectedValue(new Error('synthetic outage')) };
    await syncDialInTranscription(call,context,transport);
    expect(m.execute.mock.calls.some(([sql])=>sql.includes("audio_status='unavailable'"))).toBe(true);
  });
});
