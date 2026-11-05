// Letters may appear in any order. Counts still have to fit the name.
export function letterMatchSql(expressions, raw) {
  const letters = String(raw || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!letters || !expressions?.length) return { sql: '1=1', params: [] };
  const counts = new Map();
  for (const letter of letters) counts.set(letter, (counts.get(letter) || 0) + 1);
  const haystack = `LOWER(CONCAT_WS(' ', ${expressions.join(', ')}))`;
  const parts = [];
  const params = [];
  for (const [letter, count] of counts) {
    parts.push(`(CHAR_LENGTH(${haystack}) - CHAR_LENGTH(REPLACE(${haystack}, ?, ''))) >= ?`);
    params.push(letter, count);
  }
  return { sql: `(${parts.join(' AND ')})`, params };
}
