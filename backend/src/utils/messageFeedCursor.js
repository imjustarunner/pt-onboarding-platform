export function decodeMessageFeedCursor(value) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(String(value), 'base64url').toString());
    if (!Number.isFinite(Date.parse(cursor.at)) || ![0, 1].includes(cursor.source)
      || !Number.isSafeInteger(cursor.id) || cursor.id < 1) throw new Error();
    return cursor;
  } catch {
    throw Object.assign(new Error('Invalid messages cursor.'), { status: 400 });
  }
}

export function messageFeedBoundary(cursor, source, activitySql, idSql, oldest) {
  if (!cursor) return { sql: '', params: [] };
  const operator = oldest ? '>' : '<';
  const at = new Date(cursor.at);
  if (source === cursor.source) {
    return { sql: `AND (${activitySql} ${operator} ? OR (${activitySql} = ? AND ${idSql} ${operator} ?))`, params: [at, at, cursor.id] };
  }
  const includeEqual = oldest ? source > cursor.source : source < cursor.source;
  return { sql: `AND ${activitySql} ${operator}${includeEqual ? '=' : ''} ?`, params: [at] };
}

export function messageFeedPosition(row) {
  return { at: row.sortAt, source: row.conversationId ? 1 : 0, id: row.conversationId || row.threadId };
}
