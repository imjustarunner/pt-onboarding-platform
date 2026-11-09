import { afterEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
vi.mock('../vonageVideo.service.js', () => ({ default: {} }));
import { assertDialInMeeting, occurrenceKey, pinDigest, newPersonalPin, personalPinDigest, dialInCallerHash, registeredDialInPhone, unionAttendanceIntervals, dialInDetails, dialInConfigured, dialInReadiness } from '../meetingDialInPolicy.js';
import { verifyDialInWebhook } from '../meetingDialInTransport.service.js';
import { meetingInvitationContent } from '../meetingInvitationPolicy.js';
const now = new Date('2026-10-22T18:00:00Z');
const meeting = { id: 5, agency_id: 2, supervisor_user_id: 7, start_at: '2026-10-22 18:00:00', end_at: '2026-10-22 19:00:00', status: 'SCHEDULED', modality: 'VIRTUAL' };
afterEach(() => vi.useRealTimers());
describe('personal meeting telephone policy', () => {
  it('limits access to the scheduled window and never reopens closed meetings', () => {
    expect(() => assertDialInMeeting('supervision', meeting, { joining: true, now })).not.toThrow();
    expect(() => assertDialInMeeting('supervision', meeting, { joining: true, now: new Date('2026-10-22T17:44:00Z') })).toThrow('fifteen');
    expect(() => assertDialInMeeting('supervision', meeting, { now: new Date('2026-10-23T03:00:00Z') })).toThrow('expired');
    for (const patch of [{ live_ended_at: now }, { status: 'CANCELLED' }, { status: 'FINALIZED' }, { status: 'MANUAL_RECORDING' }]) {
      expect(() => assertDialInMeeting('supervision', { ...meeting, ...patch }, { now })).toThrow();
    }
  });
  it('excludes external video, in-person and clinical appointments from this gateway', () => {
    expect(() => assertDialInMeeting('supervision', { ...meeting, modality: 'IN_PERSON' }, { now })).toThrow();
    expect(() => assertDialInMeeting('team-meeting', { ...meeting, kind: 'TEAM_MEETING', platform_video_link: 0 }, { now })).toThrow();
    expect(() => assertDialInMeeting('team-meeting', { ...meeting, kind: 'APPOINTMENT' }, { now })).toThrow();
    expect(() => assertDialInMeeting('counseling', meeting, { now })).toThrow();
  });
  it('changes credentials when the occurrence, host or tenant changes', () => {
    const original = occurrenceKey('supervision', meeting);
    for (const patch of [{ start_at: '2026-10-23 18:00:00' }, { end_at: '2026-10-22 20:00:00' }, { supervisor_user_id: 8 }, { agency_id: 3 }]) {
      expect(occurrenceKey('supervision', { ...meeting, ...patch })).not.toBe(original);
    }
    expect(occurrenceKey('supervision', { ...meeting, start_at: new Date('2026-10-22T18:00:00Z') })).toBe(original);
  });
  it('generates DTMF-compatible PINs and protects the stored lookup with a keyed digest', () => {
    const pins = Array.from({ length: 100 }, () => newPersonalPin());
    for (const pin of pins) expect(pin).toMatch(/^\d{4}$/);
    expect(newPersonalPin(10)).toMatch(/^\d{10}$/);
    expect(pinDigest('0123456789', 'a'.repeat(32))).not.toBe(pinDigest('0123456789', 'b'.repeat(32)));
    expect(() => pinDigest('123', 'short')).toThrow();
  });
  it('binds short PINs to normalized registered caller identity, never to caller ID alone', () => {
    const prior=process.env.MEETING_DIAL_IN_PIN_SECRET;
    process.env.MEETING_DIAL_IN_PIN_SECRET='p'.repeat(32);
    try {
      const a=dialInCallerHash('(202) 555-0199'),b=dialInCallerHash('+12025550198');
      expect(a).toBe(dialInCallerHash('12025550199'));
      expect(personalPinDigest('0123',a)).not.toBe(personalPinDigest('0123',b));
      expect(personalPinDigest('0123',a)).not.toBe(personalPinDigest('0124',a));
      expect(personalPinDigest('0123',a)).not.toBe(pinDigest('0123'));
      expect(registeredDialInPhone({personal_phone:'invalid',work_phone:'202-555-0199'})).toBe('+12025550199');
      expect(occurrenceKey('supervision',meeting,a)).not.toBe(occurrenceKey('supervision',meeting,b));
    } finally { if(prior===undefined)delete process.env.MEETING_DIAL_IN_PIN_SECRET;else process.env.MEETING_DIAL_IN_PIN_SECRET=prior; }
  });
  it('embeds the PIN and host admission choice in a one-tap telephone link', () => {
    const d=dialInDetails('0123',meeting,'Host','+12025550123',{callingPhone:'+12025550199',isHost:true});
    expect(d.oneTapUrl).toBe('tel:+12025550123,,0123%23,,,1');
    expect(d.callingPhoneHint).toContain('0199');
    expect(d.text).toContain('+12025550123,,0123#,,,1');
  });
  it('merges browser/phone overlap while preserving disconnect gaps and scheduled boundaries', () => {
    const result = unionAttendanceIntervals([[0, 10000], [5000, 20000], [22000, 25000], [25000, 28000], [NaN, 50]], { start: 3000, end: 26000 });
    expect(result).toEqual({ seconds: 21, intervals: [[3000, 20000], [22000, 26000]] });
  });
  it('requires explicit configuration and never enables itself from video credentials', () => {
    expect(dialInConfigured({ VONAGE_API_KEY: 'synthetic' })).toBe(false);
    expect(dialInConfigured({ MEETING_DIAL_IN_ENABLED: 'true', MEETING_DIAL_IN_NUMBER: '+12025550123', MEETING_DIAL_IN_PUBLIC_ORIGIN: 'https://example.test', MEETING_DIAL_IN_PIN_SECRET: 'a'.repeat(32), VONAGE_VOICE_SIGNATURE_SECRET: 'synthetic', MEETING_DIAL_IN_VOICE_APPLICATION_ID:'01234567-1234-4234-8234-012345678901', MEETING_DIAL_IN_VOICE_PRIVATE_KEY:'synthetic-only', VONAGE_API_KEY:'test', VONAGE_API_SECRET:'test' })).toBe(true);
  });
  it('requires dedicated assets and rejects callback URLs containing credentials or non-origin components', () => {
    const ready = {MEETING_DIAL_IN_ENABLED:'true',MEETING_DIAL_IN_NUMBER:'+12025550123',MEETING_DIAL_IN_PUBLIC_ORIGIN:'https://example.test',MEETING_DIAL_IN_PIN_SECRET:'p'.repeat(32),VONAGE_VOICE_SIGNATURE_SECRET:'signed',MEETING_DIAL_IN_VOICE_APPLICATION_ID:'01234567-1234-4234-8234-012345678901',MEETING_DIAL_IN_VOICE_PRIVATE_KEY:'synthetic-only',VONAGE_API_KEY:'test',VONAGE_API_SECRET:'test'};
    for (const field of ['MEETING_DIAL_IN_VOICE_APPLICATION_ID','MEETING_DIAL_IN_VOICE_PRIVATE_KEY','VONAGE_VOICE_SIGNATURE_SECRET','VONAGE_API_KEY']) {
      expect(dialInConfigured({...ready,[field]:'',VONAGE_APPLICATION_ID:'office-app',VONAGE_PRIVATE_KEY:'office-key'})).toBe(false);
    }
    for (const origin of ['http://example.test','https://user:pass@example.test','https://example.test/path','https://example.test?query=secret','https://example.test/#fragment']) {
      expect(dialInReadiness({...ready,MEETING_DIAL_IN_PUBLIC_ORIGIN:origin}).missing).toContain('HTTPS callback origin');
    }
    expect(dialInReadiness({...ready,MEETING_DIAL_IN_ENABLED:'false'})).toMatchObject({configured:false,assetsConfigured:true});
  });
  it('places private phone details below the browser join link and escapes names', () => {
    const details = dialInDetails('0123456789', meeting, '<Alex>', '+12025550123');
    expect(details.oneTapUrl).toBe('tel:+12025550123,,0123456789%23');
    const email = meetingInvitationContent({ events: [meeting], joinUrl: 'https://example.test/private', dialIn: details });
    expect(email.html.indexOf('Personal PIN')).toBeGreaterThan(email.html.indexOf('Join your meeting'));
    expect(email.html).toContain('&lt;Alex&gt;');
    expect(email.text).toContain('0123456789 #');
    expect(meetingInvitationContent({ events: [meeting], joinUrl: 'https://example.test/private' }).text).not.toContain('PIN');
  });
});
describe('signed carrier callbacks', () => {
  const env = { VONAGE_VOICE_SIGNATURE_SECRET: 'synthetic-signature', VONAGE_API_KEY: 'synthetic-account' };
  const raw = Buffer.from('{"uuid":"synthetic-call","dtmf":{"digits":"0123456789"}}');
  function token(patch = {}) { return `Bearer ${jwt.sign({ api_key: env.VONAGE_API_KEY, payload_hash: crypto.createHash('sha256').update(raw).digest('hex'), ...patch }, env.VONAGE_VOICE_SIGNATURE_SECRET)}`; }
  it('accepts the authentic exact raw body', () => expect(verifyDialInWebhook(raw, token(), env)).toEqual(JSON.parse(raw)));
  it('rejects altered PINs, other accounts, unsigned and stale callbacks', () => {
    expect(() => verifyDialInWebhook(Buffer.from(raw.toString().replace('0123456789', '9876543210')), token(), env)).toThrow();
    expect(() => verifyDialInWebhook(raw, token({ api_key: 'other' }), env)).toThrow();
    expect(() => verifyDialInWebhook(raw, '', env)).toThrow();
    expect(() => verifyDialInWebhook(raw, token({ iat: Math.floor(Date.now() / 1000) - 900 }), env)).toThrow();
  });
});
