export const SESSION_PROFICIENCIES = ['professional','fluent','native'];
export function validateSessionLanguages(rows) {
  const fail = () => { throw Object.assign(new Error('For each language, choose a proficiency and confirm that you can conduct sessions in it. Remove languages you do not use for sessions.'), {status:400}); };
  if (!Array.isArray(rows) || rows.length > 12) fail();
  const seen = new Set();
  return rows.map(row => {
    const language = String(row?.language || '').trim();
    const proficiency = String(row?.proficiency || '');
    if (!language || language.length > 60 || !SESSION_PROFICIENCIES.includes(proficiency) || row.canConductSessions !== true || seen.has(language.toLowerCase())) fail();
    seen.add(language.toLowerCase());
    return {language,proficiency,canConductSessions:true};
  });
}

export function sessionLanguageLabels(details={}) {
 const labels={professional:'professional working proficiency',fluent:'fluent',native:'native / bilingual'};
 return Array.isArray(details.languageProficiencies)?details.languageProficiencies.map(row=>`${row.language} — ${labels[row.proficiency]||row.proficiency}`):(details.languages||[]);
}

// Published session languages, with structured proficiency records taking priority
// over the legacy list. Never infer a language from a provider's name or biography.
export function publicSessionLanguages(details = {}) {
  const source = Array.isArray(details?.languageProficiencies)
    ? details.languageProficiencies.filter(row => row?.canConductSessions === true && SESSION_PROFICIENCIES.includes(row.proficiency))
    : (Array.isArray(details?.languages) ? details.languages : []).map(language => ({ language }));
  const seen = new Set();
  return source.flatMap(row => {
    const rawLanguage = String(row.language || '').trim();
    const language = rawLanguage.charAt(0).toLocaleUpperCase() + rawLanguage.slice(1);
    const key = language.toLocaleLowerCase();
    if (!language || seen.has(key)) return [];
    seen.add(key);
    return [{ language, proficiency: row.proficiency || '' }];
  });
}

const LANGUAGE_FLAGS = {
  spanish: '🇲🇽', español: '🇲🇽', russian: '🇷🇺', русский: '🇷🇺',
  french: '🇫🇷', français: '🇫🇷', german: '🇩🇪', deutsch: '🇩🇪',
  italian: '🇮🇹', portuguese: '🇧🇷', chinese: '🇨🇳', mandarin: '🇨🇳',
  'mandarin chinese': '🇨🇳', cantonese: '🇭🇰', japanese: '🇯🇵', korean: '🇰🇷',
  vietnamese: '🇻🇳', ukrainian: '🇺🇦', polish: '🇵🇱', hindi: '🇮🇳',
  urdu: '🇵🇰', tagalog: '🇵🇭', filipino: '🇵🇭', persian: '🇮🇷', farsi: '🇮🇷',
  turkish: '🇹🇷', thai: '🇹🇭', nepali: '🇳🇵', somali: '🇸🇴',
  'american sign language': '🤟', asl: '🤟'
};

export function additionalSessionLanguages(details) {
  return publicSessionLanguages(details)
    .filter(({ language }) => !/^(english(?:\b.*)?|en(?:[-_](?:us|gb))?)$/i.test(language))
    .map(row => ({ ...row, flag: LANGUAGE_FLAGS[row.language.toLocaleLowerCase()] || '🌐' }));
}
