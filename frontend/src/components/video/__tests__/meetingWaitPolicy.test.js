import { describe, it, expect } from 'vitest';
import { createMeetingWaitPolicy, participantIdentity } from '../meetingWaitPolicy';
const update = (policy, now, others = 0) => policy.update({ connected: true, others, now });
describe('waiting alone in a video room', () => {
  it('prompts after two minutes and disconnects after 30 seconds without a response', () => {
    const p = createMeetingWaitPolicy();
    expect(update(p, 0).phase).toBe('waiting');
    expect(update(p, 119999).phase).toBe('waiting');
    expect(update(p, 120000)).toMatchObject({ phase: 'prompt', secondsRemaining: 30, canExtend: true });
    expect(update(p, 150000).phase).toBe('expired');
  });
  it('allows extensions but cannot extend past ten minutes, even after a suspended tab resumes', () => {
    const p = createMeetingWaitPolicy(); update(p, 0);
    for (const now of [120000, 240000, 360000, 480000]) {
      expect(update(p, now).phase).toBe('prompt'); p.extend(now);
    }
    expect(update(p, 570000)).toMatchObject({ phase: 'prompt', canExtend: false, secondsRemaining: 30 });
    expect(p.extend(580000).disconnectAt).toBe(600000);
    expect(update(p, 600000).phase).toBe('expired');
    expect(p.extend(900000).phase).toBe('expired');
  });
  it('cancels the prompt when a second person joins and starts fresh after they leave or the user rejoins', () => {
    const p = createMeetingWaitPolicy(); update(p, 0); update(p, 120000);
    expect(update(p, 130000, 1).phase).toBe('inactive');
    expect(update(p, 900000, 1).phase).toBe('inactive');
    expect(update(p, 910000).hardDeadline).toBe(1510000);
    p.update({ connected: false, others: 0, now: 920000 });
    expect(update(p, 930000).aloneSince).toBe(930000);
  });
  it('deduplicates a person across connections and uses a safe fallback for older connections', () => {
    const data = JSON.stringify({ identity: 'user-7', displayName: 'Rachel' });
    expect(participantIdentity({ connectionId: 'a', data })).toEqual(participantIdentity({ connectionId: 'b', data }));
    expect(participantIdentity({ connectionId: 'a', data: 'invalid' })).toEqual({ key: 'a', name: 'A participant' });
  });
});
