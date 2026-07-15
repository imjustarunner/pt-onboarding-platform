import { describe, it, expect } from 'vitest';

/**
 * Lightweight acceptance checks for mood shared-state privacy rules.
 * Mirrors backend stripPrivateSharedState + client share semantics.
 */

function stripForClient(sharedState) {
  if (!sharedState || typeof sharedState !== 'object') return {};
  const copy = { ...sharedState };
  delete copy.providerPrivate;
  delete copy.facilitationNotes;
  return copy;
}

function stripForProvider(sharedState) {
  if (!sharedState?.mood) return sharedState || {};
  const copy = { ...sharedState, mood: { ...sharedState.mood } };
  if (copy.mood.noteShared === false) {
    delete copy.mood.note;
  }
  return copy;
}

describe('Mood Check-In shared state privacy', () => {
  it('never exposes providerPrivate to the client view model', () => {
    const state = {
      mood: { id: 'okay', label: 'Okay', noteShared: true, note: 'hi' },
      providerPrivate: { tip: 'secret' }
    };
    expect(stripForClient(state).providerPrivate).toBeUndefined();
    expect(stripForClient(state).mood.note).toBe('hi');
  });

  it('hides unshared note text from provider-facing payload', () => {
    const state = {
      mood: {
        id: 'stressed',
        label: 'Stressed',
        noteShared: false,
        note: 'should not leak'
      }
    };
    const forProvider = stripForProvider(state);
    expect(forProvider.mood.note).toBeUndefined();
    expect(forProvider.mood.noteShared).toBe(false);
  });

  it('keeps shared notes for provider', () => {
    const state = {
      mood: {
        id: 'good',
        label: 'Good',
        noteShared: true,
        note: 'feeling better'
      }
    };
    expect(stripForProvider(state).mood.note).toBe('feeling better');
  });
});
