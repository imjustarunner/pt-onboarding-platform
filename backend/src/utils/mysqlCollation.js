/** Schema-standard collation. MySQL 8 connections default to utf8mb4_0900_ai_ci. */
export const MYSQL_UNICODE_COLLATION = 'utf8mb4_unicode_ci';

export const MYSQL_SET_NAMES_SQL = `SET NAMES utf8mb4 COLLATE ${MYSQL_UNICODE_COLLATION}`;

export function sqlCollate(expr) {
  return `${expr} COLLATE ${MYSQL_UNICODE_COLLATION}`;
}

export function sqlUnicodeEq(leftSql, rightSql) {
  return `${sqlCollate(leftSql)} = ${sqlCollate(rightSql)}`;
}

export function sqlUnicodeNe(leftSql, rightSql) {
  return `${sqlCollate(leftSql)} <> ${sqlCollate(rightSql)}`;
}

/** `column = ?` that cannot mix connection 0900 with a unicode_ci column. */
export function sqlUnicodeParam(columnSql) {
  return `${sqlCollate(columnSql)} = CONVERT(? USING utf8mb4) COLLATE ${MYSQL_UNICODE_COLLATION}`;
}

export function sqlUnicodeLiteral(columnSql, literal) {
  const safe = String(literal ?? '').replace(/\\/g, '\\\\').replace(/'/g, "''");
  return sqlUnicodeEq(columnSql, `'${safe}'`);
}

/** Length check so emptiness tests do not compare mixed-collation strings. */
export function sqlNonEmpty(expr) {
  return `CHAR_LENGTH(TRIM(COALESCE(${expr}, ''))) > 0`;
}
