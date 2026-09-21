// CLI and Cloud Run startup must execute the same SQL statements.
export { splitSqlStatements, stripSqlLineComments, isIgnorableSchemaError } from '../backend/src/utils/migrationSql.js';
