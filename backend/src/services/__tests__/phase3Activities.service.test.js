import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pickSituationCard,
  pickCharadesEmotion,
  buildInitialFeelingsAdventureState,
  buildInitialEmotionCharadesState,
  FEELINGS_ADVENTURE_PACKS,
  CHARADES_EMOTIONS
} from '../phase3Activities.service.js';

test('pickSituationCard returns a situation from the pack', () => {
  const card = pickSituationCard('school', { random: () => 0 });
  assert.equal(card.id, FEELINGS_ADVENTURE_PACKS.school.situations[0].id);
  assert.ok(card.text);
});

test('pickSituationCard can exclude current id', () => {
  const first = FEELINGS_ADVENTURE_PACKS.school.situations[0].id;
  const card = pickSituationCard('school', { random: () => 0, excludeId: first });
  assert.notEqual(card.id, first);
});

test('pickCharadesEmotion returns an emotion', () => {
  const emotion = pickCharadesEmotion({ random: () => 0 });
  assert.equal(emotion.id, CHARADES_EMOTIONS[0].id);
  assert.ok(emotion.label);
});

test('builds initial shared states without scoring fields', () => {
  const fa = buildInitialFeelingsAdventureState();
  assert.equal(fa.phase, 'setup');
  assert.deepEqual(fa.history, []);

  const ec = buildInitialEmotionCharadesState({ maximumRounds: 4 });
  assert.equal(ec.phase, 'setup');
  assert.equal(ec.maximumRounds, 4);
  assert.equal(ec.revealed, false);
});

test('Emotion Charades privacy strip hides emotion from guesser until reveal', () => {
  function stripCharades(sharedState, participantRole) {
    const copy = { ...sharedState };
    if (copy.actorRole && copy.revealed !== true && participantRole !== copy.actorRole) {
      delete copy.currentEmotionId;
      delete copy.currentEmotionLabel;
    }
    return copy;
  }

  const state = {
    actorRole: 'client',
    revealed: false,
    currentEmotionId: 'anxious',
    currentEmotionLabel: 'Anxious'
  };
  assert.equal(stripCharades(state, 'provider').currentEmotionLabel, undefined);
  assert.equal(stripCharades(state, 'client').currentEmotionLabel, 'Anxious');

  const revealed = { ...state, revealed: true, currentEmotionLabel: 'Calm', currentEmotionId: 'calm' };
  assert.equal(stripCharades(revealed, 'provider').currentEmotionLabel, 'Calm');
});
