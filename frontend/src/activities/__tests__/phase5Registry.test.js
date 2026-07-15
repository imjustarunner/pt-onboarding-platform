import { describe, it, expect } from 'vitest';
import { isEmbeddedActivityImplemented, embeddedActivityManifests } from '../index.js';

describe('Phase 5 Space Cabin registry', () => {
  it('keeps Phase 2–4 registrations intact', () => {
    expect(isEmbeddedActivityImplemented('mood-check-in')).toBe(true);
    expect(isEmbeddedActivityImplemented('emotion-dice')).toBe(true);
    expect(isEmbeddedActivityImplemented('peaceful-pond')).toBe(true);
    expect(isEmbeddedActivityImplemented('feelings-capture')).toBe(true);
  });

  it('registers space-cabin-conversation as embedded current_pilot', () => {
    expect(isEmbeddedActivityImplemented('space-cabin-conversation')).toBe(true);
    const m = embeddedActivityManifests['space-cabin-conversation'];
    expect(m.id).toBe('space-cabin-conversation');
    expect(m.status).toBe('current_pilot');
    expect(m.featureFlag).toBe('activity.spaceCabin.enabled');
    expect(m.launchMode).toBe('embedded');
    expect(m.webFullFidelity).toBe(true);
    expect(m.type).toBe('immersive_narrative');
    expect(m.supports.scoring).toBe(false);
    expect(m.supports.performanceProfiles).toBe(true);
    expect(m.supports.narrativeBranching).toBe(true);
    expect(m.supports.reducedMotion).toBe(true);
  });
});
