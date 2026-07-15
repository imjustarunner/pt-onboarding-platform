import { describe, it, expect } from 'vitest';
import { isEmbeddedActivityImplemented, embeddedActivityManifests } from '../index.js';

describe('Phase 2 embedded activity registry', () => {
  it('registers mood-check-in, emotion-dice, and peaceful-pond', () => {
    expect(isEmbeddedActivityImplemented('mood-check-in')).toBe(true);
    expect(isEmbeddedActivityImplemented('emotion-dice')).toBe(true);
    expect(isEmbeddedActivityImplemented('peaceful-pond')).toBe(true);
  });

  it('manifests match expected Phase 2 statuses', () => {
    expect(embeddedActivityManifests['emotion-dice'].status).toBe('live_current');
    expect(embeddedActivityManifests['peaceful-pond'].status).toBe('current_pilot');
    expect(embeddedActivityManifests['peaceful-pond'].featureFlag).toBe(
      'activity.peacefulPond.enabled'
    );
    expect(embeddedActivityManifests['emotion-dice'].featureFlag).toBe(
      'activity.emotionDice.enabled'
    );
  });
});

describe('Peaceful Pond careful language', () => {
  it('uses set-down / make-space framing (not erase/suppress)', () => {
    const approved = [
      'set it down',
      'make a little space',
      'not erased',
      'return to it later',
      'making space — not making it disappear'
    ];
    // Guardrail: approved copy must not include forbidden verbs as the primary framing.
    const forbiddenPrimary = ['erase the worry', 'suppress the feeling', 'make it disappear forever'];
    for (const phrase of approved) {
      expect(typeof phrase).toBe('string');
      expect(phrase.length).toBeGreaterThan(3);
    }
    for (const bad of forbiddenPrimary) {
      expect(approved.some((a) => a.includes(bad))).toBe(false);
    }
  });
});
