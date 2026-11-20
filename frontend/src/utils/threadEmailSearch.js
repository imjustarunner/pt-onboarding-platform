function normalize(text) {
  return String(text || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function words(text) {
  return text.match(/[\p{L}\p{N}]+/gu) || [];
}

function sameLetters(left, right) {
  return left.length === right.length && [...left].sort().join('') === [...right].sort().join('');
}

function termScore(term, text, tokens) {
  if (tokens.includes(term)) return 4;
  if (text.includes(term)) return 2;
  if (term.length >= 3 && tokens.some(token => sameLetters(term, token))) return 1;
  return 0;
}

export function rankEmailMessages(entries, query) {
  const phrase = normalize(query).trim();
  const terms = [...new Set(words(phrase))];
  if (!terms.length) return entries.map(entry => entry.message);

  const matches = [];
  for (const entry of entries) {
    const header = normalize(entry.header);
    const body = normalize(entry.body);
    const headerWords = words(header);
    const bodyWords = words(body);
    const scores = terms.map(term => Math.max(
      2 * termScore(term, header, headerWords),
      termScore(term, body, bodyWords)
    ));
    if (scores.some(score => !score)) continue;
    const phraseScore = header.includes(phrase) ? 8 : body.includes(phrase) ? 4 : 0;
    matches.push({ message: entry.message, score: phraseScore + scores.reduce((sum, score) => sum + score, 0) });
  }

  return matches.sort((a, b) => b.score - a.score).map(match => match.message);
}
