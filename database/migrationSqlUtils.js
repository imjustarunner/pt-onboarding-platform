/**
 * Shared SQL parsing/helpers for main and clinical migration runners.
 */

/**
 * Split a SQL string on `;` boundaries, respecting quoted strings and BEGIN…END blocks.
 */
export function splitSqlStatements(sql) {
  const out = [];
  let buf = '';
  let inSingle = false;
  let inDouble = false;
  let inBacktick = false;
  let beginDepth = 0;
  let wordBuf = '';
  let lastWord = '';

  for (let i = 0; i < sql.length; i += 1) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (inSingle) {
      buf += ch;
      if (ch === '\\' && next != null) { buf += next; i += 1; continue; }
      if (ch === "'") {
        if (next === "'") { buf += next; i += 1; continue; }
        inSingle = false;
      }
      continue;
    }
    if (inDouble) {
      buf += ch;
      if (ch === '\\' && next != null) { buf += next; i += 1; continue; }
      if (ch === '"') {
        if (next === '"') { buf += next; i += 1; continue; }
        inDouble = false;
      }
      continue;
    }
    if (inBacktick) {
      buf += ch;
      if (ch === '`') inBacktick = false;
      continue;
    }
    if (ch === "'") { inSingle = true; buf += ch; continue; }
    if (ch === '"') { inDouble = true; buf += ch; continue; }
    if (ch === '`') { inBacktick = true; buf += ch; continue; }

    if (/[A-Za-z_0-9]/.test(ch)) {
      wordBuf += ch;
    } else if (wordBuf) {
      const kw = wordBuf.toUpperCase();
      if (kw === 'BEGIN') beginDepth += 1;
      lastWord = kw;
      wordBuf = '';
    }

    if (ch === ';') {
      if (lastWord === 'END') {
        beginDepth = Math.max(0, beginDepth - 1);
      }
      if (beginDepth > 0) {
        buf += ch;
        continue;
      }
      const trimmed = buf.trim();
      if (trimmed) out.push(trimmed);
      buf = '';
      lastWord = '';
      continue;
    }
    buf += ch;
  }
  if (wordBuf) {
    const kw = wordBuf.toUpperCase();
    if (kw === 'BEGIN') beginDepth += 1;
  }
  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}

export function stripSqlLineComments(sql) {
  return sql
    .split('\n')
    .map((line) => {
      const t = line.trimStart();
      if (t.startsWith('--') || t.startsWith('#')) return '';
      return line;
    })
    .join('\n');
}

export function isIgnorableSchemaError(err) {
  const code = String(err?.code || '');
  const errno = Number(err?.errno || 0);
  const msg = String(err?.message || '');
  return (
    code === 'ER_DUP_FIELDNAME' || errno === 1060 || msg.includes('Duplicate column name')
    || code === 'ER_DUP_KEYNAME' || errno === 1061 || msg.includes('Duplicate key name')
    || code === 'ER_DUP_ENTRY' || errno === 1062
    || code === 'ER_FK_DUP_NAME' || errno === 1826 || msg.includes('Duplicate foreign key constraint name')
    || code === 'ER_TABLE_EXISTS_ERROR' || errno === 1050 || msg.includes('already exists')
  );
}
