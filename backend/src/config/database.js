import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from cwd first, then backend/.env for vars not set (e.g. `node database/run-migrations.js`
// from repo root, where credentials live in backend/.env).
// dotenv does not override existing env vars or keys already set by an earlier load.
dotenv.config();
dotenv.config({ path: path.join(__dirname, '../../.env') });

// Detect if DB_HOST is a Unix socket path (Cloud SQL) or TCP host
const dbHost = process.env.DB_HOST || 'localhost';
const isUnixSocket = dbHost.startsWith('/cloudsql/') || dbHost.startsWith('/');

// Build connection configuration
// IMPORTANT: mysql2's pool.execute() caches prepared statements per connection
// (default maxPreparedStatements=16000). Dynamic SQL (IN (...), SET col=?) creates
// unique statement keys that never reuse, and those handles are GLOBAL on MySQL
// (max_prepared_stmt_count ≈ 16382). Keep the client cache small so LRU closes
// old statements, and keep connectionLimit modest across Cloud Run replicas.
const poolConfig = {
  user: process.env.DB_USER || 'onboarding_user',
  password: process.env.DB_PASSWORD || 'onboarding_pass',
  database: process.env.DB_NAME || 'onboarding_stage',
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT, 10) || 20,
  maxIdle: parseInt(process.env.DB_MAX_IDLE, 10) || 10,
  idleTimeout: parseInt(process.env.DB_IDLE_TIMEOUT_MS, 10) || 60000,
  // Cap cached prepared statements per connection; excess are closed via LRU.
  // 200 × connectionLimit(20) = 4,000 global max — safely under MySQL's 16,382 cap.
  maxPreparedStatements: parseInt(process.env.DB_MAX_PREPARED_STATEMENTS, 10) || 200,
  queueLimit: 0,
  connectTimeout: 60000, // 60 seconds connection timeout
  timezone: '+00:00', // Force UTC timezone for all connections
  enableKeepAlive: true, // Keep connections alive
  keepAliveInitialDelay: 0, // Start keep-alive immediately
  // Handshake + session collation must match table collation (utf8mb4_unicode_ci).
  // MySQL 8 otherwise uses utf8mb4_0900_ai_ci for bound params and literals,
  // which throws "Illegal mix of collations" on public ROI / intake lookups.
  charset: 'utf8mb4_unicode_ci'
};

// Use socketPath for Unix socket connections (Cloud SQL), host/port for TCP
if (isUnixSocket) {
  poolConfig.socketPath = dbHost;
} else {
  poolConfig.host = dbHost;
  poolConfig.port = parseInt(process.env.DB_PORT) || 3307;
}

// Debug logging: Log connection configuration (password masked)
const maskedPassword = poolConfig.password ? '*'.repeat(Math.min(poolConfig.password.length, 8)) : 'not set';
console.log('🔍 Database connection configuration:');
console.log('  - Database name:', poolConfig.database);
console.log('  - Database user:', poolConfig.user);
console.log('  - Database password:', maskedPassword);
if (isUnixSocket) {
  console.log('  - Connection type: Unix socket');
  console.log('  - Socket path:', poolConfig.socketPath);
} else {
  console.log('  - Connection type: TCP');
  console.log('  - Host:', poolConfig.host);
  console.log('  - Port:', poolConfig.port);
}
console.log('  - Connection limit:', poolConfig.connectionLimit);
console.log('  - Max idle / idle timeout:', poolConfig.maxIdle, '/', poolConfig.idleTimeout, 'ms');
console.log('  - Max prepared statements/conn:', poolConfig.maxPreparedStatements);
console.log('  - Connection timeout:', poolConfig.connectTimeout, 'ms');

const pool = mysql.createPool(poolConfig);

// mysql2 handshake collation can be overwritten by Cloud SQL init_connect
// (`SET NAMES utf8mb4` → utf8mb4_0900_ai_ci on MySQL 8). Pin unicode_ci
// before the connection is used so bound params match schema tables.
const corePool = pool.pool;
const originalGetConnection = corePool.getConnection.bind(corePool);
corePool.getConnection = function getConnectionWithUnicodeCollation(cb) {
  originalGetConnection((err, connection) => {
    if (err || !connection) return cb(err, connection);
    if (connection.__pthqUnicodeNames) return cb(null, connection);
    connection.query('SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci', (setErr) => {
      if (setErr) {
        try { connection.destroy(); } catch { /* ignore */ }
        return cb(setErr);
      }
      connection.__pthqUnicodeNames = true;
      return cb(null, connection);
    });
  });
};

