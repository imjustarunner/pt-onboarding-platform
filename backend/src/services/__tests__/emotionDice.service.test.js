import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyRollToSharedState,
  buildInitialEmotionDiceState,
  getPack,
  lighterPromptDepth,
  pickEmotion,
  pickPrompt,
  DEFAULT_PACK_ID,
  ALT_PACK_ID
} from '../emotionDice.service.js';

test('pickEmotion is deterministic with seeded random', () => {
  const pack = getPack(DEFAULT_PACK_ID);
  const emotion = pickEmotion(DEFAULT_PACK_ID, { random: () => 0 });
  assert.equal(emotion.id, pack.emotions[0].id);

  const last = pickEmotion(DEFAULT_PACK_ID, { random: () => 0.999 });
  assert.equal(last.id, pack.emotions[pack.emotions.length - 1].id);
});

test('pickEmotion uses alternate pack faces', () => {
  const emotion = pickEmotion(ALT_PACK_ID, { random: () => 0 });
  assert.equal(emotion.id, 'proud');
  assert.equal(emotion.label, 'Proud');
});

test('pickPrompt respects depth and excludeId', () => {
  const light = pickPrompt('light', { random: () => 0 });
  assert.equal(light.depth, 'light');
  assert.ok(light.text);

  const next = pickPrompt('light', { random: () => 0, excludeId: light.id });
  assert.notEqual(next.id, light.id);
});

test('lighterPromptDepth steps down the ladder', () => {
  assert.equal(lighterPromptDepth('perspective'), 'share');
  assert.equal(lighterPromptDepth('light'), 'light');
});

test('applyRollToSharedState advances history and switches turn', () => {
  const initial = buildInitialEmotionDiceState({
    whoRollsFirst: 'client',
    maximumRounds: 2,
    packId: DEFAULT_PACK_ID
  });
  const emotion = { id: 'calm', label: 'Calm' };
  const prompt = { id: 'light-1', text: 'When?', depth: 'light' };

  const after = applyRollToSharedState(initial, {
    rollerRole: 'client',
    emotion,
    prompt
  });

  assert.equal(after.currentEmotionId, 'calm');
  assert.equal(after.currentTurn, 'provider');
  assert.equal(after.round, 1);
  assert.equal(after.rollHistory.length, 1);
  assert.equal(after.phase, 'discuss');
  assert.equal(after.lastRollerRole, 'client');

  const after2 = applyRollToSharedState(after, {
    rollerRole: 'provider',
    emotion: { id: 'happy', label: 'Happy' },
    prompt: { id: 'light-2', text: 'Word?', depth: 'light' }
  });
  assert.equal(after2.phase, 'rounds_complete');
  assert.equal(after2.rollHistory.length, 2);
  assert.equal(after2.currentTurn, 'client');
});

test('buildInitialEmotionDiceState defaults', () => {
  const state = buildInitialEmotionDiceState();
  assert.equal(state.packId, DEFAULT_PACK_ID);
  assert.equal(state.whoRollsFirst, 'client');
  assert.equal(state.currentTurn, 'client');
  assert.equal(state.phase, 'ready');
  assert.deepEqual(state.rollHistory, []);
});
