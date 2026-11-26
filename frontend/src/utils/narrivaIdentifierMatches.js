const escape = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const excludedRoles = new Set(['client', 'provider', 'guardian']);
const maxMatches = 30;
const identifierPatterns = [
  ['Email address', /\b[\w.+%-]+@[\w.-]+\.[a-z]{2,}\b/gi],
  ['Social Security number', /\b\d{3}-\d{2}-\d{4}\b/g],
  ['Phone number', /(?:\+?1[ .-]?)?\(?\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b/g],
  ['Birth date', /\b(?:DOB|date of birth)\s*[:#]?\s*(?:\d{1,4}[./-]\d{1,2}[./-]\d{1,4}|[A-Z][a-z]{2,8}\s+\d{1,2},?\s+\d{4})\b/gi],
  ['Medical record or member ID', /\b(?:MRN|member id)\s*(?:[:#]\s*(?!not\b|unknown\b|none\b|withheld\b)[\w-]+|(?=[\w-]*\d)[\w-]+)\b/gi]
];

export function narrivaIdentifierMatches(text, knownIdentifiers = []) {
  const value = String(text || '');
  if (!value) return [];
  const matches = [];
  const addMatches = (label, pattern) => {
    for (const match of value.matchAll(pattern)) {
      if (matches.length >= maxMatches) break;
      matches.push({ label, start: match.index, end: match.index + match[0].length });
    }
  };
  for (const [label, pattern] of identifierPatterns) addMatches(label, pattern);
  const names = new Set(knownIdentifiers.flatMap(identifier => {
    const name = String(identifier || '').trim();
    return [name, ...name.split(/\s+/).map(part => {
      const characters = [...part];
      return characters.length > 3 ? characters.slice(0, 3).join('') + '*' : part;
    })];
  }));
  for (const name of names) {
    if (matches.length >= maxMatches) break;
    if (name.length < 3 || excludedRoles.has(name.toLowerCase())) continue;
    addMatches('Name or known identifier', new RegExp(`(?<![\\p{L}\\p{N}])${escape(name)}(?![\\p{L}\\p{N}])`, 'giu'));
  }
  return matches.sort((left, right) => left.start - right.start || right.end - left.end)
    .filter((match, index, ordered) => !index || match.start !== ordered[index - 1].start);
}
