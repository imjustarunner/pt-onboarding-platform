// SQLite returns unquoted JSON strings and numeric booleans. Adapt only these
// MySQL dialect functions; execute the production joins/predicates unchanged.
export const hiringSqliteRead = sql => sql.replace(
  /JSON_UNQUOTE\(JSON_EXTRACT\(([^,()]+),\s*('[^']+')\)\)/g,
  (_, column, path) => `(CASE json_type(${column}, ${path}) WHEN 'true' THEN 'true' WHEN 'false' THEN 'false' ELSE json_extract(${column}, ${path}) END)`
).replace(/\bNOW\(\)/g, 'CURRENT_TIMESTAMP');
