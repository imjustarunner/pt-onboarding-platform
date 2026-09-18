import { describe, expect, it } from 'vitest';
import { createSpeakerTracker, mediaElement, tileGrid } from '../meetingPresentation';

describe('meeting presentation', () => {
  it('reads the SDK DOM property and supports a wrapped element method', () => {
    const element = document.createElement('div');
    expect(mediaElement({ element })).toBe(element);
    expect(mediaElement({ element: () => element })).toBe(element);
    expect(mediaElement(null)).toBe(null);
  });

  it('fits six participants into landscape rows rather than six tall columns', () => {
    expect(tileGrid(6, 1440, 800)).toEqual({ columns: 3, rows: 2 });
    expect(tileGrid(6, 800, 1100)).toEqual({ columns: 2, rows: 3 });
    const mini = tileGrid(6, 264, 200, 'mini');
    expect(mini.columns * mini.rows).toBeGreaterThanOrEqual(6);
  });

  it('allows every quiet speaker and the local user to become active, then expires highlights', () => {
    const tracker = createSpeakerTracker();
    for (const [i, key] of ['alice', 'bob', 'carol', 'dana', 'local'].entries()) {
      const now = i * 2000;
      tracker.update(key, 0.06, now);
      expect(tracker.snapshot(now)).toEqual({ active: key, speaking: { [key]: true } });
    }
    expect(tracker.snapshot(10000).speaking).toEqual({});
  });

  it('holds the speaker through short pauses and avoids rapid switching', () => {
    const tracker = createSpeakerTracker();
    tracker.update('alice', 0.1, 0);
    expect(tracker.snapshot(0).active).toBe('alice');
    tracker.update('alice', 0, 200);
    tracker.update('bob', 0.2, 200);
    expect(tracker.snapshot(200).active).toBe('alice');
    tracker.update('bob', 0.1, 1200);
    expect(tracker.snapshot(1200).active).toBe('bob');
    tracker.remove('bob');
    expect(tracker.snapshot(1300).speaking).toEqual({});
  });
});