/**
 * Memoize information_schema lookups.
 *
 * The codebase probes information_schema in ~390 places to stay compatible with
 * databases that predate a given migration ("does this column exist yet?"). Each probe
 * costs 45-120ms, and a single page load can fan out to over a hundred API requests,
 * so these dominate request latency even though the answer never changes while the
 * process is running.
 *
 * Results are cached by SQL + params for a short TTL. The TTL (rather than caching
 * for the process lifetime) means a migration applied against a running server is
 * picked up without a restart. Concurrent identical probes share one round-trip.
 *
 * Set DB_SCHEMA_CACHE=0 to disable.
 */
const SCHEMA_CACHE_ENABLED = process.env.DB_SCHEMA_CACHE !== '0';
const SCHEMA_CACHE_TTL_MS = parseInt(process.env.DB_SCHEMA_CACHE_TTL_MS, 10) || 60000;
const schemaCache = new Map(); // key -> { expiresAt, promise }

const isSchemaIntrospection = (sql) =>
  typeof sql === 'string' && sql.toLowerCase().includes('information_schema');

/**
 * Table-write notifications, so model-layer caches can invalidate without every
 * write site having to remember to do so. Writes to user_agencies in particular are
 * spread across 20+ controllers and services.
 *
 * Models register here rather than this file importing them, which would be a
 * circular dependency (models import the pool).
 */
const tableWriteListeners = new Map(); // lowercased table name -> Set<fn>

export function onTableWrite(tableName, listener) {
  const key = String(tableName).toLowerCase();
  if (!tableWriteListeners.has(key)) tableWriteListeners.set(key, new Set());
  tableWriteListeners.get(key).add(listener);
  return () => tableWriteListeners.get(key)?.delete(listener);
}

const WRITE_STATEMENT = /^\s*(?:insert|update|delete|replace|truncate)\b/i;

function notifyTableWrites(sql) {
  if (!tableWriteListeners.size) return;
  if (typeof sql !== 'string' || !WRITE_STATEMENT.test(sql)) return;
  const lowered = sql.toLowerCase();
  for (const [table, listeners] of tableWriteListeners) {
    if (!lowered.includes(table)) continue;
    for (const listener of listeners) {
      try {
        listener();
      } catch {
        // A misbehaving cache listener must not fail the query.
      }
    }
  }
}

// Return a defensive copy so a caller mutating rows cannot corrupt the cached value.
const cloneResult = ([rows, fields]) => [
  Array.isArray(rows) ? rows.map((r) => (r && typeof r === 'object' ? { ...r } : r)) : rows,
  fields
];

// Slow-query logging. Enable with DB_TIMING_DEBUG=1, threshold via DB_TIMING_DEBUG_MS.
const DB_TIMING_DEBUG = process.env.DB_TIMING_DEBUG === '1';
const DB_TIMING_DEBUG_MS = parseInt(process.env.DB_TIMING_DEBUG_MS, 10) || 150;

