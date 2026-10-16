import { describe, it, expect } from 'vitest';
import { additionalSessionLanguages, publicSessionLanguages } from '../providerLanguages';

describe('published provider language badges', () => {
  it('hides English, trims and deduplicates saved names, and keeps a readable label with its flag', () => {
    expect(additionalSessionLanguages({ languages: ['English', ' english ', 'russian', 'Russian', '', 'Spanish'] }))
      .toEqual([{ language: 'Russian', proficiency: '', flag: '🇷🇺' }, { language: 'Spanish', proficiency: '', flag: '🇲🇽' }]);
    expect(additionalSessionLanguages({ languages: ['EN-us', 'English (native)'] })).toEqual([]);
  });
  it('does not revive languages removed from a structured session-language profile', () => {
    expect(publicSessionLanguages({ languages: ['Russian'], languageProficiencies: [] })).toEqual([]);
    expect(publicSessionLanguages({ languageProficiencies: [null, { language: 'Russian', proficiency: 'fluent', canConductSessions: false }] })).toEqual([]);
  });
  it('keeps other languages and sign language visible without inventing a country', () => {
    expect(additionalSessionLanguages({ languages: ['ASL', 'Diné'] }).map(row => [row.language, row.flag]))
      .toEqual([['ASL', '🤟'], ['Diné', '🌐']]);
    expect(additionalSessionLanguages(null)).toEqual([]);
  });
});
