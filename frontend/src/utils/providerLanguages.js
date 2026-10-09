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
