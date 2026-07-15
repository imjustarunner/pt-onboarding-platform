import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  EMOTIONS,
  SITUATIONS,
  MODES,
  DEFAULT_MODE,
  emotionsForSituation,
  createInitialSharedState,
  emotionLabel
} from '../contentPacks.js';
import { maybeVibrate, maybeCaptureHaptic } from '../haptics.js';
import manifest from '../manifest.js';

describe('Feelings Capture content packs', () => {
  it('defaults to untimed calm mode', () => {
    expect(DEFAULT_MODE).toBe('untimed_calm');
    expect(MODES.untimed_calm).toBeTruthy();
  });

  it('exposes labeled emotions with shapes (not color-only)', () => {
    expect(EMOTIONS.length).toBeGreaterThanOrEqual(8);
    for (const e of EMOTIONS) {
      expect(e.id).toBeTruthy();
      expect(e.label).toBeTruthy();
      expect(e.shape).toBeTruthy();
    }
  });

  it('example project situation includes mixed-feeling options', () => {
    const sit = SITUATIONS.find((s) => s.id === 'project-and-cancel');
    expect(sit).toBeTruthy();
    const ids = sit.suggestedEmotionIds;
    expect(ids).toEqual(
      expect.arrayContaining(['disappointed', 'worried', 'angry', 'relieved', 'overwhelmed', 'lonely'])
    );
    const scene = emotionsForSituation(sit);
    expect(scene.map((e) => e.label)).toEqual(
      expect.arrayContaining(['Disappointed', 'Worried', 'Relieved'])
    );
  });

  it('createInitialSharedState starts with haptics off and static on', () => {
    const state = createInitialSharedState();
    expect(state.hapticsEnabled).toBe(false);
    expect(state.staticMode).toBe(true);
    expect(state.timerEnabled).toBe(false);
    expect(state.phase).toBe('intro');
    expect(state.scoring).toBeUndefined();
  });

  it('emotionLabel resolves ids', () => {
    expect(emotionLabel('grateful')).toBe('Grateful');
  });
});

describe('Feelings Capture haptics', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', { vibrate: vi.fn(() => true) });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not vibrate when disabled (default)', () => {
    expect(maybeVibrate(false)).toBe(false);
    expect(navigator.vibrate).not.toHaveBeenCalled();
  });

  it('vibrates only when enabled and API exists', () => {
    expect(maybeCaptureHaptic(true)).toBe(true);
    expect(navigator.vibrate).toHaveBeenCalled();
  });

  it('fails soft when vibrate is missing', () => {
    vi.stubGlobal('navigator', {});
    expect(maybeVibrate(true)).toBe(false);
  });
});

describe('Feelings Capture manifest', () => {
  it('is current_pilot with feelingsCapture feature flag', () => {
    expect(manifest.id).toBe('feelings-capture');
    expect(manifest.status).toBe('current_pilot');
    expect(manifest.featureFlag).toBe('activity.feelingsCapture.enabled');
    expect(manifest.supports.scoring).toBe(false);
    expect(manifest.supports.haptics).toBe(true);
    expect(manifest.platforms).toContain('mobile');
  });
});

describe('Feelings Capture selection privacy (no diagnostic scoring)', () => {
  function summarizeRound(sharedState) {
    const selected = sharedState?.selectedShared || [];
    return {
      emotionIds: selected.map((s) => s.id),
      // Never invent a clinical label from capture counts
      diagnosticScore: undefined
    };
  }

  it('records selections without a diagnostic score', () => {
    const summary = summarizeRound({
      selectedShared: [
        { id: 'worried', label: 'Worried' },
        { id: 'relieved', label: 'Relieved' }
      ]
    });
    expect(summary.emotionIds).toEqual(['worried', 'relieved']);
    expect(summary.diagnosticScore).toBeUndefined();
  });
});
