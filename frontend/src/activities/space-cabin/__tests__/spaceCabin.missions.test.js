import { describe, it, expect } from 'vitest';
import {
  MISSIONS,
  MISSION_SCRIPTS,
  DEBRIEF_PROMPTS,
  getMission,
  getNode
} from '../missions.js';
import {
  PERFORMANCE_PROFILES,
  resolveEffectiveProfile,
  defaultProfileForLayout,
  profileIsStatic
} from '../performanceProfiles.js';
import manifest from '../manifest.js';

describe('Space Cabin manifest', () => {
  it('is current_pilot with spaceCabin feature flag and embedded launch', () => {
    expect(manifest.id).toBe('space-cabin-conversation');
    expect(manifest.status).toBe('current_pilot');
    expect(manifest.featureFlag).toBe('activity.spaceCabin.enabled');
    expect(manifest.launchMode).toBe('embedded');
    expect(manifest.webFullFidelity).toBe(true);
    expect(manifest.supports.scoring).toBe(false);
  });
});

describe('Space Cabin missions', () => {
  it('includes all six curated missions from the product spec', () => {
    const ids = MISSIONS.map((m) => m.id);
    expect(ids).toEqual([
      'first-contact',
      'alien-misunderstanding',
      'mission-stress',
      'homesick-traveler',
      'crew-conflict',
      'unknown-emotion'
    ]);
  });

  it('every mission script has a start node and closing/debrief path', () => {
    for (const mission of MISSIONS) {
      const script = MISSION_SCRIPTS[mission.id];
      expect(script).toBeTruthy();
      expect(script.nodes[script.start]).toBeTruthy();
      expect(script.nodes.closing || script.nodes.debrief).toBeTruthy();
      const start = getNode(mission.id, script.start);
      expect(Array.isArray(start.options)).toBe(true);
      expect(start.options.length).toBeGreaterThan(0);
    }
  });

  it('getMission falls back safely', () => {
    expect(getMission('missing').id).toBe('first-contact');
  });

  it('offers debrief prompts without diagnostic framing', () => {
    expect(DEBRIEF_PROMPTS.length).toBeGreaterThanOrEqual(4);
    const joined = DEBRIEF_PROMPTS.join(' ').toLowerCase();
    expect(joined).not.toMatch(/diagnos|disorder|score|pass\/fail/);
  });

  it('client escape options exist on first-contact', () => {
    const greet = getNode('first-contact', 'greet');
    expect(greet.options.some((o) => o.clientEscape)).toBe(true);
  });
});

describe('Space Cabin performance profiles', () => {
  it('defines High / Balanced / Mobile / Low Bandwidth / Reduced Motion', () => {
    expect(PERFORMANCE_PROFILES.map((p) => p.id)).toEqual([
      'high',
      'balanced',
      'mobile',
      'low_bandwidth',
      'reduced_motion'
    ]);
  });

  it('forces reduced_motion when prefers-reduced-motion is on', () => {
    expect(
      resolveEffectiveProfile({ profileId: 'high', reducedMotion: true, layout: 'web' })
    ).toBe('reduced_motion');
  });

  it('defaults by layout', () => {
    expect(defaultProfileForLayout('web')).toBe('balanced');
    expect(defaultProfileForLayout('mobile')).toBe('mobile');
  });

  it('marks low bandwidth and reduced motion as static', () => {
    expect(profileIsStatic('low_bandwidth')).toBe(true);
    expect(profileIsStatic('reduced_motion')).toBe(true);
    expect(profileIsStatic('high')).toBe(false);
  });
});
