// MySQL's prepared statement limit is shared by every connection, database,
// application replica and preview revision on the server. With 40 replicas,
// the defaults below cache at most (20 + 10) * 8 * 40 = 9,600 statements,
// leaving headroom below the server's 16,382 limit for rollouts and other clients.
// Recheck that fleet-wide budget before increasing these environment settings.
export function databasePoolLimits(env = process.env, { clinical = false } = {}) {
  const prefix = clinical ? 'CLINICAL_DB_' : 'DB_';
  const integer = (suffix, fallback, minimum = 1) => {
    const key = `${prefix}${suffix}`;
    const raw = env[key];
    if (raw === undefined || raw === '') return fallback;
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value < minimum) {
      throw new Error(`${key} must be an integer greater than or equal to ${minimum}`);
    }
    return value;
  };
  const connectionLimit = integer('CONNECTION_LIMIT', clinical ? 10 : 20);
  return {
    connectionLimit,
    maxIdle: Math.min(connectionLimit, integer('MAX_IDLE', clinical ? 5 : 10, 0)),
    idleTimeout: integer('IDLE_TIMEOUT_MS', 60000),
    // mysql2 interprets zero as its 16,000-statement default, not "disabled".
    maxPreparedStatements: integer('MAX_PREPARED_STATEMENTS', 8)
  };
}
