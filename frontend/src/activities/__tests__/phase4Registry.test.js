import { describe, it, expect } from 'vitest';
import { isEmbeddedActivityImplemented, embeddedActivityManifests } from '../index.js';

describe('Phase 4 Feelings Capture registry', () => {
  it('registers feelings-capture as an embedded activity', () => {
    expect(isEmbeddedActivityImplemented('feelings-capture')).toBe(true);
    expect(embeddedActivityManifests['feelings-capture'].id).toBe('feelings-capture');
  });

  it('manifest is current_pilot with mobile-primary feature flag', () => {
    const m = embeddedActivityManifests['feelings-capture'];
    expect(m.status).toBe('current_pilot');
    expect(m.featureFlag).toBe('activity.feelingsCapture.enabled');
    expect(m.platforms).toContain('mobile');
    expect(m.supports.scoring).toBe(false);
    expect(m.supports.haptics).toBe(true);
  });
});