for (const method of ['execute', 'query']) {
  const original0 = pool[method].bind(pool);
  const original = DB_TIMING_DEBUG
    ? async (sql, params, ...rest) => {
        const t0 = process.hrtime.bigint();
        try {
          return await original0(sql, params, ...rest);
        } finally {
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          if (ms >= DB_TIMING_DEBUG_MS) {
            const text = (typeof sql === 'string' ? sql : sql?.sql || '')
              .replace(/\s+/g, ' ')
              .trim()
              .slice(0, 160);
            console.warn(`[db] ${ms.toFixed(0)}ms  ${text}`);
          }
        }
      }
    : original0;

  pool[method] = function poolInterceptor(sql, params, ...rest) {
    const sqlText = typeof sql === 'string' ? sql : sql?.sql;

    // Let model-layer caches know when a table they depend on is written to.
    notifyTableWrites(sqlText);

    // Only intercept the simple (sql, params?) promise form used by schema probes.
    if (
      !SCHEMA_CACHE_ENABLED ||
      !isSchemaIntrospection(sqlText) ||
      typeof params === 'function' ||
      rest.length > 0
    ) {
      return original(sql, params, ...rest);
    }

    const key = `${sqlText}::${params ? JSON.stringify(params) : ''}`;
    const now = Date.now();
    const hit = schemaCache.get(key);
    if (hit && hit.expiresAt > now) {
      return hit.promise.then(cloneResult);
    }

    const promise = original(sql, params).catch((err) => {
      // Never cache failures; the next caller should retry.
      schemaCache.delete(key);
      throw err;
    });
    schemaCache.set(key, { expiresAt: now + SCHEMA_CACHE_TTL_MS, promise });

    // Bound memory in case of highly dynamic probe SQL.
    if (schemaCache.size > 2000) {
      for (const [k, v] of schemaCache) {
        if (v.expiresAt <= now) schemaCache.delete(k);
      }
    }

    return promise.then(cloneResult);
  };
}

// Track connection readiness
let isConnectionReady = false;
export const waitForConnection = () => {
  return new Promise((resolve) => {
    if (isConnectionReady) {
      resolve();
      return;
    }
    const checkInterval = setInterval(() => {
      if (isConnectionReady) {
        clearInterval(checkInterval);
        resolve();
      }
    }, 500);
    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(checkInterval);
      resolve(); // Resolve anyway to not block forever
    }, 30000);
  });
};

// Handle pool-level errors
pool.on('error', (err) => {
  console.error('❌ Database pool error:');
  console.error('  - Error message:', err.message);
  console.error('  - Error code:', err.code);
  console.error('  - SQL state:', err.sqlState);
  if (err.stack) {
    console.error('  - Stack trace:', err.stack);
  }
});

// Set timezone to UTC for all connections and handle connection errors
pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
  
  // Handle connection-level errors (e.g., connection lost)
  connection.on('error', (err) => {
    const msg = String(err?.message || '');
    const benignPoolChurn =
      err.code === 'PROTOCOL_CONNECTION_LOST' ||
      err.code === 'ECONNRESET' ||
      msg.includes('Unexpected packet while no commands in the queue');
    if (benignPoolChurn) {
      console.warn('⚠️  Database connection dropped (pool will replace):', msg);
    } else {
      console.error('❌ Database connection error:', err.message);
    }
  });
});

// Test connection with retry logic
let connectionRetries = 0;
const maxRetries = 5;
const retryDelay = 2000; // 2 seconds

const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Database connected successfully');
    console.log('  - Connected to database:', poolConfig.database);
    // Ensure timezone is set
    await connection.query("SET time_zone = '+00:00'");
    connection.release();
    connectionRetries = 0; // Reset retry counter on success
    isConnectionReady = true; // Mark connection as ready
  } catch (err) {
    connectionRetries++;
    if (connectionRetries < maxRetries) {
      console.warn(`⚠️  Database connection attempt ${connectionRetries}/${maxRetries} failed, retrying in ${retryDelay}ms...`);
      console.warn(`  - Error: ${err.message}`);
      setTimeout(testConnection, retryDelay);
    } else {
      console.error('❌ Database connection error after', maxRetries, 'attempts:');
      console.error('  - Error message:', err.message);
      console.error('  - Error code:', err.code);
      console.error('  - SQL state:', err.sqlState);
      console.error('  - SQL message:', err.sqlMessage);
      console.error('  - Attempted database:', poolConfig.database);
      console.error('  - Connection config:', {
        user: poolConfig.user,
        host: poolConfig.host || poolConfig.socketPath,
        port: poolConfig.port || 'N/A (Unix socket)',
        database: poolConfig.database
      });
      if (err.stack) {
        console.error('  - Stack trace:', err.stack);
      }
      console.error('\n💡 Make sure Cloud SQL Proxy is running:');
      console.error('   cloud-sql-proxy ptonboard-dev:us-west3:ptonboard-mysql --port 3307');
    }
  }
};

// Start connection test (skip during unit tests)
if (process.env.NODE_ENV !== 'test' && process.env.SKIP_DB_CONNECT !== '1') {
  testConnection();
}

export default pool;

