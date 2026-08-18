import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDiarizedTranscriptFromWords,
  resolveSpeakerDisplayLabel
} from '../speechTranscription.service.js';

test('maps speaker tags to provider and client labels', () => {
  assert.equal(
    resolveSpeakerDisplayLabel(1, { providerLabel: 'Therapist', clientLabel: 'Client' }),
    'Therapist'
  );
  assert.equal(
    resolveSpeakerDisplayLabel(2, { providerLabel: 'Tutor', clientLabel: 'Student' }),
    'Student'
  );
  assert.equal(
    resolveSpeakerDisplayLabel(3, { providerLabel: 'Therapist', clientLabel: 'Client' }),
    'Speaker 3'
  );
});

test('formats word-level diarization into labeled lines', () => {
  const words = [
    { speakerTag: 1, word: 'Hello' },
    { speakerTag: 1, word: 'there.' },
    { speakerTag: 2, word: 'Hi' },
    { speakerTag: 2, word: 'doc.' }
  ];
  const text = formatDiarizedTranscriptFromWords(words, {
    providerLabel: 'Therapist',
    clientLabel: 'Client'
  });
  assert.equal(text, '[Therapist] Hello there.\n[Client] Hi doc.');
});
