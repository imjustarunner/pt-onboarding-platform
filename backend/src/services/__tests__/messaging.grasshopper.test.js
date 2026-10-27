import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { grasshopperCaller, voicemailClientCandidates } from '../grasshopperVoicemail.service.js';
const from = { email: 'help@grasshopper.com' };
it('extracts the caller from the voicemail subject, not numbers in the transcript or footer', () => {
  expect(grasshopperCaller({ from, subject: 'New voicemail from (303) 555-1234', bodyText: 'Please call the school at 720-555-9999. Support 800-555-8888' })).toBe('3035551234');
  expect(grasshopperCaller({ from, subject: 'New Voicemail', bodyText: 'Caller ID: +1 (720) 555-1234\nTranscription: Please call back.' })).toBe('7205551234');
});
it('does not guess from arbitrary text, a spoofed domain, or conflicting caller fields', () => {
  expect(grasshopperCaller({ from, subject: 'Voicemail', bodyText: 'Call 303-555-1234' })).toBeNull();
  expect(grasshopperCaller({ from: 'help@grasshopper.com.evil.test', subject: 'Voicemail from 303-555-1234' })).toBeNull();
  expect(grasshopperCaller({ from, subject: 'Voicemail from 303-555-1234', bodyText: 'Caller: 720-555-4321' })).toBeNull();
});
it('scopes normalized client, guardian, and contact phone matches to the receiving agency', async () => {
  const db = { execute: vi.fn().mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]).mockResolvedValueOnce([[{ id: 9 }]]) };
  const result = await voicemailClientCandidates(7, { from, subject: 'Voicemail from 303-555-1234' }, db);
  expect(result.clients).toHaveLength(2); expect(result.guardians).toEqual([{ id: 9 }]);
  for (const [sql, params] of db.execute.mock.calls) { expect(sql).toContain('c.agency_id=?'); expect(params[0]).toBe(7); expect(params).toContain('13035551234'); }
});
