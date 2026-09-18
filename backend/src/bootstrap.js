/**
 * Bootstrap: bind PORT immediately, then load the full Express app. Liveness
 * remains available while imports load; readiness only succeeds after startup.
 *
 * If server.js fails to load, we keep the port bound and respond:
 *   GET /health|/healthz → 200 for liveness diagnostics
 *   GET /readyz and all other routes → 503
 * Cloud Run's HTTP startup probe must use /readyz, not the open TCP socket.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bootstrapResponse } from './utils/bootstrapHealth.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = '0.0.0.0';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let appLoaded = false;
let loadError = null;

const placeholder = (req, res) => {
  const result = bootstrapResponse(req.url, { appLoaded, loadError });
  res.writeHead(result.statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result.body));
};

async function runStartupMigrations() {
  try {
    const migrationsDir = path.join(__dirname, '../database/migrations');
    if (!fs.existsSync(migrationsDir)) {
      console.log('⚠️  Migrations directory not found, skipping startup migrations');
      return;
    }

    const { default: pool } = await import('./config/database.js');

    // Ensure the migrations_log tracking table exists (same schema as run-migrations.js).
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations_log (
        id INT AUTO_INCREMENT PRIMARY KEY,
        migration_name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        execution_time_ms INT,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        INDEX idx_migration_name (migration_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql') && f !== '000_consolidated_fresh_database.sql')
      .sort();

    // Fetch all already-successful migrations in one query.
    const [logRows] = await pool.query(
      'SELECT migration_name FROM migrations_log WHERE success = 1'
    );
    const applied = new Set(logRows.map(r => r.migration_name));

    let ran = 0;
    let skipped = 0;

    for (const file of files) {
      const migrationName = file.replace(/\.sql$/, '');
      if (applied.has(migrationName)) {
        skipped++;
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      // Strip line comments then split on unquoted semicolons (mirrors run-migrations.js logic).
      const stripped = sql.split('\n').map(l => /^\s*(--|#)/.test(l) ? '' : l).join('\n');
      const statements = stripped.split(';').map(s => s.trim()).filter(Boolean);

      const startTime = Date.now();
      let errorMsg = null;
      try {
        for (const stmt of statements) {
          try {
            await pool.query(stmt);
          } catch (err) {
            const msg = String(err?.message || '');
            const code = String(err?.code || '');
            const ignorable =
              msg.includes('already exists') ||
              msg.includes('Duplicate column') ||
              msg.includes('Duplicate key name') ||
              msg.includes("doesn't exist") ||
              msg.includes('check that it exists') ||
              code === 'ER_FK_DUP_NAME' ||
              err.errno === 1022 ||
              err.errno === 1060 ||
              err.errno === 1061;
            if (!ignorable) throw err;
          }
        }
        const ms = Date.now() - startTime;
        await pool.query(
          `INSERT INTO migrations_log (migration_name, execution_time_ms, success, error_message)
           VALUES (?, ?, 1, NULL)
           ON DUPLICATE KEY UPDATE executed_at = CURRENT_TIMESTAMP, execution_time_ms = ?, success = 1, error_message = NULL`,
          [migrationName, ms, ms]
        );
        ran++;
      } catch (err) {
        errorMsg = String(err?.message || err);
        const ms = Date.now() - startTime;
        await pool.query(
          `INSERT INTO migrations_log (migration_name, execution_time_ms, success, error_message)
           VALUES (?, ?, 0, ?)
           ON DUPLICATE KEY UPDATE executed_at = CURRENT_TIMESTAMP, execution_time_ms = ?, success = 0, error_message = ?`,
          [migrationName, ms, errorMsg, ms, errorMsg]
        ).catch(() => {});
        console.warn(`⚠️  Migration ${file} failed (non-fatal): ${errorMsg}`);
      }
    }

    console.log(`✅ Startup migrations complete — ${ran} applied, ${skipped} skipped (already run)`);
  } catch (err) {
    console.error('⚠️  Startup migrations failed (non-fatal):', err?.message || err);
  }
}

const server = http.createServer(placeholder);

server.listen(PORT, HOST, () => {
  console.log(`🚀 Listening on http://${HOST}:${PORT} (bootstrap phase)`);

  runStartupMigrations()
    .then(async () => {
      const { requireSecurityReadiness } = await import('./services/securityEvidence.service.js');
      await requireSecurityReadiness();
    })
    .then(() => import('./server.js'))
    .then(({ app }) => {
      if (typeof app !== 'function') throw new Error('server.js did not export a valid Express app');
      server.removeAllListeners('request');
      server.on('request', app);
      appLoaded = true;
      console.log('✅ Full application loaded — serving live traffic');
    })
    .catch((err) => {
      loadError = String(err?.message || err);
      console.error('❌ Failed to load application — staying up in degraded mode:', err);
      // Keep liveness diagnostics available, but readiness remains 503 so this
      // revision cannot pass the HTTP startup probe or serve application traffic.
    });
});

server.on('error', (err) => {
  console.error('❌ Bootstrap server bind error — cannot recover:', err);
  process.exit(1); // Only exit on bind failure; we cannot serve at all.
});

process.once('SIGTERM', () => {
  // Cloud Run grants a short shutdown window. Stop accepting work, finish
  // existing responses, then drain their final evidence writes before exiting.
  const deadline = setTimeout(() => process.exit(1), 9000);
  deadline.unref();
  server.close(async () => {
    try {
      const { flushSecurityEvidence } = await import('./services/securityEvidence.service.js');
      await flushSecurityEvidence();
      process.exit(0);
    } catch { process.exit(1); }
  });
});
