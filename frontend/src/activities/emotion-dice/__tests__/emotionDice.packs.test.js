import { describe, it, expect } from 'vitest';
import { PACKS, emotionLabel } from '../contentPacks.js';

describe('Emotion Dice content packs', () => {
  it('core pack has six faces', () => {
    expect(PACKS['core-6'].emotions).toHaveLength(6);
    expect(PACKS['core-6'].emotions.map((e) => e.id)).toContain('calm');
  });

  it('alternate pack has distinct faces', () => {
    expect(PACKS['alt-6'].emotions.map((e) => e.id)).toEqual([
      'proud',
      'frustrated',
      'lonely',
      'excited',
      'embarrassed',
      'hopeful'
    ]);
  });

  it('emotionLabel resolves from pack', () => {
    expect(emotionLabel('core-6', 'anxious')).toBe('Anxious');
    expect(emotionLabel('alt-6', 'hopeful')).toBe('Hopeful');
  });
});

describe('Emotion Dice privacy strip for unshared reflections', () => {
  function stripReflection(sharedState) {
    const copy = { ...(sharedState || {}) };
    if (copy.reflectionShared === false) {
      delete copy.reflection;
    }
    delete copy.providerPrivate;
    return copy;
  }

  it('hides unshared reflection text', () => {
    const out = stripReflection({
      reflection: 'keep private',
      reflectionShared: false,
      providerPrivate: { note: 'x' }
    });
    expect(out.reflection).toBeUndefined();
    expect(out.providerPrivate).toBeUndefined();
  });

  it('keeps shared reflection', () => {
    const out = stripReflection({
      reflection: 'ok to share',
      reflectionShared: true
    });
    expect(out.reflection).toBe('ok to share');
  });
});
